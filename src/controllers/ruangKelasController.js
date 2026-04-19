// src/controllers/ruangKelasController.js
// ═══════════════════════════════════════════════
// RUANG KELAS CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const getAll = async (req, res) => {
  try {
    const data = await prisma.ruangKelas.findMany({ orderBy: { kode: 'asc' } });
    return res.status(200).json({
      message: 'Data ruang kelas berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        code: d.kode,
        building: d.gedung,
        capacity: d.kapasitas,
      })),
    });
  } catch (error) {
    console.error('RuangKelas GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const create = async (req, res) => {
  try {
    const { code, building, capacity } = req.body;
    if (!code || !building || !capacity) {
      return res.status(400).json({ message: 'Kode, gedung, dan kapasitas wajib diisi' });
    }

    const data = await prisma.ruangKelas.create({
      data: { kode: code, gedung: building, kapasitas: parseInt(capacity) },
    });

    return res.status(201).json({
      message: 'Ruang kelas berhasil ditambahkan',
      data: { id: data.id, code: data.kode, building: data.gedung, capacity: data.kapasitas },
    });
  } catch (error) {
    console.error('RuangKelas Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const update = async (req, res) => {
  try {
    const { code, building, capacity } = req.body;
    const data = await prisma.ruangKelas.update({
      where: { id: req.params.id },
      data: {
        ...(code && { kode: code }),
        ...(building && { gedung: building }),
        ...(capacity && { kapasitas: parseInt(capacity) }),
      },
    });
    return res.status(200).json({
      message: 'Ruang kelas berhasil diperbarui',
      data: { id: data.id, code: data.kode, building: data.gedung, capacity: data.kapasitas },
    });
  } catch (error) {
    console.error('RuangKelas Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.ruangKelas.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Ruang kelas berhasil dihapus' });
  } catch (error) {
    console.error('RuangKelas Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, create, update, remove };
