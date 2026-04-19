// src/routes/jadwalRoutes.js
// ═══════════════════════════════════════════════
// JADWAL PELAJARAN ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const jadwalCtrl = require('../controllers/jadwalController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { requireFields, validateUUID, validateHari, validateTimeFormat } = require('../middlewares/validationMiddleware');

// Read access for all authenticated users
router.get('/', verifyToken, jadwalCtrl.getAll);

router.get('/by-guru/:guruId', 
  verifyToken, 
  validateUUID('guruId'),
  jadwalCtrl.getByGuru
);

// Write access for Kurikulum only
router.post('/', 
  verifyToken, 
  authorizeRoles('Kurikulum'), 
  requireFields('classId', 'subjectId', 'guruId', 'day', 'startTime', 'endTime'),
  validateHari,
  validateTimeFormat,
  jadwalCtrl.create
);

router.put('/:id', 
  verifyToken, 
  authorizeRoles('Kurikulum'), 
  validateUUID('id'),
  jadwalCtrl.update
);

router.patch('/:id/move', 
  verifyToken, 
  authorizeRoles('Kurikulum'), 
  validateUUID('id'),
  jadwalCtrl.move
);

router.delete('/:id', 
  verifyToken, 
  authorizeRoles('Kurikulum'), 
  validateUUID('id'),
  jadwalCtrl.remove
);

module.exports = router;
