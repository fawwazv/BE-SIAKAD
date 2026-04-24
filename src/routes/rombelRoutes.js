// src/routes/rombelRoutes.js
// ═══════════════════════════════════════════════
// ROMBEL ROUTES (Kurikulum only)
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const rombelCtrl = require('../controllers/rombelController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { requireFields, validateUUID } = require('../middlewares/validationMiddleware');

router.use(verifyToken, authorizeRoles('Kurikulum'));

router.get('/', rombelCtrl.getAll);

router.get('/available-wali', rombelCtrl.getAvailableWali);

router.post('/', 
  requireFields('masterKelasId'),
  rombelCtrl.create
);

router.put('/:id', 
  validateUUID('id'),
  rombelCtrl.update
);

router.delete('/:id', 
  validateUUID('id'),
  rombelCtrl.remove
);

// Siswa management within rombel
router.get('/:id/siswa', 
  validateUUID('id'),
  rombelCtrl.getSiswa
);

router.get('/:id/available-siswa', 
  validateUUID('id'),
  rombelCtrl.getAvailableSiswa
);

router.post('/:id/siswa', 
  validateUUID('id'),
  requireFields('siswaIds'),
  rombelCtrl.assignSiswa
);

router.delete('/:id/siswa', 
  validateUUID('id'),
  rombelCtrl.removeAllSiswa
);

router.delete('/:id/siswa/:siswaId', 
  validateUUID('id', 'siswaId'),
  rombelCtrl.removeSiswa
);

module.exports = router;
