// src/controllers/uploadController.js
// ═══════════════════════════════════════════════
// FILE UPLOAD CONTROLLER
// Avatar upload with size/type validation (FR-07.5)
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `avatar-${req.user.userId}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung. Hanya JPG, JPEG, dan PNG yang diizinkan.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

/**
 * POST /api/upload/avatar
 * Upload profile photo
 */
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File tidak ditemukan' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Delete old avatar file if exists
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { avatar_url: true },
    });

    if (user?.avatar_url && user.avatar_url.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, '../..', user.avatar_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Update user avatar_url
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { avatar_url: avatarUrl },
    });

    return res.status(200).json({
      message: 'Foto profil berhasil diunggah',
      data: { avatarUrl },
    });
  } catch (error) {
    console.error('Upload Avatar Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * DELETE /api/upload/avatar
 * Remove profile photo
 */
const deleteAvatar = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { avatar_url: true },
    });

    if (user?.avatar_url && user.avatar_url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '../..', user.avatar_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await prisma.user.update({
      where: { id: req.user.userId },
      data: { avatar_url: null },
    });

    return res.status(200).json({ message: 'Foto profil berhasil dihapus' });
  } catch (error) {
    console.error('Delete Avatar Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { upload, uploadAvatar, deleteAvatar };
