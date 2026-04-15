const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

//Inisialisasi Koneksi Database (Prisma 7 Adapter)

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Controller untuk Login Administrator
 */
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // A. Validasi Input Dasar
    if (!email || !password) {
      return res.status(400).json({ 
        message: 'Email dan password wajib diisi' 
      });
    }

    // B. Cari User di Database berdasarkan Email
    // Kita juga mengambil (include) data Role untuk pengecekan RBAC
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });

    // C. Validasi Keberadaan User & Status Akun
    if (!user) {
      return res.status(401).json({ 
        message: 'Kredensial tidak valid' 
      });
    }

    if (!user.status_aktif) {
      return res.status(403).json({ 
        message: 'Akun Anda telah dinonaktifkan. Silakan hubungi sistem.' 
      });
    }

    // D. Validasi Role (RBAC - Role-Based Access Control)
    // Memastikan hanya user dengan role 'Administrator' yang bisa login
    if (user.role.nama_role !== 'Administrator') {
      return res.status(403).json({ 
        message: 'Akses ditolak. Endpoint ini khusus untuk Administrator.' 
      });
    }

    // E. Verifikasi Password menggunakan Bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        message: 'Kredensial tidak valid' 
      });
    }

    // F. Pembuatan JSON Web Token (JWT)
    // Token ini akan digunakan oleh Frontend untuk request selanjutnya
    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role.nama_role 
      },
      process.env.JWT_SECRET, // Diambil dari file .env
      { expiresIn: '8h' }    // Sesi berlaku selama 8 jam jam kerja
    );

    // G. Respon Berhasil
    return res.status(200).json({
      message: 'Login Berhasil',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role.nama_role
      }
    });

  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(500).json({ 
      message: 'Terjadi kesalahan internal pada server' 
    });
  }
};

module.exports = { loginAdmin };