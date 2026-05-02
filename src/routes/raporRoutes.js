// src/routes/raporRoutes.js
// ═══════════════════════════════════════════════
// E-RAPOR ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const raporCtrl = require('../controllers/raporController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { validateUUID } = require('../middlewares/validationMiddleware');
const { verifySiswaAccess } = require('../middlewares/ownershipMiddleware');

// Preview rapor data (JSON)
router.get('/preview/:siswaId/:semesterId', 
  verifyToken, 
  authorizeRoles('Wali Kelas', 'Administrator', 'Kurikulum', 'Siswa'),
  validateUUID('siswaId'),
  validateUUID('semesterId'),
  verifySiswaAccess('siswaId'),
  raporCtrl.previewRapor
);

// Generate PDF transkrip all semesters
router.get('/transkrip/:siswaId',
  verifyToken,
  authorizeRoles('Wali Kelas', 'Administrator', 'Kurikulum', 'Siswa'),
  validateUUID('siswaId'),
  verifySiswaAccess('siswaId'),
  raporCtrl.generateTranskrip
);

// Generate PDF rapor
router.get('/:siswaId/:semesterId', 
  verifyToken, 
  authorizeRoles('Wali Kelas', 'Administrator', 'Kurikulum', 'Siswa'),
  validateUUID('siswaId'),
  validateUUID('semesterId'),
  verifySiswaAccess('siswaId'),
  raporCtrl.generateRapor
);

module.exports = router;
