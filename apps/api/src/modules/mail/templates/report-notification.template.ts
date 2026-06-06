import { format } from 'date-fns';

interface Input {
  recipients: string[];
  clientName: string;
  cycleLabel: string;
  cycleStart: Date;
  cycleEnd: Date;
  reportUrl: string;
  pin: string;
  preparedBy?: string;
}

const BRAND = '#FF7A59';
const INK_900 = '#0F172A';
const INK_700 = '#334155';
const INK_500 = '#64748B';
const INK_300 = '#CBD5E1';
const INK_100 = '#F1F5F9';
const INK_50 = '#F7F8FA';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderReportNotificationEmail(input: Input): {
  html: string;
  text: string;
} {
  const period = `${format(input.cycleStart, 'MMMM d')} – ${format(input.cycleEnd, 'MMMM d, yyyy')}`;
  const clientName = escapeHtml(input.clientName);
  const cycleLabel = escapeHtml(input.cycleLabel);
  const reportUrl = escapeHtml(input.reportUrl);
  const pin = escapeHtml(input.pin);
  const preparedBy = escapeHtml(input.preparedBy || 'Media Spearhead');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Your SEO report is ready</title>
  </head>
  <body style="margin:0; padding:0; background:${INK_50}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:${INK_900};">
    <!-- Preheader (hidden) -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      Your bi-weekly SEO report for ${clientName} is ready. Use PIN ${pin} to unlock.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${INK_50}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; border-radius:14px; overflow:hidden; box-shadow: 0 1px 4px rgba(15,23,42,0.06);">

            <!-- HEADER -->
            <tr>
              <td style="background:${INK_900}; padding:0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:${BRAND}; height:4px; line-height:4px; font-size:0;">&nbsp;</td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:28px 36px 22px 36px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td valign="middle" style="padding-right:12px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                              <tr>
                                <td style="background:${BRAND}; width:36px; height:36px; border-radius:6px; color:#ffffff; font-weight:800; font-size:16px; text-align:center; vertical-align:middle; font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;">S</td>
                              </tr>
                            </table>
                          </td>
                          <td valign="middle">
                            <div style="font-size:14px; font-weight:700; color:#ffffff; line-height:1.2;">MEDIA SPEARHEAD</div>
                            <div style="font-size:10px; letter-spacing:0.18em; color:rgba(255,255,255,0.55); text-transform:uppercase; margin-top:2px;">Digital Marketing · SEO</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- HERO -->
            <tr>
              <td style="padding:40px 36px 8px 36px;">
                <div style="font-size:10px; letter-spacing:0.3em; color:${BRAND}; font-weight:700; text-transform:uppercase; margin-bottom:14px;">
                  Bi-Weekly SEO Report
                </div>
                <h1 style="margin:0 0 8px 0; font-size:28px; line-height:1.18; color:${INK_900}; font-weight:800; letter-spacing:-0.01em;">
                  Your report for ${clientName}<br/>is ready to review
                </h1>
                <p style="margin:14px 0 0 0; font-size:15px; line-height:1.6; color:${INK_500};">
                  We have completed the SEO activities for the period
                  <strong style="color:${INK_900};">${period}</strong>.
                  Inside you'll find performance trends, position movements, the actions we executed, and what's planned next.
                </p>
              </td>
            </tr>

            <!-- DIVIDER -->
            <tr>
              <td style="padding:28px 36px 0 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="height:1px; background:${INK_100}; line-height:1px; font-size:0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- PIN BLOCK -->
            <tr>
              <td style="padding:28px 36px 8px 36px;">
                <div style="font-size:10px; letter-spacing:0.18em; font-weight:700; color:${INK_500}; text-transform:uppercase; margin-bottom:10px;">
                  🔐 Access PIN
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:${INK_50}; border:1px solid ${INK_100}; border-left:3px solid ${BRAND}; border-radius:8px; padding:18px 22px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td>
                            <div style="font-family: 'SF Mono', Menlo, Consolas, monospace; font-size:30px; font-weight:800; letter-spacing:0.4em; color:${INK_900};">
                              ${pin}
                            </div>
                            <div style="font-size:12px; color:${INK_500}; margin-top:8px; line-height:1.5;">
                              Enter this 6-digit PIN to unlock your report. Keep it private.
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td style="padding:24px 36px 32px 36px;" align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-radius:8px; background:${BRAND};">
                      <a href="${reportUrl}"
                         style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:8px; letter-spacing:0.01em;">
                         View report &rarr;
                      </a>
                    </td>
                  </tr>
                </table>
                <div style="font-size:12px; color:${INK_500}; margin-top:14px;">
                  or copy this link:
                  <a href="${reportUrl}" style="color:${INK_700}; word-break:break-all;">${reportUrl}</a>
                </div>
              </td>
            </tr>

            <!-- DETAILS -->
            <tr>
              <td style="padding:0 36px 32px 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${INK_50}; border-radius:8px;">
                  <tr>
                    <td style="padding:18px 22px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td width="50%" valign="top" style="padding:6px 12px 6px 0;">
                            <div style="font-size:10px; letter-spacing:0.14em; font-weight:700; color:${INK_500}; text-transform:uppercase; margin-bottom:4px;">Client</div>
                            <div style="font-size:14px; color:${INK_900}; font-weight:600;">${clientName}</div>
                          </td>
                          <td width="50%" valign="top" style="padding:6px 0 6px 12px;">
                            <div style="font-size:10px; letter-spacing:0.14em; font-weight:700; color:${INK_500}; text-transform:uppercase; margin-bottom:4px;">Cycle</div>
                            <div style="font-size:14px; color:${INK_900}; font-weight:600;">${cycleLabel}</div>
                          </td>
                        </tr>
                        <tr>
                          <td colspan="2" valign="top" style="padding:6px 0;">
                            <div style="font-size:10px; letter-spacing:0.14em; font-weight:700; color:${INK_500}; text-transform:uppercase; margin-bottom:4px;">Reporting Period</div>
                            <div style="font-size:14px; color:${INK_900}; font-weight:600;">${period}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- SECURITY NOTE -->
            <tr>
              <td style="padding:0 36px 32px 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-top:1px solid ${INK_100}; padding-top:20px;">
                      <div style="font-size:12px; color:${INK_500}; line-height:1.6;">
                        <strong style="color:${INK_700};">A note on security:</strong>
                        Your report is protected by a unique PIN that you'll be asked to enter each time you open the link.
                        Please do not forward this email or share the PIN with anyone outside your team.
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td style="background:${INK_50}; padding:24px 36px; border-top:1px solid ${INK_100};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle">
                      <div style="font-size:12px; color:${INK_700}; font-weight:600;">${preparedBy}</div>
                      <div style="font-size:11px; color:${INK_500}; margin-top:2px;">Digital marketing &amp; SEO</div>
                    </td>
                    <td valign="middle" align="right">
                      <div style="font-size:10px; letter-spacing:0.18em; color:${INK_500}; text-transform:uppercase;">
                        Sent · ${format(new Date(), 'MMM d, yyyy')}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Outer footer -->
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
            <tr>
              <td align="center" style="font-size:11px; color:${INK_500}; line-height:1.6;">
                You're receiving this email because you are listed as a contact for ${clientName}.<br/>
                If you didn't expect this report, you can safely ignore this message.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Your SEO report for ${input.clientName} is ready
${period} · Cycle ${input.cycleLabel}

Access PIN: ${input.pin}
(Required to unlock the report. Keep this private.)

View report:
${input.reportUrl}

— ${input.preparedBy || 'Media Spearhead'}
`;

  return { html, text };
}
