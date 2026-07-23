/**
 * GSC returns country codes as ISO 3166-1 alpha-3 (lowercase: usa,
 * mex, prc, gbr…). The browser's Intl.DisplayNames API expects
 * alpha-2. This module bridges the two so we can render friendly
 * country names ("United States") next to the raw code.
 *
 * Fallbacks: unknown alpha-3 → uppercase code, so nothing breaks if
 * Google ever returns a code we haven't mapped.
 */

// Compact alpha-3 → alpha-2 map covering the ~180 most common
// countries. Aligned with ISO 3166-1. Kept in a plain object for
// tree-shaking friendliness — no need for a JSON asset.
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  afg: 'AF', alb: 'AL', dza: 'DZ', asm: 'AS', and: 'AD', ago: 'AO', aia: 'AI',
  ata: 'AQ', atg: 'AG', arg: 'AR', arm: 'AM', abw: 'AW', aus: 'AU', aut: 'AT',
  aze: 'AZ', bhs: 'BS', bhr: 'BH', bgd: 'BD', brb: 'BB', blr: 'BY', bel: 'BE',
  blz: 'BZ', ben: 'BJ', bmu: 'BM', btn: 'BT', bol: 'BO', bih: 'BA', bwa: 'BW',
  bra: 'BR', vgb: 'VG', brn: 'BN', bgr: 'BG', bfa: 'BF', bdi: 'BI', khm: 'KH',
  cmr: 'CM', can: 'CA', cpv: 'CV', cym: 'KY', caf: 'CF', tcd: 'TD', chl: 'CL',
  chn: 'CN', prc: 'CN', hkg: 'HK', mac: 'MO', col: 'CO', com: 'KM', cog: 'CG',
  cod: 'CD', cok: 'CK', cri: 'CR', civ: 'CI', hrv: 'HR', cub: 'CU', cyp: 'CY',
  cze: 'CZ', dnk: 'DK', dji: 'DJ', dma: 'DM', dom: 'DO', ecu: 'EC', egy: 'EG',
  slv: 'SV', gnq: 'GQ', eri: 'ER', est: 'EE', swz: 'SZ', eth: 'ET', flk: 'FK',
  fro: 'FO', fji: 'FJ', fin: 'FI', fra: 'FR', pyf: 'PF', gab: 'GA', gmb: 'GM',
  geo: 'GE', deu: 'DE', gha: 'GH', gib: 'GI', grc: 'GR', grl: 'GL', grd: 'GD',
  gum: 'GU', gtm: 'GT', ggy: 'GG', gin: 'GN', gnb: 'GW', guy: 'GY', hti: 'HT',
  hnd: 'HN', hun: 'HU', isl: 'IS', ind: 'IN', idn: 'ID', irn: 'IR', irq: 'IQ',
  irl: 'IE', imn: 'IM', isr: 'IL', ita: 'IT', jam: 'JM', jpn: 'JP', jey: 'JE',
  jor: 'JO', kaz: 'KZ', ken: 'KE', kir: 'KI', prk: 'KP', kor: 'KR', kwt: 'KW',
  kgz: 'KG', lao: 'LA', lva: 'LV', lbn: 'LB', lso: 'LS', lbr: 'LR', lby: 'LY',
  lie: 'LI', ltu: 'LT', lux: 'LU', mdg: 'MG', mwi: 'MW', mys: 'MY', mdv: 'MV',
  mli: 'ML', mlt: 'MT', mhl: 'MH', mrt: 'MR', mus: 'MU', myt: 'YT', mex: 'MX',
  fsm: 'FM', mda: 'MD', mco: 'MC', mng: 'MN', mne: 'ME', msr: 'MS', mar: 'MA',
  moz: 'MZ', mmr: 'MM', nam: 'NA', nru: 'NR', npl: 'NP', nld: 'NL', ncl: 'NC',
  nzl: 'NZ', nic: 'NI', ner: 'NE', nga: 'NG', niu: 'NU', mkd: 'MK', mnp: 'MP',
  nor: 'NO', omn: 'OM', pak: 'PK', plw: 'PW', pse: 'PS', pan: 'PA', png: 'PG',
  pry: 'PY', per: 'PE', phl: 'PH', pcn: 'PN', pol: 'PL', prt: 'PT', pri: 'PR',
  qat: 'QA', reu: 'RE', rou: 'RO', rus: 'RU', rwa: 'RW', blm: 'BL', shn: 'SH',
  kna: 'KN', lca: 'LC', maf: 'MF', spm: 'PM', vct: 'VC', wsm: 'WS', smr: 'SM',
  stp: 'ST', sau: 'SA', sen: 'SN', srb: 'RS', syc: 'SC', sle: 'SL', sgp: 'SG',
  sxm: 'SX', svk: 'SK', svn: 'SI', slb: 'SB', som: 'SO', zaf: 'ZA', ssd: 'SS',
  esp: 'ES', lka: 'LK', sdn: 'SD', sur: 'SR', swe: 'SE', che: 'CH', syr: 'SY',
  twn: 'TW', tjk: 'TJ', tza: 'TZ', tha: 'TH', tls: 'TL', tgo: 'TG', tkl: 'TK',
  ton: 'TO', tto: 'TT', tun: 'TN', tur: 'TR', tkm: 'TM', tca: 'TC', tuv: 'TV',
  uga: 'UG', ukr: 'UA', are: 'AE', gbr: 'GB', usa: 'US', ury: 'UY', uzb: 'UZ',
  vut: 'VU', vat: 'VA', ven: 'VE', vnm: 'VN', vir: 'VI', wlf: 'WF', esh: 'EH',
  yem: 'YE', zmb: 'ZM', zwe: 'ZW',
};

let displayNames: Intl.DisplayNames | null = null;

/**
 * Renders a friendly country name from a GSC alpha-3 code. Falls
 * back to the uppercase code if the code isn't in the map (rare) or
 * if Intl.DisplayNames doesn't recognize the alpha-2 (very rare).
 */
export function countryDisplayName(code: string): string {
  if (!code) return '';
  const normalized = code.toLowerCase();
  const alpha2 = ALPHA3_TO_ALPHA2[normalized];
  if (!alpha2) return code.toUpperCase();
  try {
    if (!displayNames) {
      displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    }
    return displayNames.of(alpha2) || alpha2;
  } catch {
    return alpha2;
  }
}
