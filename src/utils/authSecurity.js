const bcrypt = require('bcrypt');
const crypto = require('crypto');

const DEFAULT_BCRYPT_ROUNDS = 12;
const DEFAULT_OTP_EXPIRES_MINUTES = 10;
const DEFAULT_OTP_MAX_ATTEMPTS = 5;

const getBcryptRounds = () => {
  const rounds = Number.parseInt(process.env.BCRYPT_ROUNDS || '', 10);
  if (Number.isInteger(rounds) && rounds >= 10 && rounds <= 15) return rounds;
  return DEFAULT_BCRYPT_ROUNDS;
};

const hashPassword = (password) => bcrypt.hash(password, getBcryptRounds());

const verifyPassword = (password, passwordHash) => {
  if (!password || !passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
};

const generateTemporaryPassword = () => {
  const token = crypto.randomBytes(12).toString('base64url');
  return `Sia-${token}`;
};

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashOtp = (otp) => bcrypt.hash(otp, getBcryptRounds());

const verifyOtp = (otp, otpHash) => {
  if (!otp || !otpHash) return false;
  return bcrypt.compare(otp, otpHash);
};

const getOtpExpiresAt = () => {
  const minutes = Number.parseInt(process.env.OTP_EXPIRES_MINUTES || '', 10);
  const ttl = Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_OTP_EXPIRES_MINUTES;
  return new Date(Date.now() + ttl * 60 * 1000);
};

const getOtpMaxAttempts = () => {
  const attempts = Number.parseInt(process.env.OTP_MAX_ATTEMPTS || '', 10);
  if (Number.isInteger(attempts) && attempts > 0) return attempts;
  return DEFAULT_OTP_MAX_ATTEMPTS;
};

const normalizeEmail = (email) => `${email || ''}`.trim().toLowerCase();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(`${email || ''}`.trim());

const isLocalBcryptAuthEnabled = () =>
  process.env.AUTH_MODE === 'local-bcrypt' || process.env.APP_ENV !== 'production';

module.exports = {
  getBcryptRounds,
  hashPassword,
  verifyPassword,
  generateTemporaryPassword,
  generateOtp,
  hashOtp,
  verifyOtp,
  getOtpExpiresAt,
  getOtpMaxAttempts,
  normalizeEmail,
  isValidEmail,
  isLocalBcryptAuthEnabled,
};
