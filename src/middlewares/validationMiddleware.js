// src/middlewares/validationMiddleware.js
// ═══════════════════════════════════════════════
// INPUT VALIDATION MIDDLEWARE
// Validates request body/params for each endpoint
// ═══════════════════════════════════════════════

/**
 * Generic required fields checker
 * Usage: requireFields('name', 'email', 'password')
 */
const requireFields = (...fields) => {
  return (req, res, next) => {
    const missing = fields.filter((field) => {
      const value = req.body[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      return res.status(400).json({
        message: `Field berikut wajib diisi: ${missing.join(', ')}`,
      });
    }
    next();
  };
};

/**
 * Validate email format
 */
const validateEmail = (req, res, next) => {
  const { email } = req.body;
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Format email tidak valid' });
    }
  }
  next();
};

/**
 * Validate password strength
 * Min 6 characters
 */
const validatePassword = (req, res, next) => {
  const { password } = req.body;
  if (password) {
    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password minimal 6 karakter',
      });
    }
  }
  next();
};

/**
 * Validate UUID format for route params
 * Usage: validateUUID('id'), validateUUID('siswaId', 'id')
 */
const validateUUID = (...paramNames) => {
  return (req, res, next) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const param of paramNames) {
      const value = req.params[param];
      if (value && !uuidRegex.test(value)) {
        return res.status(400).json({
          message: `Parameter "${param}" harus berformat UUID yang valid`,
        });
      }
    }
    next();
  };
};

/**
 * Validate numeric range for nilai (grades)
 * Checks that grade values are between 0-100
 */
const validateNilaiRange = (req, res, next) => {
  const { records } = req.body;
  if (records && Array.isArray(records)) {
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const gradeFields = ['tugas', 'uh', 'uts', 'uas', 'keaktifan', 'kehadiran'];
      for (const field of gradeFields) {
        const val = parseFloat(r[field]);
        if (r[field] !== undefined && r[field] !== null && r[field] !== '') {
          if (isNaN(val) || val < 0 || val > 100) {
            return res.status(400).json({
              message: `Nilai ${field} pada record ke-${i + 1} harus antara 0-100`,
            });
          }
        }
      }
    }
  }
  next();
};

/**
 * Validate bobot (weight) totals equal 100
 */
const validateBobotTotal = (req, res, next) => {
  const { bobot } = req.body;
  if (bobot) {
    const total =
      (parseFloat(bobot.tugas) || 0) +
      (parseFloat(bobot.uh) || 0) +
      (parseFloat(bobot.uts) || 0) +
      (parseFloat(bobot.uas) || 0) +
      (parseFloat(bobot.keaktifan) || 0) +
      (parseFloat(bobot.kehadiran) || 0);

    if (total !== 100) {
      return res.status(400).json({
        message: `Total bobot harus 100%, saat ini: ${total}%`,
      });
    }
  }
  next();
};

/**
 * Validate kehadiran status
 * Must be one of: HADIR, SAKIT, IZIN, ALPA
 */
const validateKehadiranStatus = (req, res, next) => {
  const validStatuses = ['HADIR', 'SAKIT', 'IZIN', 'ALPA'];
  const { records } = req.body;

  if (records && Array.isArray(records)) {
    for (let i = 0; i < records.length; i++) {
      if (records[i].status && !validStatuses.includes(records[i].status)) {
        return res.status(400).json({
          message: `Status kehadiran pada record ke-${i + 1} tidak valid. Gunakan: ${validStatuses.join(', ')}`,
        });
      }
    }
  }
  next();
};

/**
 * Validate hari (day) value
 */
const validateHari = (req, res, next) => {
  const validDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const { day } = req.body;

  if (day && !validDays.includes(day)) {
    return res.status(400).json({
      message: `Hari tidak valid. Gunakan: ${validDays.join(', ')}`,
    });
  }
  next();
};

/**
 * Validate time format (HH:MM)
 */
const validateTimeFormat = (req, res, next) => {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const { startTime, endTime } = req.body;

  if (startTime && !timeRegex.test(startTime)) {
    return res.status(400).json({ message: 'Format jam mulai tidak valid (gunakan HH:MM)' });
  }
  if (endTime && !timeRegex.test(endTime)) {
    return res.status(400).json({ message: 'Format jam selesai tidak valid (gunakan HH:MM)' });
  }
  if (startTime && endTime && startTime >= endTime) {
    return res.status(400).json({ message: 'Jam mulai harus lebih awal dari jam selesai' });
  }
  next();
};

/**
 * Validate date format (YYYY-MM-DD)
 */
const validateDateFormat = (req, res, next) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const { tanggal } = req.body;

  if (tanggal && !dateRegex.test(tanggal)) {
    return res.status(400).json({ message: 'Format tanggal tidak valid (gunakan YYYY-MM-DD)' });
  }
  next();
};

/**
 * Validate role name exists in system
 */
const validateRoleName = (req, res, next) => {
  const validRoles = ['Administrator', 'Kurikulum', 'Guru Mapel', 'Wali Kelas', 'Siswa', 'Guest'];
  const { role } = req.body;

  if (role && !validRoles.includes(role)) {
    return res.status(400).json({
      message: `Role tidak valid. Gunakan: ${validRoles.join(', ')}`,
    });
  }
  next();
};

/**
 * Validate mapel category
 */
const validateMapelCategory = (req, res, next) => {
  const validCategories = ['Wajib', 'Peminatan', 'Muatan Lokal', 'Ekstrakurikuler'];
  const { category } = req.body;

  if (category && !validCategories.includes(category)) {
    return res.status(400).json({
      message: `Kategori tidak valid. Gunakan: ${validCategories.join(', ')}`,
    });
  }
  next();
};

/**
 * Validate tahun ajaran code format (YYYY/YYYY)
 */
const validateTahunAjaranCode = (req, res, next) => {
  const { code } = req.body;
  if (code) {
    const regex = /^\d{4}\/\d{4}$/;
    if (!regex.test(code)) {
      return res.status(400).json({ message: 'Format kode tahun ajaran tidak valid (gunakan YYYY/YYYY)' });
    }
    const [start, end] = code.split('/').map(Number);
    if (end !== start + 1) {
      return res.status(400).json({ message: 'Tahun akhir harus = tahun awal + 1' });
    }
  }
  next();
};

module.exports = {
  requireFields,
  validateEmail,
  validatePassword,
  validateUUID,
  validateNilaiRange,
  validateBobotTotal,
  validateKehadiranStatus,
  validateHari,
  validateTimeFormat,
  validateDateFormat,
  validateRoleName,
  validateMapelCategory,
  validateTahunAjaranCode,
};
