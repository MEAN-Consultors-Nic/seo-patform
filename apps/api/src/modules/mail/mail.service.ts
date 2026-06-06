import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { renderReportNotificationEmail } from './templates/report-notification.template';

export interface SendReportNotificationInput {
  recipients: string[];
  clientName: string;
  cycleLabel: string;
  cycleStart: Date;
  cycleEnd: Date;
  reportUrl: string;
  pin: string;
  preparedBy?: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter?: nodemailer.Transporter;
  private from = 'no-reply@mediaspearhead.com';
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') || 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass =
      this.config.get<string>('SMTP_PASS') ||
      this.config.get<string>('SMTP_PASSWORD');
    const secure =
      String(this.config.get<string>('SMTP_SECURE') || '').toLowerCase() === 'true';
    const fromName = this.config.get<string>('SMTP_FROM_NAME');
    const fromEmail =
      this.config.get<string>('SMTP_FROM_EMAIL') ||
      this.config.get<string>('SMTP_FROM');

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP not configured (missing SMTP_HOST/USER/PASS). Emails will not be sent.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    if (fromEmail) {
      this.from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
    } else {
      this.from = user;
    }
    this.enabled = true;
    this.logger.log(`SMTP ready: ${host}:${port} (from ${this.from})`);
  }

  isReady(): boolean {
    return this.enabled;
  }

  async sendReportNotification(input: SendReportNotificationInput) {
    if (!this.transporter) {
      throw new Error(
        'Email service is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD in the API .env file.',
      );
    }
    if (!input.recipients.length) {
      throw new Error('At least one recipient is required.');
    }
    const subject = `Your SEO report is ready — ${input.clientName} · ${input.cycleLabel}`;
    const { html, text } = renderReportNotificationEmail(input);

    const result = await this.transporter.sendMail({
      from: this.from,
      to: input.recipients.join(', '),
      subject,
      text,
      html,
    });
    this.logger.log(
      `Report notification sent to ${input.recipients.length} recipient(s) — messageId=${result.messageId}`,
    );
    return { messageId: result.messageId, sentTo: input.recipients };
  }
}
