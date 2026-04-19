// src/routes/dashboardRoutes.js
// ═══════════════════════════════════════════════
// DASHBOARD ROUTES
// Role-specific dashboard endpoints
// ═══════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const dashboardCtrl = require('../controllers/dashboardController');
const { verifyToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Admin dashboard stats
router.get('/stats', 
  verifyToken, 
  authorizeRoles('Administrator'),
  dashboardCtrl.getStats
);

// Wali Kelas dashboard
router.get('/wali-kelas', 
  verifyToken, 
  authorizeRoles('Wali Kelas'),
  dashboardCtrl.getWaliKelasDashboard
);

// Siswa dashboard
router.get('/siswa', 
  verifyToken, 
  authorizeRoles('Siswa'),
  dashboardCtrl.getSiswaDashboard
);

// Guru dashboard
router.get('/guru', 
  verifyToken, 
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  dashboardCtrl.getGuruDashboard
);

module.exports = router;
