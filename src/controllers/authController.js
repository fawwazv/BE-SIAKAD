// src/controllers/authController.js
// ═══════════════════════════════════════════════
// AUTHENTICATION CONTROLLER
// Universal login for all roles
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { normalizeRoleName } = require('../middlewares/authMiddleware');
const { writeSecurityEvent } = require('../utils/auditLogger');
const { sendOtpEmail } = require('../utils/mailer');
const {
  generateOtp,
  getOtpExpiresAt,
  getOtpMaxAttempts,
  hashOtp,
  hashPassword,
  isLocalBcryptAuthEnabled,
  verifyOtp,
  verifyPassword,
} = require('../utils/authSecurity');

const LOGIN_LOCK_THRESHOLD = Number.parseInt(process.env.LOGIN_LOCK_THRESHOLD || '5', 10);
const LOGIN_LOCK_MINUTES = Number.parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10);
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_DAYS = Number.parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '30', 10);
const REFRESH_TOKEN_BYTES = Number.parseInt(process.env.REFRESH_TOKEN_BYTES || '48', 10);
const OTP_PURPOSE_RESET_PASSWORD = 'RESET_PASSWORD';
const GENERIC_RESET_MESSAGE = 'Jika akun ditemukan dan email pemulihan sudah terverifikasi, kode OTP akan dikirim.';
const isProduction = () => process.env.APP_ENV === 'production';
const isEmailOtpEnabled = () =>
  process.env.EMAIL_OTP_ENABLED === 'true' || !isProduction();

const roleMapping = {
  Administrator: 'admin',
  Kurikulum: 'curriculum',
  'Guru Mapel': 'teacher',
  'Wali Kelas': 'teacher',
  Guru: 'teacher',
  Siswa: 'student',
};

const formatUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.nama_lengkap || user.email.split('@')[0],
  role: roleMapping[user.role.nama_role] || 'student',
  securityRole: normalizeRoleName(user.role.nama_role),
  roleName: user.role.nama_role,
  avatar: user.avatar_url,
  username: user.username || '',
  idNumber: user.nomor_induk || '',
  forcePasswordChange: Boolean(user.force_password_change),
  sessionVersion: user.session_version,
  personalEmailVerified: Boolean(user.profile?.personal_email_verified_at),
  password: '',
});

const getAccessTokenPayload = (user) => ({
  userId: user.id,
  role: user.role.nama_role,
  email: user.email,
  sessionVersion: user.session_version,
});

const getRefreshTokenExpiresAt = () => {
  const ttlDays = Number.isInteger(REFRESH_TOKEN_EXPIRES_DAYS) && REFRESH_TOKEN_EXPIRES_DAYS > 0
    ? REFRESH_TOKEN_EXPIRES_DAYS
    : 30;
  return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
};

const getRefreshTokenTtlDays = () =>
  Number.isInteger(REFRESH_TOKEN_EXPIRES_DAYS) && REFRESH_TOKEN_EXPIRES_DAYS > 0
    ? REFRESH_TOKEN_EXPIRES_DAYS
    : 30;

const generateRefreshToken = () => {
  const bytes = Number.isInteger(REFRESH_TOKEN_BYTES) && REFRESH_TOKEN_BYTES >= 32
    ? REFRESH_TOKEN_BYTES
    : 48;
  return crypto.randomBytes(bytes).toString('base64url');
};

const hashRefreshToken = (refreshToken) =>
  crypto.createHash('sha256').update(refreshToken).digest('hex');

const getRequestMetadata = (req = {}) => {
  const forwardedFor = `${req.headers?.['x-forwarded-for'] || ''}`.split(',')[0].trim();

  return {
    ip_address: req.ip || forwardedFor || req.headers?.['x-real-ip'] || null,
    user_agent: req.headers?.['user-agent'] || null,
  };
};

const issueAccessToken = (user) =>
  jwt.sign(
    getAccessTokenPayload(user),
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );

const createRefreshSessionData = (user, refreshToken, req) => ({
  user_id: user.id,
  token_hash: hashRefreshToken(refreshToken),
  session_version: user.session_version,
  expires_at: getRefreshTokenExpiresAt(),
  ...getRequestMetadata(req),
});

const revokeRefreshSessionByToken = async (refreshToken) => {
  if (!refreshToken) return null;

  const tokenHash = hashRefreshToken(refreshToken);
  const session = await prisma.userRefreshSession.findFirst({
    where: { token_hash: tokenHash },
  });

  if (!session || session.revoked_at) {
    return null;
  }

  return prisma.userRefreshSession.update({
    where: { id: session.id },
    data: { revoked_at: new Date() },
  });
};

const findUserByIdentifier = (identifier, includeProfile = false) =>
  prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: identifier, mode: 'insensitive' } },
        { username: { equals: identifier, mode: 'insensitive' } },
        { nomor_induk: identifier },
      ],
    },
    include: { role: true, ...(includeProfile ? { profile: true } : {}) },
  });

