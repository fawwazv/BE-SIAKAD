// src/routes/nilaiRoutes.js
// ═══════════════════════════════════════════════
// NILAI (GRADES) ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const nilaiCtrl = require('../controllers/nilaiController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { requireFields, validateUUID, validateNilaiRange, validateBobotTotal } = require('../middlewares/validationMiddleware');
const { verifySiswaAccess } = require('../middlewares/ownershipMiddleware');

// Read grades (teachers, wali kelas, students)
router.get('/', verifyToken, nilaiCtrl.getAll);

router.get('/siswa/:siswaId', 
  verifyToken, 
  validateUUID('siswaId'),
  verifySiswaAccess('siswaId'),
  nilaiCtrl.getBySiswa
);

// Write grades (Guru Mapel only)
router.post('/batch', 
  verifyToken, 
  authorizeRoles('Guru Mapel'),
  requireFields('mapelId', 'semesterId'),
  validateNilaiRange,
  validateBobotTotal,
  nilaiCtrl.saveBatch
);

module.exports = router;
