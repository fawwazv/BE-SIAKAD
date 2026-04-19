// src/routes/masterDataRoutes.js
// ═══════════════════════════════════════════════
// MASTER DATA ROUTES
// Tahun Ajaran, Semester, Ruang Kelas, Master Kelas
// (Admin only)
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const tahunAjaranCtrl = require('../controllers/tahunAjaranController');
const semesterCtrl = require('../controllers/semesterController');
const ruangKelasCtrl = require('../controllers/ruangKelasController');
const masterKelasCtrl = require('../controllers/masterKelasController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { requireFields, validateUUID, validateTahunAjaranCode } = require('../middlewares/validationMiddleware');

// All routes require Admin and Kurikulum roles
router.use(verifyToken, authorizeRoles('Administrator', 'Kurikulum'));

// ── Tahun Ajaran ────────────────────────────────
router.get('/tahun-ajaran', tahunAjaranCtrl.getAll);
router.post('/tahun-ajaran', 
  requireFields('code', 'description'),
  validateTahunAjaranCode,
  tahunAjaranCtrl.create
);
router.put('/tahun-ajaran/:id', 
  validateUUID('id'),
  tahunAjaranCtrl.update
);
router.patch('/tahun-ajaran/:id/toggle', 
  validateUUID('id'),
  tahunAjaranCtrl.toggleActive
);
router.delete('/tahun-ajaran/:id', 
  validateUUID('id'),
  tahunAjaranCtrl.remove
);

// ── Semester ────────────────────────────────────
router.get('/semester', semesterCtrl.getAll);
router.post('/semester', 
  requireFields('name', 'academicYearId'),
  semesterCtrl.create
);
router.put('/semester/:id', 
  validateUUID('id'),
  semesterCtrl.update
);
router.patch('/semester/:id/toggle', 
  validateUUID('id'),
  semesterCtrl.toggleActive
);
router.delete('/semester/:id', 
  validateUUID('id'),
  semesterCtrl.remove
);

// ── Ruang Kelas ─────────────────────────────────
router.get('/ruang-kelas', ruangKelasCtrl.getAll);
router.post('/ruang-kelas', 
  requireFields('code', 'building', 'capacity'),
  ruangKelasCtrl.create
);
router.put('/ruang-kelas/:id', 
  validateUUID('id'),
  ruangKelasCtrl.update
);
router.delete('/ruang-kelas/:id', 
  validateUUID('id'),
  ruangKelasCtrl.remove
);

// ── Master Kelas ────────────────────────────────
router.get('/master-kelas', masterKelasCtrl.getAll);
router.post('/master-kelas', 
  requireFields('name', 'grade'),
  masterKelasCtrl.create
);
router.put('/master-kelas/:id', 
  validateUUID('id'),
  masterKelasCtrl.update
);
router.delete('/master-kelas/:id', 
  validateUUID('id'),
  masterKelasCtrl.remove
);

module.exports = router;
