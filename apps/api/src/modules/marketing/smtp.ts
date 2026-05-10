import nodemailer, { type Transporter } from "nodemailer";

export type AgencyTransportOpts = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  fromEmail: string;
  fromName: string;
  dkimDomain: string | null;
  dkimSelector: string | null;
  dkimPrivateKey: string | null;
};

export function createAgencyTransport(opts: AgencyTransportOpts): Transporter {
  return nodemailer.createTransport({
    host: opts.smtpHost,
    port: opts.smtpPort,
    secure: opts.smtpSecure || opts.smtpPort === 465,
    auth: { user: opts.smtpUser, pass: opts.smtpPassword },
    pool: true,
    maxConnections: 5,
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
    ...(opts.dkimDomain && opts.dkimSelector && opts.dkimPrivateKey
      ? {
          dkim: {
            domainName: opts.dkimDomain,
            keySelector: opts.dkimSelector,
            privateKey: opts.dkimPrivateKey,
          },
        }
      : {}),
  });
}

export function fromHeaderFor(opts: { fromEmail: string; fromName: string }): string {
  // Always quote the display name to keep names with commas / quotes safe.
  const safeName = opts.fromName.replace(/"/g, "'");
  return `"${safeName}" <${opts.fromEmail}>`;
}
