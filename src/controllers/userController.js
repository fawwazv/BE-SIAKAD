// src/controllers/userController.js
// ═══════════════════════════════════════════════
// USER MANAGEMENT CONTROLLER
// CRUD + search + pagination + reset password
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const bcrypt = require('bcrypt');

/**
 * GET /api/users
 * List users with search & pagination
 */
const getAll = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where.OR = [
        { nama_lengkap: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { nomor_induk: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) {
      where.role = { nama_role: role };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { role: true },
        skip,
        take: parseInt(limit),
        orderBy: { created_at: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    const data = users.map((u) => ({
      id: u.id,
      name: u.nama_lengkap,
      email: u.email,
      idNumber: u.nomor_induk || '-',
      role: u.role.nama_role,
      status: u.status_aktif ? 'Aktif' : 'Tidak Aktif',
    }));

    return res.status(200).json({
      message: 'Data pengguna berhasil diambil',
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('User GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/users/:id
 */
const getById = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true, profile: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'Pengguna tidak ditemukan' });
    }

    return res.status(200).json({
      message: 'Data pengguna berhasil diambil',
      data: {
        id: user.id,
        name: user.nama_lengkap,
        email: user.email,
        idNumber: user.nomor_induk || '-',
        role: user.role.nama_role,
        status: user.status_aktif ? 'Aktif' : 'Tidak Aktif',
        profile: user.profile,
      },
    });
  } catch (error) {
    console.error('User GetById Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/users
 * Create new user
 */
const create = async (req, res) => {
  try {
    const { name, email, idNumber, role, password, status } = req.body;

    if (!name || !email || !role || !password) {
      return res.status(400).json({ message: 'Nama, email, peran, dan password wajib diisi' });
    }

    // Check duplicate email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    }

    // Find role
    const roleRecord = await prisma.role.findUnique({ where: { nama_role: role } });
    if (!roleRecord) {
      return res.status(400).json({ message: `Peran "${role}" tidak ditemukan` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password_hash: hashedPassword,
        nama_lengkap: name,
        nomor_induk: idNumber || null,
        role_id: roleRecord.id,
        status_aktif: status !== 'Tidak Aktif',
        ...(req.body.profile && {
          profile: {
            create: req.body.profile
          }
        })
      },
      include: { role: true, profile: true },
    });

    return res.status(201).json({
      message: 'Pengguna berhasil ditambahkan',
      data: {
        id: user.id,
        name: user.nama_lengkap,
        email: user.email,
        idNumber: user.nomor_induk,
        role: user.role.nama_role,
        status: user.status_aktif ? 'Aktif' : 'Tidak Aktif',
      },
    });
  } catch (error) {
    console.error('User Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * PUT /api/users/:id
 */
const update = async (req, res) => {
  try {
    const { name, email, idNumber, role, status } = req.body;

    const updateData = {};
    if (name) updateData.nama_lengkap = name;
    if (email) updateData.email = email;
    if (idNumber !== undefined) updateData.nomor_induk = idNumber || null;
    if (status !== undefined) updateData.status_aktif = status !== 'Tidak Aktif';

    if (role) {
      const roleRecord = await prisma.role.findUnique({ where: { nama_role: role } });
      if (!roleRecord) {
        return res.status(400).json({ message: `Peran "${role}" tidak ditemukan` });
      }
      updateData.role_id = roleRecord.id;
    }

    if (req.body.profile) {
      updateData.profile = {
        upsert: {
          create: req.body.profile,
          update: req.body.profile,
        }
      };
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      include: { role: true, profile: true },
    });

    return res.status(200).json({
      message: 'Pengguna berhasil diperbarui',
      data: {
        id: user.id,
        name: user.nama_lengkap,
        email: user.email,
        idNumber: user.nomor_induk,
        role: user.role.nama_role,
        status: user.status_aktif ? 'Aktif' : 'Tidak Aktif',
      },
    });
  } catch (error) {
    console.error('User Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * DELETE /api/users/:id
 */
const remove = async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Pengguna berhasil dihapus' });
  } catch (error) {
    console.error('User Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * PATCH /api/users/:id/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Password baru wajib diisi' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: req.params.id },
      data: { password_hash: hashedPassword },
    });

    return res.status(200).json({ message: 'Kata sandi berhasil direset' });
  } catch (error) {
    console.error('ResetPassword Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, getById, create, update, remove, resetPassword };
