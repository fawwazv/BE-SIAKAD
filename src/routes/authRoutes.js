// src/routes/authRoutes.js
// ═══════════════════════════════════════════════
// AUTHENTICATION ROUTES
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { requireFields, validateEmail } = require('../middlewares/validationMiddleware');

// Public — with brute-force protection
router.post('/login', 
  loginLimiter,
  requireFields('email', 'password'),
  validateEmail,
  authController.login
);

// Protected - get current user
router.get('/me', verifyToken, authController.getMe);

module.exports = router;