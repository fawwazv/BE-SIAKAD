const nodemailer = require('nodemailer');

let transporter;

const smtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => {
  if (!smtpConfigured()) {
    throw new Error('SMTP belum dikonfigurasi');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return transporter;
};

const purposeLabel = {
  VERIFY_PERSONAL_EMAIL: 'verifikasi email pemulihan',
  RESET_PASSWORD: 'reset password',
};

const sendOtpEmail = async ({ to, otp, purpose }) => {
  const label = purposeLabel[purpose] || 'verifikasi akun';
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await getTransporter().sendMail({
    from,
    to,
    subject: `Kode OTP ${label} SIAKAD`,
    text: [
      `Kode OTP untuk ${label} adalah ${otp}.`,
      '',
      `Kode berlaku ${process.env.OTP_EXPIRES_MINUTES || 10} menit.`,
      'Abaikan email ini jika Anda tidak meminta kode OTP.',
    ].join('\n'),
  });
};

module.exports = {
  sendOtpEmail,
  smtpConfigured,
};
