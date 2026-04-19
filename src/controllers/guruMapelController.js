// src/controllers/guruMapelController.js
// ═══════════════════════════════════════════════
// GURU-MAPEL MAPPING CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const getAll = async (req, res) => {
  try {
    const { search = '' } = req.query;

    const where = search
      ? {
          OR: [
            { guru: { nama_lengkap: { contains: search, mode: 'insensitive' } } },
            { mata_pelajaran: { nama: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const data = await prisma.guruMapel.findMany({
      where,
      include: {
        guru: { select: { id: true, nama_lengkap: true } },
        mata_pelajaran: { select: { id: true, nama: true } },
      },
      orderBy: { guru: { nama_lengkap: 'asc' } },
    });

    // Count scheduled slots for each guru
    const jadwalCounts = await prisma.jadwalPelajaran.groupBy({
      by: ['guru_id'],
      _count: { id: true },
    });
    const countMap = {};
    jadwalCounts.forEach((j) => (countMap[j.guru_id] = j._count.id));

    return res.status(200).json({
      message: 'Data pemetaan guru-mapel berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        teacher: d.guru.nama_lengkap,
        teacherId: d.guru_id,
        subject: d.mata_pelajaran.nama,
        subjectId: d.mata_pelajaran_id,
        classes: d.kelas_diampu,
        hoursPerWeek: d.jam_per_minggu,
        scheduled: countMap[d.guru_id] || 0,
      })),
    });
  } catch (error) {
    console.error('GuruMapel GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const create = async (req, res) => {
  try {
    const { teacherId, subjectId, classes, hoursPerWeek } = req.body;
    if (!teacherId || !subjectId) {
      return res.status(400).json({ message: 'Guru dan mata pelajaran wajib diisi' });
    }

    const data = await prisma.guruMapel.create({
      data: {
        guru_id: teacherId,
        mata_pelajaran_id: subjectId,
        kelas_diampu: classes || '',
        jam_per_minggu: parseInt(hoursPerWeek) || 0,
      },
      include: {
        guru: { select: { nama_lengkap: true } },
        mata_pelajaran: { select: { nama: true } },
      },
    });

    return res.status(201).json({
      message: 'Pemetaan guru-mapel berhasil ditambahkan',
      data: {
        id: data.id,
        teacher: data.guru.nama_lengkap,
        subject: data.mata_pelajaran.nama,
        classes: data.kelas_diampu,
        hoursPerWeek: data.jam_per_minggu,
      },
    });
  } catch (error) {
    console.error('GuruMapel Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const update = async (req, res) => {
  try {
    const { teacherId, subjectId, classes, hoursPerWeek } = req.body;
    const data = await prisma.guruMapel.update({
      where: { id: req.params.id },
      data: {
        ...(teacherId && { guru_id: teacherId }),
        ...(subjectId && { mata_pelajaran_id: subjectId }),
        ...(classes !== undefined && { kelas_diampu: classes }),
        ...(hoursPerWeek !== undefined && { jam_per_minggu: parseInt(hoursPerWeek) }),
      },
      include: {
        guru: { select: { nama_lengkap: true } },
        mata_pelajaran: { select: { nama: true } },
      },
    });
    return res.status(200).json({
      message: 'Pemetaan guru-mapel berhasil diperbarui',
      data: {
        id: data.id,
        teacher: data.guru.nama_lengkap,
        subject: data.mata_pelajaran.nama,
        classes: data.kelas_diampu,
        hoursPerWeek: data.jam_per_minggu,
      },
    });
  } catch (error) {
    console.error('GuruMapel Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.guruMapel.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Pemetaan guru-mapel berhasil dihapus' });
  } catch (error) {
    console.error('GuruMapel Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, create, update, remove };
