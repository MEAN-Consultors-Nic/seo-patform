interface Input {
  recipientName: string;
  recipientEmail: string;
  invitedBy?: string;
  role?: string;
  actionUrl: string;
  expiresAt: Date;
}

const BRAND = '#FF7A59';
const INK_900 = '#0F172A';
const INK_700 = '#334155';
const INK_500 = '#64748B';
const INK_100 = '#F1F5F9';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderInviteEmail(input: Input): { html: string; text: string } {
  const name = escapeHtml(input.recipientName || 'there');
  const invitedBy = escapeHtml(input.invitedBy || 'Your team');
  const role = input.role ? ` as <strong>${escapeHtml(input.role)}</strong>` : '';
  const actionUrl = escapeHtml(input.actionUrl);
  const expiresLabel = input.expiresAt.toISOString().slice(0, 16).replace('T', ' ');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${INK_100};font-family:Inter,Arial,sans-serif;color:${INK_900};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK_100};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <tr><td style="padding:32px 32px 0 32px;">
        <div style="font-size:11px;font-weight:700;color:${BRAND};letter-spacing:0.08em;text-transform:uppercase;">Media Spearhead · Internal Tools</div>
        <h1 style="font-size:22px;margin:8px 0 4px 0;color:${INK_900};">You're invited</h1>
        <p style="font-size:14px;color:${INK_700};line-height:1.55;margin:0;">
          Hi ${name},<br>${invitedBy} has added you to the platform${role}. Set your password to activate your account.
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px;">
        <a href="${actionUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;">
          Set your password
        </a>
        <p style="font-size:12px;color:${INK_500};margin:16px 0 0 0;line-height:1.5;">
          Or paste this link into your browser:<br>
          <span style="word-break:break-all;color:${INK_700};">${actionUrl}</span>
        </p>
      </td></tr>
      <tr><td style="padding:0 32px 24px 32px;">
        <p style="font-size:12px;color:${INK_500};margin:0;line-height:1.5;">
          This link expires on <strong>${expiresLabel} UTC</strong>. If it lapses, your admin can resend the invite from the Users page.
        </p>
      </td></tr>
      <tr><td style="padding:16px 32px;background:${INK_100};font-size:11px;color:${INK_500};">
        You're receiving this because ${input.recipientEmail} was added as an internal user.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `You're invited to Media Spearhead · Internal Tools

Hi ${input.recipientName || 'there'},
${input.invitedBy || 'Your team'} has added you to the platform${input.role ? ` as ${input.role}` : ''}. Set your password to activate your account:

${input.actionUrl}

This link expires on ${expiresLabel} UTC.`;

  return { html, text };
}
