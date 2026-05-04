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

router.get('/status/rombel/:rombelId',
  verifyToken,
  authorizeRoles('Wali Kelas', 'Guru Mapel', 'Administrator', 'Kurikulum'),
  validateUUID('rombelId'),
  raporCtrl.getRaporStatusByRombel
);

router.post('/bulk',
  verifyToken,
  authorizeRoles('Wali Kelas', 'Guru Mapel', 'Administrator', 'Kurikulum'),
  raporCtrl.generateBulkRapor
);

// Preview rapor data (JSON)
router.get('/preview/:siswaId/:semesterId', 
  verifyToken, 
  authorizeRoles('Wali Kelas', 'Guru Mapel', 'Administrator', 'Kurikulum', 'Siswa'),
  validateUUID('siswaId'),
  validateUUID('semesterId'),
  verifySiswaAccess('siswaId'),
  raporCtrl.previewRapor
);

// Generate PDF transkrip all semesters
router.get('/transkrip/:siswaId',
  verifyToken,
  authorizeRoles('Wali Kelas', 'Guru Mapel', 'Administrator', 'Kurikulum', 'Siswa'),
  validateUUID('siswaId'),
  verifySiswaAccess('siswaId'),
  raporCtrl.generateTranskrip
);

// Generate PDF rapor
router.get('/:siswaId/:semesterId', 
  verifyToken, 
  authorizeRoles('Wali Kelas', 'Guru Mapel', 'Administrator', 'Kurikulum', 'Siswa'),
  validateUUID('siswaId'),
  validateUUID('semesterId'),
  verifySiswaAccess('siswaId'),
  raporCtrl.generateRapor
);

module.exports = router;
