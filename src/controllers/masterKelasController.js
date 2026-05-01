// src/controllers/masterKelasController.js
// ═══════════════════════════════════════════════
// MASTER KELAS CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const syncActiveRombelWali = async (masterKelasId, waliKelasId) => {
  const activeTahun = await prisma.tahunAjaran.findFirst({
    where: { is_active: true },
    select: { id: true },
  });

  await prisma.rombel.updateMany({
    where: {
      master_kelas_id: masterKelasId,
      ...(activeTahun ? { tahun_ajaran_id: activeTahun.id } : {}),
    },
    data: { wali_kelas_id: waliKelasId || null },
  });
};

const getAll = async (req, res) => {
  try {
    const data = await prisma.masterKelas.findMany({
      include: {
        wali_kelas: { select: { id: true, nama_lengkap: true } },
        ruang_kelas: { select: { id: true, kode: true } },
      },
      orderBy: [{ tingkat: 'asc' }, { nama: 'asc' }],
    });

    return res.status(200).json({
      message: 'Data master kelas berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        name: d.nama,
        grade: d.tingkat,
        homeroomTeacher: d.wali_kelas?.nama_lengkap || '-',
        homeroomTeacherId: d.wali_kelas_id,
        classroom: d.ruang_kelas?.kode || '-',
        classroomId: d.ruang_kelas_id,
      })),
    });
  } catch (error) {
    console.error('MasterKelas GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const create = async (req, res) => {
  try {
    const { name, grade, homeroomTeacherId, classroomId } = req.body;
    if (!name || !grade) {
      return res.status(400).json({ message: 'Nama kelas dan tingkat wajib diisi' });
    }

    const data = await prisma.masterKelas.create({
      data: {
        nama: name,
        tingkat: grade,
        wali_kelas_id: homeroomTeacherId || null,
        ruang_kelas_id: classroomId || null,
      },
      include: {
        wali_kelas: { select: { nama_lengkap: true } },
        ruang_kelas: { select: { kode: true } },
      },
    });

    await syncActiveRombelWali(data.id, data.wali_kelas_id);

    return res.status(201).json({
      message: 'Master kelas berhasil ditambahkan',
      data: {
        id: data.id,
        name: data.nama,
        grade: data.tingkat,
        homeroomTeacher: data.wali_kelas?.nama_lengkap || '-',
        classroom: data.ruang_kelas?.kode || '-',
      },
    });
  } catch (error) {
    console.error('MasterKelas Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const update = async (req, res) => {
  try {
    const { name, grade, homeroomTeacherId, classroomId } = req.body;
    const data = await prisma.masterKelas.update({
      where: { id: req.params.id },
      data: {
        ...(name && { nama: name }),
        ...(grade && { tingkat: grade }),
        ...(homeroomTeacherId !== undefined && { wali_kelas_id: homeroomTeacherId || null }),
        ...(classroomId !== undefined && { ruang_kelas_id: classroomId || null }),
      },
      include: {
        wali_kelas: { select: { nama_lengkap: true } },
        ruang_kelas: { select: { kode: true } },
      },
    });

    if (homeroomTeacherId !== undefined) {
      await syncActiveRombelWali(data.id, data.wali_kelas_id);
    }

    return res.status(200).json({
      message: 'Master kelas berhasil diperbarui',
      data: {
        id: data.id,
        name: data.nama,
        grade: data.tingkat,
        homeroomTeacher: data.wali_kelas?.nama_lengkap || '-',
        classroom: data.ruang_kelas?.kode || '-',
      },
    });
  } catch (error) {
    console.error('MasterKelas Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.masterKelas.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Master kelas berhasil dihapus' });
  } catch (error) {
    console.error('MasterKelas Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, create, update, remove };