const createOtpRecord = async ({ userId, email, purpose }) => {
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);

  await prisma.userEmailOtp.create({
    data: {
      user_id: userId,
      email,
      purpose,
      otp_hash: otpHash,
      expires_at: getOtpExpiresAt(),
    },
  });

  return otp;
};

const getLatestActiveOtp = ({ userId, email, purpose }) =>
  prisma.userEmailOtp.findFirst({
    where: {
      user_id: userId,
      email,
      purpose,
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { created_at: 'desc' },
  });

const recordFailedLogin = async (user) => {
  const failedCount = (user.failed_login_count || 0) + 1;
  const shouldLock = failedCount >= LOGIN_LOCK_THRESHOLD;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failed_login_count: failedCount,
      locked_until: shouldLock
        ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000)
        : user.locked_until,
    },
  });
};

/**
 * POST /api/auth/login
 * Universal login – accepts all roles
 */
const login = async (req, res) => {
  if (!isLocalBcryptAuthEnabled()) {
    return res.status(410).json({
      success: false,
      message: 'Login lokal production hanya aktif jika AUTH_MODE=local-bcrypt.',
      errorCode: 'LOCAL_LOGIN_DISABLED',
    });
  }

  try {
    const identifier = req.body.identifier || req.body.email || req.body.username;
    const { password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/username dan password wajib diisi',
        errorCode: 'BAD_REQUEST',
      });
    }

    const user = await findUserByIdentifier(identifier, true);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Kredensial tidak valid',
        errorCode: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.status_aktif) {
      return res.status(403).json({
        success: false,
        message: 'Akun Anda telah dinonaktifkan. Silakan hubungi administrator.',
        errorCode: 'INACTIVE_USER',
      });
    }

    if (user.locked_until && user.locked_until > new Date()) {
      return res.status(423).json({
        success: false,
        message: 'Akun terkunci sementara karena terlalu banyak percobaan login gagal.',
        errorCode: 'ACCOUNT_LOCKED',
      });
    }

    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      await recordFailedLogin(user);
      await writeSecurityEvent({
        req,
        academicUserId: user.id,
        event: 'LOGIN_FAILED',
        metadata: { identifier },
      });

      return res.status(401).json({
        success: false,
        message: 'Kredensial tidak valid',
        errorCode: 'INVALID_CREDENTIALS',
      });
    }

    const token = issueAccessToken(user);
    const refreshToken = generateRefreshToken();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failed_login_count: 0,
          locked_until: null,
          last_login_at: new Date(),
        },
      });

      await tx.userRefreshSession.create({
        data: createRefreshSessionData(user, refreshToken, req),
      });
    });

    await writeSecurityEvent({
      req,
      academicUserId: user.id,
      event: 'LOGIN_SUCCESS',
      metadata: { identifier },
    });

    return res.status(200).json({
      success: true,
      message: 'Login Berhasil',
      token,
      accessToken: token,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenExpiresIn: `${getRefreshTokenTtlDays()}d`,
      user: formatUser(user),
    });
  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan internal pada server',
      errorCode: 'INTERNAL_SERVER_ERROR',
    });
  }
};

/**
 * POST /api/auth/refresh
 * Exchange a refresh token for a new access token and rotated refresh token.
 */
const refresh = async (req, res) => {
  try {
    const refreshToken = req.body.refreshToken || req.body.refresh_token;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token wajib diisi',
        errorCode: 'BAD_REQUEST',
      });
    }

    const tokenHash = hashRefreshToken(refreshToken);
    const session = await prisma.userRefreshSession.findFirst({
      where: { token_hash: tokenHash },
      include: {
        user: {
          include: { role: true, profile: true },
        },
      },
    });

    if (!session || session.revoked_at || session.expires_at <= new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token tidak valid atau sudah kadaluarsa',
        errorCode: 'INVALID_REFRESH_TOKEN',
      });
    }

    if (!session.user || !session.user.status_aktif) {
      return res.status(403).json({
        success: false,
        message: 'Akun tidak aktif. Hubungi administrator.',
        errorCode: 'INACTIVE_USER',
      });
    }

    if (session.session_version !== session.user.session_version) {
      await prisma.userRefreshSession.update({
        where: { id: session.id },
        data: { revoked_at: new Date() },
      });

      return res.status(401).json({
        success: false,
        message: 'Session sudah tidak berlaku. Silakan login kembali.',
        errorCode: 'SESSION_REVOKED',
      });
    }

    const newAccessToken = issueAccessToken(session.user);
    const newRefreshToken = generateRefreshToken();

    await prisma.$transaction(async (tx) => {
      await tx.userRefreshSession.update({
        where: { id: session.id },
        data: { revoked_at: new Date() },
      });

      await tx.userRefreshSession.create({
        data: createRefreshSessionData(session.user, newRefreshToken, req),
      });
    });

    await writeSecurityEvent({
      req,
      academicUserId: session.user.id,
      event: 'TOKEN_REFRESHED',
      metadata: {
        refreshSessionId: session.id,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Token berhasil diperbarui',
      token: newAccessToken,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenExpiresIn: `${getRefreshTokenTtlDays()}d`,
      user: formatUser(session.user),
    });
  } catch (error) {
    console.error('Refresh Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan internal pada server',
      errorCode: 'INTERNAL_SERVER_ERROR',
    });
  }
};

