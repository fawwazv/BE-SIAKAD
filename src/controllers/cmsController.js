// src/controllers/cmsController.js
// ═══════════════════════════════════════════════
// CMS / KONTEN PUBLIK CONTROLLER
// CRUD for Hero, Berita, Prestasi, Video
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const VALID_TYPES = ['HERO', 'BERITA', 'PRESTASI', 'VIDEO'];

const serializeCmsItem = (data) => ({
  id: data.id,
  type: data.tipe,
  title: data.judul,
  content: data.konten,
  imageUrl: data.gambar_url,
  videoUrl: data.video_url,
  order: data.urutan,
  isActive: data.is_active,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
});

const parseOrder = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const validateUpdatePayload = (body) => {
  const errors = [];
  const { type, title, order, isActive } = body;

  if (type !== undefined) {
    if (!type || !VALID_TYPES.includes(`${type}`.toUpperCase())) {
      errors.push(`Tipe konten harus salah satu dari: ${VALID_TYPES.join(', ')}`);
    }
  }

  if (title !== undefined && `${title}`.trim() === '') {
    errors.push('Judul wajib diisi');
  }

  if (order !== undefined && parseOrder(order) === null) {
    errors.push('Urutan tampil harus berupa angka');
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    errors.push('Status publikasi harus bernilai boolean');
  }

  return errors;
};

/**
 * GET /api/cms?tipe=BERITA
 * Public — no auth required
 * Returns active content filtered by type
 */
const getPublic = async (req, res) => {
  try {
    const { tipe } = req.query;

    const where = { is_active: true };
    if (tipe && VALID_TYPES.includes(tipe.toUpperCase())) {
      where.tipe = tipe.toUpperCase();
    }

    const data = await prisma.kontenPublik.findMany({
      where,
      orderBy: [{ urutan: 'asc' }, { created_at: 'desc' }],
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json({
      message: 'Konten berhasil diambil',
      data: data.map(serializeCmsItem),
    });
  } catch (error) {
    console.error('CMS GetPublic Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/cms/:id
 * Public — detail page for active public content
 */
const getPublicById = async (req, res) => {
  try {
    const data = await prisma.kontenPublik.findFirst({
      where: {
        id: req.params.id,
        is_active: true,
      },
    });

    if (!data) {
      return res.status(404).json({ message: 'Konten tidak ditemukan' });
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json({
      message: 'Detail konten berhasil diambil',
      data: serializeCmsItem(data),
    });
  } catch (error) {
    console.error('CMS GetPublicById Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/cms/all
 * Admin only — returns ALL content (active + inactive)
 */
const getAll = async (req, res) => {
  try {
    const { tipe } = req.query;

    const where = {};
    if (tipe && VALID_TYPES.includes(tipe.toUpperCase())) {
      where.tipe = tipe.toUpperCase();
    }

    const data = await prisma.kontenPublik.findMany({
      where,
      orderBy: [{ tipe: 'asc' }, { urutan: 'asc' }, { created_at: 'desc' }],
    });

    return res.status(200).json({
      message: 'Data konten berhasil diambil',
      data: data.map(serializeCmsItem),
    });
  } catch (error) {
    console.error('CMS GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/cms
 * Admin only — create new content
 */
const create = async (req, res) => {
  try {
    const { type, title, content, imageUrl, videoUrl, order, isActive } = req.body;

    if (!type || !VALID_TYPES.includes(type.toUpperCase())) {
      return res.status(400).json({ message: `Tipe konten harus salah satu dari: ${VALID_TYPES.join(', ')}` });
    }

    if (!title) {
      return res.status(400).json({ message: 'Judul wajib diisi' });
    }

    const data = await prisma.kontenPublik.create({
      data: {
        tipe: type.toUpperCase(),
        judul: title,
        konten: content || null,
        gambar_url: imageUrl || null,
        video_url: videoUrl || null,
        urutan: parseInt(order) || 0,
        is_active: isActive !== false,
      },
    });

    return res.status(201).json({
      message: 'Konten berhasil ditambahkan',
      data: serializeCmsItem(data),
    });
  } catch (error) {
    console.error('CMS Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * PUT /api/cms/:id
 * Admin only — update content
 */
const update = async (req, res) => {
  try {
    const { type, title, content, imageUrl, videoUrl, order, isActive } = req.body;
    const errors = validateUpdatePayload(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ message: errors.join('. ') });
    }

    const existing = await prisma.kontenPublik.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Konten tidak ditemukan' });
    }

    const updateData = {};
    if (type !== undefined) updateData.tipe = `${type}`.toUpperCase();
    if (title !== undefined) updateData.judul = `${title}`.trim();
    if (content !== undefined) updateData.konten = content || null;
    if (imageUrl !== undefined) updateData.gambar_url = imageUrl || null;
    if (videoUrl !== undefined) updateData.video_url = videoUrl || null;
    if (order !== undefined) updateData.urutan = parseOrder(order);
    if (isActive !== undefined) updateData.is_active = isActive;

    const data = await prisma.kontenPublik.update({
      where: { id: req.params.id },
      data: updateData,
    });

    return res.status(200).json({
      message: 'Konten berhasil diperbarui',
      data: serializeCmsItem(data),
    });
  } catch (error) {
    console.error('CMS Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * PATCH /api/cms/:id/toggle
 * Admin only — toggle active status
 */
const toggleActive = async (req, res) => {
  try {
    const existing = await prisma.kontenPublik.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Konten tidak ditemukan' });

    const data = await prisma.kontenPublik.update({
      where: { id: req.params.id },
      data: { is_active: !existing.is_active },
    });

    return res.status(200).json({
      message: `Konten ${data.is_active ? 'diaktifkan' : 'dinonaktifkan'}`,
      data: { id: data.id, isActive: data.is_active },
    });
  } catch (error) {
    console.error('CMS Toggle Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * DELETE /api/cms/:id
 * Admin only
 */
const remove = async (req, res) => {
  try {
    await prisma.kontenPublik.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Konten berhasil dihapus' });
  } catch (error) {
    console.error('CMS Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getPublic, getPublicById, getAll, create, update, toggleActive, remove };
