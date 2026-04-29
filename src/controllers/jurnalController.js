// src/controllers/jurnalController.js
// ═══════════════════════════════════════════════
// JURNAL MENGAJAR CONTROLLER
// Teaching journal: must be filled before attendance
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

/**
 * POST /api/jurnal
 * Guru opens a new meeting session (jurnal entry)
 * Must be created BEFORE attendance can be taken (FR-04.1)
 */
const create = async (req, res) => {
  try {
    const { jadwalId, tanggal, pertemuanKe, judulMateri, deskripsiKegiatan } = req.body;
    const guruId = req.user.userId;

    if (!jadwalId || !tanggal || !pertemuanKe || !judulMateri) {
      return res.status(400).json({ 
        message: 'Jadwal, tanggal, pertemuan ke-, dan judul materi wajib diisi' 
      });
    }

    // Check if jurnal already exists for this jadwal+date
    const existing = await prisma.jurnalMengajar.findUnique({
      where: { jadwal_id_tanggal: { jadwal_id: jadwalId, tanggal } },
    });

    if (existing) {
      return res.status(400).json({ 
        message: 'Jurnal untuk jadwal dan tanggal ini sudah ada. Gunakan endpoint update.' 
      });
    }

    const data = await prisma.jurnalMengajar.create({
      data: {
        jadwal_id: jadwalId,
        guru_id: guruId,
        tanggal,
        pertemuan_ke: parseInt(pertemuanKe),
        judul_materi: judulMateri,
        deskripsi_kegiatan: deskripsiKegiatan || null,
      },
      include: {
        jadwal: {
          include: {
            mata_pelajaran: { select: { nama: true } },
            master_kelas: { select: { nama: true } },
          },
        },
      },
    });

    return res.status(201).json({
      message: 'Jurnal mengajar berhasil dibuat. Anda sekarang dapat membuka sesi absensi.',
      data: {
        id: data.id,
        jadwalId: data.jadwal_id,
        tanggal: data.tanggal,
        pertemuanKe: data.pertemuan_ke,
        judulMateri: data.judul_materi,
        deskripsiKegiatan: data.deskripsi_kegiatan,
        mapel: data.jadwal.mata_pelajaran.nama,
        kelas: data.jadwal.master_kelas.nama,
      },
    });
  } catch (error) {
    console.error('Jurnal Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/jurnal/:jadwalId
 * Get all journal entries for a specific jadwal
 */
const getByJadwal = async (req, res) => {
  try {
    const data = await prisma.jurnalMengajar.findMany({
      where: { jadwal_id: req.params.jadwalId },
      orderBy: { pertemuan_ke: 'asc' },
    });

    return res.status(200).json({
      message: 'Data jurnal mengajar berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        jadwalId: d.jadwal_id,
        tanggal: d.tanggal,
        pertemuanKe: d.pertemuan_ke,
        judulMateri: d.judul_materi,
        deskripsiKegiatan: d.deskripsi_kegiatan,
        createdAt: d.created_at,
      })),
    });
  } catch (error) {
    console.error('Jurnal GetByJadwal Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/jurnal/check/:jadwalId/:tanggal
 * Check if jurnal exists for a jadwal+date (used by frontend before allowing attendance)
 */
const checkExists = async (req, res) => {
  try {
    const { jadwalId, tanggal } = req.params;

    const jurnal = await prisma.jurnalMengajar.findUnique({
      where: { jadwal_id_tanggal: { jadwal_id: jadwalId, tanggal } },
    });

    return res.status(200).json({
      message: jurnal ? 'Jurnal ditemukan' : 'Jurnal belum dibuat',
      data: {
        exists: !!jurnal,
        jurnal: jurnal ? {
          id: jurnal.id,
          pertemuanKe: jurnal.pertemuan_ke,
          judulMateri: jurnal.judul_materi,
          deskripsiKegiatan: jurnal.deskripsi_kegiatan,
        } : null,
      },
    });
  } catch (error) {
    console.error('Jurnal Check Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * PUT /api/jurnal/:id
 * Update an existing journal entry
 */
const update = async (req, res) => {
  try {
    const { pertemuanKe, judulMateri, deskripsiKegiatan } = req.body;

    const updateData = {};
    if (pertemuanKe !== undefined) updateData.pertemuan_ke = parseInt(pertemuanKe);
    if (judulMateri) updateData.judul_materi = judulMateri;
    if (deskripsiKegiatan !== undefined) updateData.deskripsi_kegiatan = deskripsiKegiatan || null;

    const data = await prisma.jurnalMengajar.update({
      where: { id: req.params.id },
      data: updateData,
    });

    return res.status(200).json({
      message: 'Jurnal mengajar berhasil diperbarui',
      data: {
        id: data.id,
        pertemuanKe: data.pertemuan_ke,
        judulMateri: data.judul_materi,
        deskripsiKegiatan: data.deskripsi_kegiatan,
      },
    });
  } catch (error) {
    console.error('Jurnal Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * DELETE /api/jurnal/:id
 * Cascade: hapus Kehadiran & SesiAbsensi terkait dulu, lalu JurnalMengajar
 */
const remove = async (req, res) => {
  try {
    // Get jurnal data first to get jadwal_id + tanggal
    const jurnal = await prisma.jurnalMengajar.findUnique({
      where: { id: req.params.id },
      select: { jadwal_id: true, tanggal: true }
    });

    if (!jurnal) {
      return res.status(404).json({ message: 'Jurnal tidak ditemukan' });
    }

    // Cascade delete (order matters — FK constraints)
    await prisma.$transaction([
      // 1. Hapus semua Kehadiran untuk sesi ini
      prisma.kehadiran.deleteMany({
        where: { jadwal_id: jurnal.jadwal_id, tanggal: jurnal.tanggal }
      }),
      // 2. Hapus SesiAbsensi terkait
      prisma.sesiAbsensi.deleteMany({
        where: { jadwal_id: jurnal.jadwal_id, tanggal: jurnal.tanggal }
      }),
      // 3. Hapus JurnalMengajar
      prisma.jurnalMengajar.delete({ where: { id: req.params.id } }),
    ]);

    return res.status(200).json({ message: 'Pertemuan dan seluruh data absensinya berhasil dihapus' });
  } catch (error) {
    console.error('Jurnal Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { create, getByJadwal, checkExists, update, remove };
