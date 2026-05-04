// src/controllers/uploadController.js
// ═══════════════════════════════════════════════
// FILE UPLOAD CONTROLLER
// Avatar upload with size/type validation (FR-07.5)
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const { v2: cloudinary } = require('cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist for local fallback storage
const AVATAR_UPLOAD_DIR = path.join(__dirname, '../../uploads/avatars');
const CMS_UPLOAD_DIR = path.join(__dirname, '../../uploads/cms');
for (const dir of [AVATAR_UPLOAD_DIR, CMS_UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET)
  );

if (isCloudinaryConfigured()) {
  cloudinary.config(
    process.env.CLOUDINARY_URL
      ? { secure: true }
      : {
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
          secure: true,
        }
  );
}

const avatarFolder = () => process.env.CLOUDINARY_AVATAR_FOLDER || 'siakad/avatars';
const cmsFolder = () => process.env.CLOUDINARY_CMS_FOLDER || 'siakad/cms';

const getCloudinaryPublicId = (avatarUrl) => {
  if (!avatarUrl || !avatarUrl.includes('/upload/')) return null;
  try {
    const url = new URL(avatarUrl);
    const afterUpload = url.pathname.split('/upload/')[1];
    if (!afterUpload) return null;
    const withoutVersion = afterUpload.replace(/^v\d+\//, '');
    const withoutExtension = withoutVersion.replace(/\.[a-zA-Z0-9]+$/, '');
    return withoutExtension.startsWith(`${avatarFolder()}/`) ? withoutExtension : null;
  } catch (_) {
    return null;
  }
};

const deleteStoredAvatar = async (avatarUrl) => {
  if (!avatarUrl) return;

  if (avatarUrl.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, '../..', avatarUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }

  if (isCloudinaryConfigured()) {
    const publicId = getCloudinaryPublicId(avatarUrl);
    if (publicId) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    }
  }
};

const uploadToCloudinary = (file, userId) => {
  const base64 = file.buffer.toString('base64');
  const dataUri = `data:${file.mimetype};base64,${base64}`;

  return cloudinary.uploader.upload(dataUri, {
    folder: avatarFolder(),
    public_id: `user-${userId}`,
    overwrite: true,
    resource_type: 'image',
    transformation: [
      { width: 512, height: 512, crop: 'fill', gravity: 'face:auto' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });
};

const uploadCmsImageToCloudinary = (file, userId) => {
  const base64 = file.buffer.toString('base64');
  const dataUri = `data:${file.mimetype};base64,${base64}`;
  const basename = path
    .basename(file.originalname, path.extname(file.originalname))
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'cms-image';

  return cloudinary.uploader.upload(dataUri, {
    folder: cmsFolder(),
    public_id: `${basename}-${userId}-${Date.now()}`,
    resource_type: 'image',
    transformation: [
      { width: 1600, height: 900, crop: 'limit' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });
};

const saveToLocalUploads = (file, userId) => {
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const filename = `avatar-${userId}-${Date.now()}${ext}`;
  const filePath = path.join(AVATAR_UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, file.buffer);
  return `/uploads/avatars/${filename}`;
};

const saveCmsImageToLocalUploads = (file, userId) => {
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const filename = `cms-${userId}-${Date.now()}${ext}`;
  const filePath = path.join(CMS_UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, file.buffer);
  return `/uploads/cms/${filename}`;
};

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung. Hanya JPG, JPEG, PNG, dan WEBP yang diizinkan.'), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

const uploadCms = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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

    // Delete old avatar file if exists
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { avatar_url: true },
    });

    await deleteStoredAvatar(user?.avatar_url);

    const avatarUrl = isCloudinaryConfigured()
      ? (await uploadToCloudinary(req.file, req.user.userId)).secure_url
      : saveToLocalUploads(req.file, req.user.userId);

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
 * POST /api/upload/cms-image
 * Upload public CMS thumbnail/post image
 */
const uploadCmsImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File tidak ditemukan' });
    }

    const imageUrl = isCloudinaryConfigured()
      ? (await uploadCmsImageToCloudinary(req.file, req.user.userId)).secure_url
      : saveCmsImageToLocalUploads(req.file, req.user.userId);

    return res.status(200).json({
      message: 'Gambar konten berhasil diunggah',
      data: { imageUrl },
    });
  } catch (error) {
    console.error('Upload CMS Image Error:', error);
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

    await deleteStoredAvatar(user?.avatar_url);

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

module.exports = { upload, uploadCms, uploadAvatar, uploadCmsImage, deleteAvatar };
