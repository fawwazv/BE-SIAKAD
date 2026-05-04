// src/routes/profileRoutes.js
// ═══════════════════════════════════════════════
// PROFILE ROUTES (All authenticated users)
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const profileCtrl = require('../controllers/profileController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyActiveUser } = require('../middlewares/ownershipMiddleware');

// Verify user is still active for profile operations
router.get('/', verifyToken, profileCtrl.getProfile);
router.put('/', verifyToken, verifyActiveUser, profileCtrl.updateProfile);
router.post('/personal-email/request-otp', verifyToken, verifyActiveUser, profileCtrl.requestPersonalEmailOtp);
router.post('/personal-email/verify', verifyToken, verifyActiveUser, profileCtrl.verifyPersonalEmailOtp);

module.exports = router;
