// src/routes/catatanAkademikRoutes.js
// ═══════════════════════════════════════════════
// CATATAN AKADEMIK ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const catatanCtrl = require('../controllers/catatanAkademikController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { validateUUID, requireFields } = require('../middlewares/validationMiddleware');

// Upsert catatan (Wali Kelas only)
router.post('/', 
  verifyToken, 
  authorizeRoles('Wali Kelas'),
  requireFields('siswaId', 'semesterId', 'catatan'),
  catatanCtrl.upsert
);

// Get catatan for a student
router.get('/siswa/:siswaId', 
  verifyToken, 
  authorizeRoles('Wali Kelas', 'Administrator', 'Kurikulum', 'Siswa'),
  validateUUID('siswaId'),
  catatanCtrl.getBySiswa
);

// Get catatan for all students in a kelas
router.get('/kelas/:kelasId', 
  verifyToken, 
  authorizeRoles('Wali Kelas', 'Administrator'),
  validateUUID('kelasId'),
  catatanCtrl.getByKelas
);

// Delete catatan
router.delete('/:id', 
  verifyToken, 
  authorizeRoles('Wali Kelas', 'Administrator'),
  validateUUID('id'),
  catatanCtrl.remove
);

module.exports = router;
