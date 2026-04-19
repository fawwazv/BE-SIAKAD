// src/controllers/semesterController.js
// ═══════════════════════════════════════════════
// SEMESTER CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const getAll = async (req, res) => {
  try {
    const data = await prisma.semester.findMany({
      include: { tahun_ajaran: true },
      orderBy: [{ tahun_ajaran: { kode: 'desc' } }, { nama: 'asc' }],
    });

    return res.status(200).json({
      message: 'Data semester berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        name: d.nama,
        academicYear: d.tahun_ajaran.kode,
        academicYearId: d.tahun_ajaran_id,
        isActive: d.is_active,
      })),
    });
  } catch (error) {
    console.error('Semester GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const create = async (req, res) => {
  try {
    const { name, academicYearId, isActive } = req.body;

    if (!name || !academicYearId) {
      return res.status(400).json({ message: 'Nama semester dan tahun ajaran wajib diisi' });
    }

    if (isActive) {
      await prisma.semester.updateMany({ data: { is_active: false } });
    }

    const data = await prisma.semester.create({
      data: { nama: name, tahun_ajaran_id: academicYearId, is_active: isActive || false },
      include: { tahun_ajaran: true },
    });

    return res.status(201).json({
      message: 'Semester berhasil ditambahkan',
      data: { id: data.id, name: data.nama, academicYear: data.tahun_ajaran.kode, isActive: data.is_active },
    });
  } catch (error) {
    console.error('Semester Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const update = async (req, res) => {
  try {
    const { name, academicYearId, isActive } = req.body;

    if (isActive) {
      await prisma.semester.updateMany({ data: { is_active: false } });
    }

    const data = await prisma.semester.update({
      where: { id: req.params.id },
      data: {
        ...(name && { nama: name }),
        ...(academicYearId && { tahun_ajaran_id: academicYearId }),
        ...(isActive !== undefined && { is_active: isActive }),
      },
      include: { tahun_ajaran: true },
    });

    return res.status(200).json({
      message: 'Semester berhasil diperbarui',
      data: { id: data.id, name: data.nama, academicYear: data.tahun_ajaran.kode, isActive: data.is_active },
    });
  } catch (error) {
    console.error('Semester Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const toggleActive = async (req, res) => {
  try {
    const existing = await prisma.semester.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Semester tidak ditemukan' });

    const newActive = !existing.is_active;

    if (newActive) {
      await prisma.semester.updateMany({ data: { is_active: false } });
    }

    const data = await prisma.semester.update({
      where: { id: req.params.id },
      data: { is_active: newActive },
      include: { tahun_ajaran: true },
    });

    return res.status(200).json({
      message: `Semester berhasil ${newActive ? 'diaktifkan' : 'dinonaktifkan'}`,
      data: { id: data.id, name: data.nama, academicYear: data.tahun_ajaran.kode, isActive: data.is_active },
    });
  } catch (error) {
    console.error('Semester Toggle Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.semester.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Semester berhasil dihapus' });
  } catch (error) {
    console.error('Semester Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, create, update, toggleActive, remove };
