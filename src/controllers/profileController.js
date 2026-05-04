// src/controllers/profileController.js
// ═══════════════════════════════════════════════
// USER PROFILE CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const { sendOtpEmail, smtpConfigured } = require('../utils/mailer');
const {
  generateOtp,
  getOtpExpiresAt,
  getOtpMaxAttempts,
  hashOtp,
  isValidEmail,
  normalizeEmail,
  verifyOtp,
} = require('../utils/authSecurity');
const { writeSecurityEvent } = require('../utils/auditLogger');

const OTP_PURPOSE_VERIFY_PERSONAL_EMAIL = 'VERIFY_PERSONAL_EMAIL';
const isProduction = () => process.env.APP_ENV === 'production';
const isEmailOtpEnabled = () =>
  process.env.EMAIL_OTP_ENABLED === 'true' || !isProduction();

const createPersonalEmailOtp = async ({ userId, email }) => {
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);

  await prisma.userEmailOtp.create({
    data: {
      user_id: userId,
      email,
      purpose: OTP_PURPOSE_VERIFY_PERSONAL_EMAIL,
      otp_hash: otpHash,
      expires_at: getOtpExpiresAt(),
    },
  });

  return otp;
};

const getLatestPersonalEmailOtp = ({ userId, email }) =>
  prisma.userEmailOtp.findFirst({
    where: {
      user_id: userId,
      email,
      purpose: OTP_PURPOSE_VERIFY_PERSONAL_EMAIL,
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { created_at: 'desc' },
  });

/**
 * GET /api/profile
 * Get current user's profile
 */
const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true, profile: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    return res.status(200).json({
      message: 'Profil berhasil diambil',
      data: {
        id: user.profile?.id || '',
        userId: user.id,
        nomorInduk: user.nomor_induk || '',
        namaLengkap: user.nama_lengkap,
        jenisKelamin: user.profile?.jenis_kelamin || '',
        tanggalLahir: user.profile?.tanggal_lahir || '',
        tempatLahir: user.profile?.tempat_lahir || '',
        agama: user.profile?.agama || '',
        nik: user.profile?.nik || '',
        namaIbuKandung: user.profile?.nama_ibu_kandung || '',
        statusPerkawinan: user.profile?.status_perkawinan || '',
        provinsi: user.profile?.provinsi || '',
        kotaKabupaten: user.profile?.kota_kabupaten || '',
        kecamatan: user.profile?.kecamatan || '',
        kelurahan: user.profile?.kelurahan || '',
        detailAlamat: user.profile?.detail_alamat || '',
        rt: user.profile?.rt || '',
        rw: user.profile?.rw || '',
        kodePos: user.profile?.kode_pos || '',
        avatarUrl: user.avatar_url || '',
        email: user.email,
        username: user.username || '',
        personalEmail: user.profile?.personal_email || '',
        personalEmailPending: user.profile?.personal_email_pending || '',
        personalEmailVerifiedAt: user.profile?.personal_email_verified_at || null,
        isPersonalEmailVerified: Boolean(user.profile?.personal_email_verified_at),
        role: user.role.nama_role,
      },
    });
  } catch (error) {
    console.error('Profile Get Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * PUT /api/profile
 * Update current user's profile
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      namaLengkap, nomorInduk,
      jenisKelamin, tanggalLahir, tempatLahir, agama,
      nik, namaIbuKandung, statusPerkawinan,
      provinsi, kotaKabupaten, kecamatan, kelurahan,
      detailAlamat, rt, rw, kodePos,
    } = req.body;

    // Update User table
    if (namaLengkap || nomorInduk !== undefined) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(namaLengkap && { nama_lengkap: namaLengkap }),
          ...(nomorInduk !== undefined && { nomor_induk: nomorInduk }),
        },
      });
    }

    // Upsert Profile
    await prisma.userProfile.upsert({
      where: { user_id: userId },
      update: {
        ...(jenisKelamin && { jenis_kelamin: jenisKelamin }),
        ...(tanggalLahir && { tanggal_lahir: tanggalLahir }),
        ...(tempatLahir && { tempat_lahir: tempatLahir }),
        ...(agama && { agama }),
        ...(nik !== undefined && { nik }),
        ...(namaIbuKandung !== undefined && { nama_ibu_kandung: namaIbuKandung }),
        ...(statusPerkawinan !== undefined && { status_perkawinan: statusPerkawinan }),
        ...(provinsi && { provinsi }),
        ...(kotaKabupaten && { kota_kabupaten: kotaKabupaten }),
        ...(kecamatan && { kecamatan }),
        ...(kelurahan && { kelurahan }),
        ...(detailAlamat && { detail_alamat: detailAlamat }),
        ...(rt !== undefined && { rt }),
        ...(rw !== undefined && { rw }),
        ...(kodePos !== undefined && { kode_pos: kodePos }),
      },
      create: {
        user_id: userId,
        jenis_kelamin: jenisKelamin || null,
        tanggal_lahir: tanggalLahir || null,
        tempat_lahir: tempatLahir || null,
        agama: agama || null,
        nik: nik || null,
        nama_ibu_kandung: namaIbuKandung || null,
        status_perkawinan: statusPerkawinan || null,
        provinsi: provinsi || null,
        kota_kabupaten: kotaKabupaten || null,
        kecamatan: kecamatan || null,
        kelurahan: kelurahan || null,
        detail_alamat: detailAlamat || null,
        rt: rt || null,
        rw: rw || null,
        kode_pos: kodePos || null,
      },
    });

    return res.status(200).json({ message: 'Profil berhasil diperbarui' });
  } catch (error) {
    console.error('Profile Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const requestPersonalEmailOtp = async (req, res) => {
  try {
    if (!isEmailOtpEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'Verifikasi email OTP belum diaktifkan. Reset password dilakukan oleh admin.',
        errorCode: 'EMAIL_OTP_DISABLED',
      });
    }

    const userId = req.user.userId;
    const personalEmail = normalizeEmail(req.body.personalEmail || req.body.email);

    if (!isValidEmail(personalEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Email pribadi tidak valid',
        errorCode: 'INVALID_EMAIL',
      });
    }

    const existing = await prisma.userProfile.findFirst({
      where: {
        personal_email: { equals: personalEmail, mode: 'insensitive' },
        user_id: { not: userId },
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Email pribadi sudah digunakan akun lain',
        errorCode: 'EMAIL_ALREADY_USED',
      });
    }

    await prisma.userProfile.upsert({
      where: { user_id: userId },
      update: { personal_email_pending: personalEmail },
      create: { user_id: userId, personal_email_pending: personalEmail },
    });

    const otp = await createPersonalEmailOtp({ userId, email: personalEmail });
    let devOtp = null;

    if (smtpConfigured()) {
      await sendOtpEmail({
        to: personalEmail,
        otp,
        purpose: OTP_PURPOSE_VERIFY_PERSONAL_EMAIL,
      });
    } else if (!isProduction()) {
      devOtp = otp;
      console.info(`[DEV OTP] VERIFY_PERSONAL_EMAIL ${personalEmail}: ${otp}`);
    } else {
      throw new Error('SMTP belum dikonfigurasi');
    }

    await writeSecurityEvent({
      req,
      event: 'PERSONAL_EMAIL_OTP_SENT',
      metadata: { email: personalEmail },
    });

    return res.status(200).json({
      success: true,
      message: devOtp
        ? 'OTP dev dibuat. Konfigurasikan SMTP untuk pengiriman email production.'
        : 'OTP verifikasi email pribadi telah dikirim',
      data: {
        personalEmailPending: personalEmail,
        ...(devOtp ? { devOtp } : {}),
      },
    });
  } catch (error) {
    console.error('RequestPersonalEmailOtp Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengirim OTP. Periksa konfigurasi SMTP server.',
      errorCode: 'OTP_SEND_FAILED',
    });
  }
};

