import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as net from 'node:net';

export interface DomainLookupResult {
  domain: string;
  ip?: string;
  ips?: string[];
  reverseDns?: string;
  hosting?: {
    asn?: string;
    org?: string;
    holder?: string;
    country?: string;
  };
  nameServers?: string[];
  dnsHostHint?: string;
  mxRecords?: Array<{ exchange: string; priority: number }>;
  emailHostHint?: string;
  registrar?: {
    name?: string;
    url?: string;
    ianaId?: string;
  };
  registeredAt?: string;
  expiresAt?: string;
  updatedAt?: string;
  errors?: string[];
}

@Injectable()
export class DomainToolsService {
  private readonly logger = new Logger(DomainToolsService.name);

  async lookup(rawDomain: string): Promise<DomainLookupResult> {
    const domain = this.normalize(rawDomain);
    const result: DomainLookupResult = { domain, errors: [] };

    await Promise.all([
      this.resolveDns(domain, result),
      this.resolveNs(domain, result),
      this.resolveMx(domain, result),
      this.whoisLookup(domain, result),
    ]);

    if (result.ip) await this.lookupAsn(result.ip, result);
    if (result.errors && result.errors.length === 0) delete result.errors;
    return result;
  }

  private normalize(input: string): string {
    if (!input) throw new BadRequestException('domain is required');
    let d = input.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
    d = d.replace(/^www\./, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
      throw new BadRequestException('Invalid domain');
    }
    return d;
  }

  private async resolveDns(domain: string, out: DomainLookupResult): Promise<void> {
    try {
      const ips = await dns.resolve4(domain);
      out.ips = ips;
      out.ip = ips[0];
      try {
        const ptr = await dns.reverse(out.ip);
        if (ptr.length) out.reverseDns = ptr[0];
      } catch {
        /* no reverse */
      }
    } catch (err) {
      out.errors?.push(`A record lookup failed: ${(err as Error).message}`);
    }
  }

  private async resolveNs(domain: string, out: DomainLookupResult): Promise<void> {
    try {
      const ns = await dns.resolveNs(domain);
      out.nameServers = ns.map((n) => n.toLowerCase()).sort();
      out.dnsHostHint = this.guessDnsHost(out.nameServers);
    } catch (err) {
      out.errors?.push(`NS lookup failed: ${(err as Error).message}`);
    }
  }

  private async resolveMx(domain: string, out: DomainLookupResult): Promise<void> {
    try {
      const mx = await dns.resolveMx(domain);
      out.mxRecords = mx
        .map((m) => ({ exchange: m.exchange.toLowerCase(), priority: m.priority }))
        .sort((a, b) => a.priority - b.priority);
      out.emailHostHint = this.guessEmailHost(out.mxRecords.map((m) => m.exchange));
    } catch {
      /* no MX */
    }
  }

