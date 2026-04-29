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

// Guru class detail
router.get('/guru/kelas/:id',
  verifyToken,
  authorizeRoles('Guru Mapel', 'Wali Kelas'),
  dashboardCtrl.getGuruClassDetail
);

// ─── Active Semester (semua role yang sudah login) ──────────────
// No authorizeRoles — any authenticated user can call this
router.get('/active-semester', verifyToken, async (req, res) => {
  try {
    const prisma = require('../config/prisma');
    const semester = await prisma.semester.findFirst({
      where: { is_active: true },
      include: { tahun_ajaran: true },
    });
    if (!semester) {
      return res.status(200).json({ data: null, message: 'Tidak ada semester aktif' });
    }
    return res.status(200).json({
      data: {
        id: semester.id,
        nama: semester.nama,
        tahunAjaran: semester.tahun_ajaran?.kode || '-',
        label: `${semester.nama} - ${semester.tahun_ajaran?.kode || '-'}`,
      },
    });
  } catch (e) {
    console.error('[active-semester]', e.message);
    return res.status(500).json({ message: 'Gagal memuat semester aktif' });
  }
});

module.exports = router;
