// src/routes/importRoutes.js
// ═══════════════════════════════════════════════
// CSV / EXCEL IMPORT ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { uploadImport, importUsers, getTemplate } = require('../controllers/importController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Download CSV template
router.get('/template', verifyToken, authorizeRoles('Administrator'), getTemplate);

// Import users from CSV/Excel (Admin only)
router.post('/users',
  verifyToken,
  authorizeRoles('Administrator'),
  (req, res, next) => {
    uploadImport.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'Ukuran file maksimal 5MB' });
        }
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  importUsers
);

module.exports = router;
