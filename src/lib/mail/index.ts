import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Mail abstraction (spec section 59). Drivers:
 * - "console" (development): emails are LOGGED, never pretended as delivered
 * - "smtp" (production): delivered via nodemailer
 */

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML alternative (plain text is always sent). */
  html?: string;
};

export type MailResult = { status: 'sent' | 'logged' | 'failed'; info?: string };

export interface Mailer {
  readonly key: string;
  send(message: MailMessage): Promise<MailResult>;
}

/** Development driver: prints the email to the structured log. */
class ConsoleMailer implements Mailer {
  readonly key = 'console';

  async send(message: MailMessage): Promise<MailResult> {
    logger.info('mail_console', {
      to: message.to,
      subject: message.subject,
      preview: message.text.slice(0, 200),
    });
    return { status: 'logged', info: 'console driver' };
  }
}

/** SMTP driver (production). Requires nodemailer + SMTP_* env. */
class SmtpMailer implements Mailer {
  readonly key = 'smtp';
  private transporterPromise: Promise<import('nodemailer').Transporter> | null = null;

  private async transporter() {
    if (!this.transporterPromise) {
      this.transporterPromise = (async () => {
        const { default: nodemailer } = await import('nodemailer');
        const { host, port, user, pass } = env.smtp;
        if (!host) throw new Error('SMTP_HOST is required for the smtp mail driver');
        return nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: user && pass ? { user, pass } : undefined,
        });
      })();
    }
    return this.transporterPromise;
  }

  async send(message: MailMessage): Promise<MailResult> {
    try {
      const transport = await this.transporter();
      const info = await transport.sendMail({
        from: env.mailFrom,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { status: 'sent', info: info.messageId };
    } catch (error) {
      logger.error('mail_send_failed', {
        to: message.to,
        error: error instanceof Error ? error.message : String(error),
      });
      return { status: 'failed' };
    }
  }
}

let mailer: Mailer | null = null;

export function getMailer(): Mailer {
  if (!mailer) {
    mailer = env.mailDriver === 'smtp' ? new SmtpMailer() : new ConsoleMailer();
  }
  return mailer;
}

/** Test seam. */
export function setMailer(custom: Mailer | null): void {
  mailer = custom;
}
