// src/routes/jurnalRoutes.js
// ═══════════════════════════════════════════════
// JURNAL MENGAJAR ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const jurnalCtrl = require('../controllers/jurnalController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { validateUUID, requireFields, validateDateFormat } = require('../middlewares/validationMiddleware');
const { verifyGuruOwnsJadwal } = require('../middlewares/ownershipMiddleware');

// Create journal entry (Guru only)
router.post('/', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  requireFields('jadwalId', 'tanggal', 'pertemuanKe', 'judulMateri'),
  validateDateFormat,
  verifyGuruOwnsJadwal,
  jurnalCtrl.create
);

// Get journal entries for a jadwal
router.get('/:jadwalId', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas', 'Administrator', 'Kurikulum'),
  validateUUID('jadwalId'),
  jurnalCtrl.getByJadwal
);

// Check if jurnal exists for a jadwal+date
router.get('/check/:jadwalId/:tanggal', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  validateUUID('jadwalId'),
  jurnalCtrl.checkExists
);

// Update journal entry
router.put('/:id', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  validateUUID('id'),
  jurnalCtrl.update
);

// Delete journal entry
router.delete('/:id', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas', 'Administrator'),
  validateUUID('id'),
  jurnalCtrl.remove
);

module.exports = router;
