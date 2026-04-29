// src/routes/kehadiranRoutes.js
// ═══════════════════════════════════════════════
// KEHADIRAN (PRESENSI) ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const kehadiranCtrl = require('../controllers/kehadiranController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { requireFields, validateUUID, validateDateFormat, validateKehadiranStatus } = require('../middlewares/validationMiddleware');
const { verifyGuruOwnsJadwal } = require('../middlewares/ownershipMiddleware');
const { qrScanLimiter } = require('../middlewares/rateLimiter');

// ─── Guru Endpoints ──────────────────────────────

// Batch save attendance (manual mode)
router.post('/batch', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'), 
  requireFields('jadwalId', 'tanggal'),
  validateDateFormat,
  validateKehadiranStatus,
  verifyGuruOwnsJadwal,
  kehadiranCtrl.saveBatch
);

// Get attendance recap
router.get('/rekap/:jadwalId', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  validateUUID('jadwalId'),
  kehadiranCtrl.getRekap
);

// Get attendance history for a jadwal
router.get('/history/:jadwalId', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  validateUUID('jadwalId'),
  kehadiranCtrl.getHistory
);

// Generate QR token (first time for a session)
router.post('/generate-qr', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  requireFields('jadwalId', 'tanggal', 'pertemuanKe'),
  validateDateFormat,
  verifyGuruOwnsJadwal,
  kehadiranCtrl.generateQR
);

// Refresh QR token (auto-refresh setiap 3 menit)
router.post('/refresh-qr',
  verifyToken,
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  requireFields('jadwalId', 'tanggal', 'pertemuanKe'),
  validateDateFormat,
  verifyGuruOwnsJadwal,
  kehadiranCtrl.refreshQR
);

// End attendance session (guru closes session)
router.post('/end-session',
  verifyToken,
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  requireFields('jadwalId', 'tanggal'),
  validateDateFormat,
  kehadiranCtrl.endSession
);

// Live attendance polling — returns siswaId list who are HADIR this session
router.get('/live-attendance',
  verifyToken,
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  kehadiranCtrl.getSessionAttendance
);

// ─── Siswa Endpoints ─────────────────────────────

// Get attendance history for a student
router.get('/siswa/:siswaId', 
  verifyToken, 
  validateUUID('siswaId'),
  kehadiranCtrl.getBySiswa
);

// Scan QR to mark attendance
router.post('/qr-scan', 
  verifyToken, 
  authorizeRoles('Siswa'), 
  qrScanLimiter,
  requireFields('qrToken', 'jadwalId', 'tanggal'),
  validateDateFormat,
  kehadiranCtrl.qrScan
);

module.exports = router;
