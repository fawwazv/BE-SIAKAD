// src/middlewares/ownershipMiddleware.js
// ═══════════════════════════════════════════════
// OWNERSHIP & DATA ACCESS MIDDLEWARE
// Ensures users can only access their own data
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

/**
 * Verify Self or Admin
 * 
 * Allows access if:
 * - The authenticated user is accessing their OWN data (req.params.id === req.user.userId)
 * - OR the authenticated user is an Administrator
 * 
 * Usage example on profile route:
 *   router.get('/users/:id', verifyToken, verifySelfOrAdmin, controller)
 * 
 * @param {string} paramName - The route param name to check (default: 'id')
 */
const verifySelfOrAdmin = (paramName = 'id') => {
  return (req, res, next) => {
    const targetId = req.params[paramName];
    const requesterId = req.user.userId;
    const requesterRole = req.user.role;

    if (requesterRole === 'Administrator' || targetId === requesterId) {
      return next();
    }

    return res.status(403).json({
      message: 'Anda tidak memiliki akses untuk melihat/mengubah data pengguna lain',
    });
  };
};

/**
 * Verify Siswa Self or Teacher/WaliKelas
 * 
 * For student data (grades, attendance):
 * - Siswa can only access their OWN data
 * - Guru Mapel / Wali Kelas can access ALL student data
 * - Admin can access all data
 * 
 * @param {string} paramName - The siswa ID param (default: 'siswaId')
 */
const verifySiswaAccess = (paramName = 'siswaId') => {
  return (req, res, next) => {
    const targetSiswaId = req.params[paramName];
    const requesterId = req.user.userId;
    const requesterRole = req.user.role;

    // Admins, teachers, and homeroom teachers can access any student
    const privilegedRoles = ['Administrator', 'Kurikulum', 'Guru Mapel', 'Wali Kelas'];
    if (privilegedRoles.includes(requesterRole)) {
      return next();
    }

    // Students can only access their own data
    if (requesterRole === 'Siswa' && targetSiswaId === requesterId) {
      return next();
    }

    return res.status(403).json({
      message: 'Anda hanya dapat mengakses data milik Anda sendiri',
    });
  };
};

/**
 * Verify Active User
 * 
 * Checks that the authenticated user is still active in the database.
 * Protects against using tokens from deactivated accounts.
 * 
 * Use sparingly (adds a DB query per request).
 * Best for sensitive operations like password reset, data modification.
 */
const verifyActiveUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { status_aktif: true },
    });

    if (!user) {
      return res.status(401).json({
        message: 'Akun tidak ditemukan. Token tidak berlaku.',
      });
    }

    if (!user.status_aktif) {
      return res.status(403).json({
        message: 'Akun Anda telah dinonaktifkan. Silakan hubungi administrator.',
      });
    }

    next();
  } catch (error) {
    console.error('VerifyActiveUser Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * Verify Guru Owns Jadwal
 * 
 * For guru/wali kelas operations on jadwal:
 * Ensures the teacher can only manage jadwal assigned to them.
 * Admin/Kurikulum bypass this check.
 */
const verifyGuruOwnsJadwal = async (req, res, next) => {
  try {
    const requesterRole = req.user.role;

    // Admin & Kurikulum can access all
    if (['Administrator', 'Kurikulum'].includes(requesterRole)) {
      return next();
    }

    const jadwalId = req.params.jadwalId || req.body.jadwalId;
    if (!jadwalId) {
      return next(); // No jadwal to check, let the controller handle
    }

    const jadwal = await prisma.jadwalPelajaran.findUnique({
      where: { id: jadwalId },
      select: { guru_id: true },
    });

    if (!jadwal) {
      return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
    }

    if (jadwal.guru_id !== req.user.userId) {
      return res.status(403).json({
        message: 'Anda hanya dapat mengelola jadwal yang ditugaskan kepada Anda',
      });
    }

    next();
  } catch (error) {
    console.error('VerifyGuruOwnsJadwal Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * Prevent Self Delete
 * 
 * Prevents administrators from deleting their own account
 */
const preventSelfDelete = (req, res, next) => {
  if (req.params.id === req.user.userId) {
    return res.status(400).json({
      message: 'Anda tidak dapat menghapus akun Anda sendiri',
    });
  }
  next();
};

/**
 * Prevent Self Role Change
 * 
 * Prevents administrators from changing their own role
 */
const preventSelfRoleChange = (req, res, next) => {
  if (req.params.id === req.user.userId && req.body.role) {
    return res.status(400).json({
      message: 'Anda tidak dapat mengubah role akun Anda sendiri',
    });
  }
  next();
};

module.exports = {
  verifySelfOrAdmin,
  verifySiswaAccess,
  verifyActiveUser,
  verifyGuruOwnsJadwal,
  preventSelfDelete,
  preventSelfRoleChange,
};
