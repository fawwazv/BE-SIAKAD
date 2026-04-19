// src/routes/userRoutes.js
// ═══════════════════════════════════════════════
// USER MANAGEMENT ROUTES (Admin only)
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { requireFields, validateEmail, validatePassword, validateUUID, validateRoleName } = require('../middlewares/validationMiddleware');
const { preventSelfDelete, preventSelfRoleChange } = require('../middlewares/ownershipMiddleware');
const { passwordResetLimiter } = require('../middlewares/rateLimiter');

// Routes require authentication
router.use(verifyToken);

router.get('/', authorizeRoles('Administrator', 'Kurikulum'), userController.getAll);

router.get('/:id', 
  authorizeRoles('Administrator', 'Kurikulum'),
  validateUUID('id'), 
  userController.getById
);

router.post('/', 
  authorizeRoles('Administrator'),
  requireFields('name', 'email', 'role', 'password'),
  validateEmail,
  validatePassword,
  validateRoleName,
  userController.create
);

router.put('/:id', 
  authorizeRoles('Administrator'),
  validateUUID('id'),
  preventSelfRoleChange,
  userController.update
);

router.delete('/:id', 
  authorizeRoles('Administrator'),
  validateUUID('id'),
  preventSelfDelete,
  userController.remove
);

router.patch('/:id/reset-password', 
  authorizeRoles('Administrator'),
  validateUUID('id'),
  passwordResetLimiter,
  requireFields('password'),
  validatePassword,
  userController.resetPassword
);

module.exports = router;
