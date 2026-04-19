// src/controllers/mataPelajaranController.js
// ═══════════════════════════════════════════════
// MATA PELAJARAN CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const getAll = async (req, res) => {
  try {
    const { search = '' } = req.query;

    const where = search
      ? {
          OR: [
            { kode: { contains: search, mode: 'insensitive' } },
            { nama: { contains: search, mode: 'insensitive' } },
            { kategori: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const data = await prisma.mataPelajaran.findMany({
      where,
      orderBy: { kode: 'asc' },
    });

    return res.status(200).json({
      message: 'Data mata pelajaran berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        code: d.kode,
        name: d.nama,
        category: d.kategori,
        kkm: d.kkm,
        description: d.deskripsi,
      })),
    });
  } catch (error) {
    console.error('MataPelajaran GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const create = async (req, res) => {
  try {
    const { code, name, category, kkm, description } = req.body;
    if (!code || !name || !category) {
      return res.status(400).json({ message: 'Kode, nama, dan kategori wajib diisi' });
    }

    const data = await prisma.mataPelajaran.create({
      data: {
        kode: code,
        nama: name,
        kategori: category,
        kkm: parseInt(kkm) || 75,
        deskripsi: description || null,
      },
    });

    return res.status(201).json({
      message: 'Mata pelajaran berhasil ditambahkan',
      data: { id: data.id, code: data.kode, name: data.nama, category: data.kategori, kkm: data.kkm, description: data.deskripsi },
    });
  } catch (error) {
    console.error('MataPelajaran Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const update = async (req, res) => {
  try {
    const { code, name, category, kkm, description } = req.body;
    const data = await prisma.mataPelajaran.update({
      where: { id: req.params.id },
      data: {
        ...(code && { kode: code }),
        ...(name && { nama: name }),
        ...(category && { kategori: category }),
        ...(kkm !== undefined && { kkm: parseInt(kkm) }),
        ...(description !== undefined && { deskripsi: description }),
      },
    });
    return res.status(200).json({
      message: 'Mata pelajaran berhasil diperbarui',
      data: { id: data.id, code: data.kode, name: data.nama, category: data.kategori, kkm: data.kkm, description: data.deskripsi },
    });
  } catch (error) {
    console.error('MataPelajaran Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.mataPelajaran.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Mata pelajaran berhasil dihapus' });
  } catch (error) {
    console.error('MataPelajaran Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, create, update, remove };
