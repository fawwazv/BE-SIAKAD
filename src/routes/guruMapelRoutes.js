// src/routes/guruMapelRoutes.js
// ═══════════════════════════════════════════════
// GURU-MAPEL MAPPING ROUTES (Kurikulum only)
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const guruMapelCtrl = require('../controllers/guruMapelController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { requireFields, validateUUID } = require('../middlewares/validationMiddleware');

router.use(verifyToken, authorizeRoles('Kurikulum'));

router.get('/', guruMapelCtrl.getAll);

router.post('/', 
  requireFields('teacherId', 'subjectId'),
  guruMapelCtrl.create
);

router.put('/:id', 
  validateUUID('id'),
  guruMapelCtrl.update
);

router.delete('/:id', 
  validateUUID('id'),
  guruMapelCtrl.remove
);

module.exports = router;
