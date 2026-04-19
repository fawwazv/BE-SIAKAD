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

// Guru endpoints
router.post('/batch', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'), 
  requireFields('jadwalId', 'tanggal'),
  validateDateFormat,
  validateKehadiranStatus,
  verifyGuruOwnsJadwal,
  kehadiranCtrl.saveBatch
);

router.get('/rekap/:jadwalId', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  validateUUID('jadwalId'),
  kehadiranCtrl.getRekap
);

router.get('/history/:jadwalId', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  validateUUID('jadwalId'),
  kehadiranCtrl.getHistory
);

router.post('/generate-qr', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  requireFields('jadwalId', 'tanggal'),
  validateDateFormat,
  verifyGuruOwnsJadwal,
  kehadiranCtrl.generateQR
);

// Siswa endpoints
router.get('/siswa/:siswaId', 
  verifyToken, 
  validateUUID('siswaId'),
  kehadiranCtrl.getBySiswa
);

router.post('/qr-scan', 
  verifyToken, 
  authorizeRoles('Siswa'), 
  qrScanLimiter,
  requireFields('qrToken', 'jadwalId', 'tanggal'),
  validateDateFormat,
  kehadiranCtrl.qrScan
);

module.exports = router;
