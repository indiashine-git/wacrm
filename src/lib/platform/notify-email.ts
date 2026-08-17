import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function transporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return _transporter;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await transporter().sendMail({
    from: process.env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
