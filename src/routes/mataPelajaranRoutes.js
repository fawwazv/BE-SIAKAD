// src/routes/mataPelajaranRoutes.js
// ═══════════════════════════════════════════════
// MATA PELAJARAN ROUTES (Admin + Kurikulum)
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const mataPelajaranCtrl = require('../controllers/mataPelajaranController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { requireFields, validateUUID, validateMapelCategory } = require('../middlewares/validationMiddleware');

router.use(verifyToken, authorizeRoles('Administrator', 'Kurikulum'));

router.get('/', mataPelajaranCtrl.getAll);

router.post('/', 
  requireFields('code', 'name', 'category'),
  validateMapelCategory,
  mataPelajaranCtrl.create
);

router.put('/:id', 
  validateUUID('id'),
  mataPelajaranCtrl.update
);

router.delete('/:id', 
  validateUUID('id'),
  mataPelajaranCtrl.remove
);

module.exports = router;