const verifyPersonalEmailOtp = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: 'OTP wajib diisi',
        errorCode: 'BAD_REQUEST',
      });
    }

    const profile = await prisma.userProfile.findUnique({ where: { user_id: userId } });
    const pendingEmail = profile?.personal_email_pending;

    if (!pendingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada email pribadi yang menunggu verifikasi',
        errorCode: 'NO_PENDING_EMAIL',
      });
    }

    const otpRecord = await getLatestPersonalEmailOtp({ userId, email: pendingEmail });
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

    await prisma.$transaction([
      prisma.userProfile.update({
        where: { user_id: userId },
        data: {
          personal_email: pendingEmail,
          personal_email_pending: null,
          personal_email_verified_at: new Date(),
        },
      }),
      prisma.userEmailOtp.update({
        where: { id: otpRecord.id },
        data: { consumed_at: new Date() },
      }),
    ]);

    await writeSecurityEvent({
      req,
      event: 'PERSONAL_EMAIL_VERIFIED',
      metadata: { email: pendingEmail },
    });

    return res.status(200).json({
      success: true,
      message: 'Email pribadi berhasil diverifikasi',
      data: { personalEmail: pendingEmail },
    });
  } catch (error) {
    console.error('VerifyPersonalEmailOtp Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan internal pada server',
      errorCode: 'INTERNAL_SERVER_ERROR',
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  requestPersonalEmailOtp,
  verifyPersonalEmailOtp,
};
