// src/routes/cmsRoutes.js
// ═══════════════════════════════════════════════
// CMS / KONTEN PUBLIK ROUTES
// Public read + Admin-only write
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const cmsCtrl = require('../controllers/cmsController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { validateUUID } = require('../middlewares/validationMiddleware');

// ── Public (no auth) ────────────────────────────
router.get('/', cmsCtrl.getPublic);

// ── Admin-only ──────────────────────────────────
router.get('/all', verifyToken, authorizeRoles('Administrator'), cmsCtrl.getAll);

router.get('/:id', validateUUID('id'), cmsCtrl.getPublicById);

router.post('/', 
  verifyToken, 
  authorizeRoles('Administrator'), 
  cmsCtrl.create
);

router.put('/:id', 
  verifyToken, 
  authorizeRoles('Administrator'), 
  validateUUID('id'),
  cmsCtrl.update
);

router.patch('/:id/toggle', 
  verifyToken, 
  authorizeRoles('Administrator'), 
  validateUUID('id'),
  cmsCtrl.toggleActive
);

router.delete('/:id', 
  verifyToken, 
  authorizeRoles('Administrator'), 
  validateUUID('id'),
  cmsCtrl.remove
);

module.exports = router;
