// src/routes/uploadRoutes.js
// ═══════════════════════════════════════════════
// FILE UPLOAD ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const { upload, uploadCms, uploadAvatar, uploadCmsImage, deleteAvatar } = require('../controllers/uploadController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Upload avatar (any authenticated user)
router.post('/avatar', 
  verifyToken, 
  (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'Ukuran file maksimal 2MB' });
        }
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  uploadAvatar
);

// Upload public CMS image (administrator only)
router.post('/cms-image',
  verifyToken,
  authorizeRoles('Administrator'),
  (req, res, next) => {
    uploadCms.single('image')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'Ukuran file maksimal 5MB' });
        }
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  uploadCmsImage
);

// Delete avatar
router.delete('/avatar', verifyToken, deleteAvatar);

module.exports = router;
