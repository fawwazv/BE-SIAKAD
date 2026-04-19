// src/controllers/authController.js
// ═══════════════════════════════════════════════
// AUTHENTICATION CONTROLLER
// Universal login for all roles
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

/**
 * POST /api/auth/login
 * Universal login – accepts all roles
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // A. Validasi Input
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email dan password wajib diisi' 
      });
    }

    // B. Cari User + Role
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });

    // C. Validasi Keberadaan User
    if (!user) {
      return res.status(401).json({ 
        message: 'Kredensial tidak valid' 
      });
    }

    // D. Cek Status Aktif
    if (!user.status_aktif) {
      return res.status(403).json({ 
        message: 'Akun Anda telah dinonaktifkan. Silakan hubungi administrator.' 
      });
    }

    // E. Verifikasi Password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        message: 'Kredensial tidak valid' 
      });
    }

    // F. Map role DB → role frontend
    const roleMapping = {
      'Administrator': 'admin',
      'Kurikulum': 'curriculum',
      'Guru Mapel': 'teacher',
      'Wali Kelas': 'teacher',
      'Siswa': 'student',
    };

    // G. Buat JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role.nama_role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // H. Response sesuai format frontend User.fromJson
    return res.status(200).json({
      message: 'Login Berhasil',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.nama_lengkap || user.email.split('@')[0],
        role: roleMapping[user.role.nama_role] || 'student',
        avatar: user.avatar_url,
        password: '', // Frontend expects this field but we never send actual password
      }
    });

  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(500).json({ 
      message: 'Terjadi kesalahan internal pada server' 
    });
  }
};

/**
 * GET /api/auth/me
 * Get current logged-in user info
 */
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true }
    });

    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    const roleMapping = {
      'Administrator': 'admin',
      'Kurikulum': 'curriculum',
      'Guru Mapel': 'teacher',
      'Wali Kelas': 'teacher',
      'Siswa': 'student',
    };

    return res.status(200).json({
      message: 'Data user berhasil diambil',
      data: {
        id: user.id,
        email: user.email,
        name: user.nama_lengkap || user.email.split('@')[0],
        role: roleMapping[user.role.nama_role] || 'student',
        avatar: user.avatar_url,
        password: '',
      }
    });
  } catch (error) {
    console.error('GetMe Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { login, getMe };