  private async lookupAsn(ip: string, out: DomainLookupResult): Promise<void> {
    try {
      // ipinfo's free no-key endpoint embedded in their lite anycast
      const res = await fetch(`https://ipapi.is/?q=${ip}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          asn?: { asn?: number; org?: string; descr?: string; country?: string };
          company?: { name?: string };
          location?: { country?: string };
        };
        out.hosting = {
          asn: data.asn?.asn ? `AS${data.asn.asn}` : undefined,
          org: data.asn?.org || data.company?.name,
          holder: data.asn?.descr,
          country: data.location?.country || data.asn?.country,
        };
        return;
      }
    } catch (err) {
      this.logger.warn(`ipapi.is failed for ${ip}: ${(err as Error).message}`);
    }

    // Fallback: RIPE
    try {
      const res = await fetch(
        `https://stat.ripe.net/data/network-info.json?resource=${ip}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { data?: { asns?: string[]; prefix?: string } };
      const asn = data.data?.asns?.[0];
      if (asn) {
        const holder = await this.fetchAsnHolder(asn);
        out.hosting = {
          asn: `AS${asn}`,
          org: holder,
        };
      }
    } catch (err) {
      out.errors?.push(`ASN lookup failed: ${(err as Error).message}`);
    }
  }

  private async fetchAsnHolder(asn: string): Promise<string | undefined> {
    try {
      const res = await fetch(
        `https://stat.ripe.net/data/as-overview.json?resource=AS${asn}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return undefined;
      const data = (await res.json()) as { data?: { holder?: string } };
      return data.data?.holder;
    } catch {
      return undefined;
    }
  }

  private async whoisLookup(domain: string, out: DomainLookupResult): Promise<void> {
    try {
      const ianaResp = await this.whoisQuery('whois.iana.org', domain);
      const referral = /^refer:\s*(\S+)/im.exec(ianaResp)?.[1]?.toLowerCase();
      const finalResp = referral
        ? await this.whoisQuery(referral, domain).catch(() => ianaResp)
        : ianaResp;
      this.parseWhois(finalResp, out);
    } catch (err) {
      out.errors?.push(`WHOIS lookup failed: ${(err as Error).message}`);
    }
  }

  private whoisQuery(server: string, query: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server, port: 43, timeout: 8000 });
      const chunks: Buffer[] = [];
      socket.on('connect', () => socket.write(`${query}\r\n`));
      socket.on('data', (c) => chunks.push(c));
      socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`WHOIS ${server} timeout`));
      });
      socket.on('error', (err) => reject(err));
    });
  }

  private parseWhois(text: string, out: DomainLookupResult): void {
    const get = (keys: RegExp[]): string | undefined => {
      for (const re of keys) {
        const m = re.exec(text);
        if (m?.[1]) return m[1].trim();
      }
      return undefined;
    };

    const name = get([
      /^\s*Registrar:\s*(.+)$/im,
      /^\s*Sponsoring Registrar:\s*(.+)$/im,
      /^\s*Registrar Name:\s*(.+)$/im,
    ]);
    const url = get([/^\s*Registrar URL:\s*(.+)$/im, /^\s*Registrar WHOIS Server:\s*(.+)$/im]);
    const ianaId = get([/^\s*Registrar IANA ID:\s*(.+)$/im]);
    if (name || url || ianaId) out.registrar = { name, url, ianaId };

    out.registeredAt = this.parseDate(
      get([
        /^\s*Creation Date:\s*(.+)$/im,
        /^\s*Created On:\s*(.+)$/im,
        /^\s*created:\s*(.+)$/im,
        /^\s*Registered On:\s*(.+)$/im,
      ]),
    );
    out.expiresAt = this.parseDate(
      get([
        /^\s*Registry Expiry Date:\s*(.+)$/im,
        /^\s*Registrar Registration Expiration Date:\s*(.+)$/im,
        /^\s*Expiration Date:\s*(.+)$/im,
        /^\s*Expiry Date:\s*(.+)$/im,
        /^\s*expires:\s*(.+)$/im,
      ]),
    );
    out.updatedAt = this.parseDate(
      get([/^\s*Updated Date:\s*(.+)$/im, /^\s*Last Updated On:\s*(.+)$/im, /^\s*changed:\s*(.+)$/im]),
    );
  }

  private parseDate(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.replace(/\s+\(.*\)\s*$/, '').trim();
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  }

  private guessDnsHost(nameservers: string[]): string | undefined {
    const sample = nameservers.join(' ');
    const map: Array<[RegExp, string]> = [
      [/cloudflare\.com/i, 'Cloudflare'],
      [/awsdns/i, 'AWS Route 53'],
      [/azure-dns/i, 'Azure DNS'],
      [/googledomains|google\.com/i, 'Google'],
      [/dnsmadeeasy/i, 'DNS Made Easy'],
      [/dnsimple/i, 'DNSimple'],
      [/domaincontrol\.com/i, 'GoDaddy'],
      [/registrar-servers\.com/i, 'Namecheap'],
      [/wordpress\.com/i, 'WordPress.com'],
      [/wpengine/i, 'WP Engine'],
      [/squarespace/i, 'Squarespace'],
      [/wixdns/i, 'Wix'],
      [/shopify/i, 'Shopify'],
      [/hostgator/i, 'HostGator'],
      [/bluehost/i, 'Bluehost'],
      [/siteground/i, 'SiteGround'],
      [/dreamhost/i, 'DreamHost'],
      [/he\.net/i, 'Hurricane Electric'],
    ];
    for (const [re, label] of map) if (re.test(sample)) return label;
    return undefined;
  }

  private guessEmailHost(exchanges: string[]): string | undefined {
    const sample = exchanges.join(' ');
    const map: Array<[RegExp, string]> = [
      [/google|googlemail|aspmx/i, 'Google Workspace'],
      [/outlook\.com|protection\.outlook\.com|office365/i, 'Microsoft 365'],
      [/zoho/i, 'Zoho Mail'],
      [/protonmail/i, 'Proton Mail'],
      [/yahoodns/i, 'Yahoo'],
      [/mailgun/i, 'Mailgun'],
      [/sendgrid/i, 'SendGrid'],
      [/amazonses/i, 'Amazon SES'],
      [/migadu/i, 'Migadu'],
      [/fastmail/i, 'Fastmail'],
      [/secureserver\.net/i, 'GoDaddy Email'],
    ];
    for (const [re, label] of map) if (re.test(sample)) return label;
    return undefined;
  }
}