/**
 * GET /api/auth/me
 * Get current logged-in user info
 */
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true, profile: true }
    });

    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    if (!user.status_aktif) {
      return res.status(403).json({
        success: false,
        message: 'Akun tidak aktif. Hubungi administrator.',
        errorCode: 'INACTIVE_USER',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Data user berhasil diambil',
      data: formatUser(user),
    });
  } catch (error) {
    console.error('GetMe Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const logout = async (req, res) => {
  const refreshToken = req.body?.refreshToken || req.body?.refresh_token || req.headers?.['x-refresh-token'];

  await revokeRefreshSessionByToken(refreshToken);

  await writeSecurityEvent({
    req,
    event: 'LOGOUT',
    metadata: {
      tokenSource: req.user?.tokenSource || null,
    },
  });

  return res.status(200).json({
    success: true,
    message: 'Logout tercatat. Refresh token telah dicabut bila tersedia.',
  });
};

const requestPasswordReset = async (req, res) => {
  try {
    if (!isEmailOtpEnabled()) {
      return res.status(200).json({
        success: true,
        message: 'Reset password dilakukan oleh admin sekolah.',
      });
    }

    const identifier = req.body.identifier || req.body.email || req.body.username;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Identifier wajib diisi',
        errorCode: 'BAD_REQUEST',
      });
    }

    const user = await findUserByIdentifier(identifier, true);
    if (user?.profile?.personal_email && user.profile.personal_email_verified_at && user.status_aktif) {
      const otp = await createOtpRecord({
        userId: user.id,
        email: user.profile.personal_email,
        purpose: OTP_PURPOSE_RESET_PASSWORD,
      });

      await sendOtpEmail({
        to: user.profile.personal_email,
        otp,
        purpose: OTP_PURPOSE_RESET_PASSWORD,
      });

      await writeSecurityEvent({
        req,
        academicUserId: user.id,
        event: 'PASSWORD_RESET_OTP_SENT',
        metadata: { identifier },
      });
    }

    return res.status(200).json({
      success: true,
      message: GENERIC_RESET_MESSAGE,
    });
  } catch (error) {
    console.error('RequestPasswordReset Error:', error);
    return res.status(200).json({
      success: true,
      message: GENERIC_RESET_MESSAGE,
    });
  }
};

const confirmPasswordReset = async (req, res) => {
  try {
    if (!isEmailOtpEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'Reset password mandiri belum diaktifkan. Hubungi admin sekolah.',
        errorCode: 'EMAIL_OTP_DISABLED',
      });
    }

    const identifier = req.body.identifier || req.body.email || req.body.username;
    const { otp, password } = req.body;

    if (!identifier || !otp || !password) {
      return res.status(400).json({
        success: false,
        message: 'Identifier, OTP, dan password baru wajib diisi',
        errorCode: 'BAD_REQUEST',
      });
    }

    const user = await findUserByIdentifier(identifier, true);
    if (!user?.profile?.personal_email || !user.profile.personal_email_verified_at) {
      return res.status(400).json({
        success: false,
        message: 'OTP tidak valid atau sudah kadaluarsa',
        errorCode: 'INVALID_OTP',
      });
    }

    const otpRecord = await getLatestActiveOtp({
      userId: user.id,
      email: user.profile.personal_email,
      purpose: OTP_PURPOSE_RESET_PASSWORD,
    });

    if (!otpRecord || otpRecord.failed_attempts >= getOtpMaxAttempts()) {
      return res.status(400).json({
        success: false,
        message: 'OTP tidak valid atau sudah kadaluarsa',
        errorCode: 'INVALID_OTP',
      });
    }

    const isOtpValid = await verifyOtp(otp, otpRecord.otp_hash);
    if (!isOtpValid) {
      await prisma.userEmailOtp.update({
        where: { id: otpRecord.id },
        data: { failed_attempts: { increment: 1 } },
      });

      return res.status(400).json({
        success: false,
        message: 'OTP tidak valid atau sudah kadaluarsa',
        errorCode: 'INVALID_OTP',
      });
    }

    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password_hash: passwordHash,
          force_password_change: false,
          password_changed_at: new Date(),
          session_version: { increment: 1 },
          failed_login_count: 0,
          locked_until: null,
        },
      }),
      prisma.userRefreshSession.updateMany({
        where: { user_id: user.id, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
      prisma.userEmailOtp.update({
        where: { id: otpRecord.id },
        data: { consumed_at: new Date() },
      }),
    ]);

    await writeSecurityEvent({
      req,
      academicUserId: user.id,
      event: 'PASSWORD_RESET_CONFIRMED',
      metadata: { identifier },
    });

    return res.status(200).json({
      success: true,
      message: 'Password berhasil direset. Silakan login kembali.',
    });
  } catch (error) {
    console.error('ConfirmPasswordReset Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan internal pada server',
      errorCode: 'INTERNAL_SERVER_ERROR',
    });
  }
};

module.exports = { login, refresh, getMe, logout, requestPasswordReset, confirmPasswordReset };
