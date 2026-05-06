// src/routes/authRoutes.js
// ═══════════════════════════════════════════════
// AUTHENTICATION ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { loginLimiter, passwordResetLimiter } = require('../middlewares/rateLimiter');

// Production local auth is enabled only when AUTH_MODE=local-bcrypt.
router.post('/login',
  loginLimiter,
  authController.login
);

router.post('/password-reset/request',
  passwordResetLimiter,
  authController.requestPasswordReset
);

router.post('/password-reset/confirm',
  passwordResetLimiter,
  authController.confirmPasswordReset
);

// Protected - get current user
router.get('/me', verifyToken, authController.getMe);

// Public - exchange refresh token for new access token.
router.post('/refresh',
  authController.refresh
);

// Protected - record logout event and revoke refresh token when provided.
router.post('/logout', verifyToken, authController.logout);

module.exports = router;
