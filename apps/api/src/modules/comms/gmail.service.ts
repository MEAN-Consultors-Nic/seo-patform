import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOAuthService } from '../google-integrations/google-oauth.service';

export interface GmailSendInput {
  /** userId whose Gmail account will authorize the send. */
  userId: string;
  to: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  cc?: string[];
  bcc?: string[];
  /** File attachments (name + base64 content). */
  attachments?: Array<{
    filename: string;
    /** Base64-encoded payload (without the data: URL prefix). */
    contentBase64: string;
    mimeType?: string;
  }>;
  /** Optional Reply-To header (useful for send-on-behalf setups). */
  replyTo?: string;
}

export interface GmailSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an outbound email through the caller's connected Gmail
 * account. Authenticates via the same per-user OAuth token used by
 * GSC/GA4 (Core Slice 1.2) — requires the `gmail.send` scope, which
 * gets requested during the OAuth flow after Phase 3 lands.
 */
@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  async send(input: GmailSendInput): Promise<GmailSendResult> {
    if (!input.userId) {
      throw new BadRequestException('userId is required to send email.');
    }
    if (!input.to?.length) {
      throw new BadRequestException('at least one recipient is required.');
    }

    let auth;
    try {
      auth = await this.oauth.getAuthorizedClient(input.userId);
    } catch (e) {
      const msg =
        (e as Error).message ||
        'The connected Google account is not authorized to send email.';
      return { ok: false, error: msg };
    }
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = this.buildRawMime(input);

    try {
      const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
      return { ok: true, messageId: res.data.id ?? undefined };
    } catch (e) {
      const err = e as { message?: string; errors?: Array<{ message?: string }> };
      const message =
        err.errors?.[0]?.message ||
        err.message ||
        'Gmail rejected the send request.';
      this.logger.warn(`Gmail send failed for user ${input.userId}: ${message}`);
      // Common case: user hasn't re-authorized after the gmail.send
      // scope was added. Surface a clear next-step for the operator.
      const scopeIssue =
        typeof err.message === 'string' &&
        (err.message.includes('insufficient authentication scopes') ||
          err.message.includes('invalid_scope'));
      return {
        ok: false,
        error: scopeIssue
          ? 'Gmail send permission was not granted. Reconnect your Google account in Settings → My Integrations.'
          : message,
      };
    }
  }

  /**
   * Assembles a RFC 5322 message (multipart/alternative + optional
   * attachments) and base64url-encodes it as Gmail expects. Kept
   * inline here rather than pulling in a mailer library: Gmail's
   * `raw` field wants the entire message, not a builder object.
   */
  private buildRawMime(input: GmailSendInput): string {
    const boundary = `msh-mixed-${Date.now().toString(36)}`;
    const altBoundary = `msh-alt-${Date.now().toString(36)}`;
    const hasAttachments =
      Array.isArray(input.attachments) && input.attachments.length > 0;

    const headers: string[] = [
      `To: ${input.to.join(', ')}`,
      `Subject: ${this.encodeMimeHeader(input.subject)}`,
      'MIME-Version: 1.0',
    ];
    if (input.cc?.length) headers.push(`Cc: ${input.cc.join(', ')}`);
    if (input.bcc?.length) headers.push(`Bcc: ${input.bcc.join(', ')}`);
    if (input.replyTo) headers.push(`Reply-To: ${input.replyTo}`);

    if (hasAttachments) {
      headers.push(
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
      );
    } else {
      headers.push(
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
      );
    }

    const bodyParts: string[] = [];
    const buildAltBlock = (opening: string) => {
      const alt: string[] = [opening];
      alt.push(
        `--${altBoundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        input.textBody || this.stripHtml(input.htmlBody),
        '',
      );
      alt.push(
        `--${altBoundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        input.htmlBody,
        '',
      );
      alt.push(`--${altBoundary}--`, '');
      return alt.join('\r\n');
    };

    if (hasAttachments) {
      bodyParts.push(
        `--${boundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        '',
      );
      bodyParts.push(buildAltBlock(''));
      for (const att of input.attachments!) {
        const mime = att.mimeType || 'application/octet-stream';
        bodyParts.push(
          `--${boundary}`,
          `Content-Type: ${mime}; name="${att.filename}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${att.filename}"`,
          '',
          this.chunkBase64(att.contentBase64),
          '',
        );
      }
      bodyParts.push(`--${boundary}--`, '');
    } else {
      bodyParts.push(buildAltBlock(''));
    }

    const raw = headers.join('\r\n') + bodyParts.join('\r\n');
    return Buffer.from(raw, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Some SMTP servers reject base64 lines longer than 998 chars. Gmail
   * doesn't strictly require it, but chunking keeps the raw message
   * legible in logs.
   */
  private chunkBase64(b64: string): string {
    return b64.replace(/.{76}/g, '$&\r\n');
  }

  /**
   * MIME-encodes a subject that contains non-ASCII characters using
   * RFC 2047 base64 encoding. Leaves plain ASCII subjects untouched.
   */
  private encodeMimeHeader(value: string): string {
    // Fast path: only encode when there's a non-ASCII char to justify it.
    if (/^[\x20-\x7E]*$/.test(value)) return value;
    return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
  }
}
