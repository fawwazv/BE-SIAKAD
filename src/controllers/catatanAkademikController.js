// src/controllers/catatanAkademikController.js
// ═══════════════════════════════════════════════
// CATATAN AKADEMIK CONTROLLER
// Wali Kelas descriptive notes per student per semester
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

/**
 * POST /api/catatan-akademik
 * Wali Kelas creates/updates a note for a student
 */
const upsert = async (req, res) => {
  try {
    const { siswaId, semesterId, catatan } = req.body;
    const waliKelasId = req.user.userId;

    if (!siswaId || !semesterId || !catatan) {
      return res.status(400).json({ message: 'Siswa, semester, dan catatan wajib diisi' });
    }

    const data = await prisma.catatanAkademik.upsert({
      where: {
        siswa_id_semester_id: {
          siswa_id: siswaId,
          semester_id: semesterId,
        },
      },
      update: {
        catatan,
        wali_kelas_id: waliKelasId,
      },
      create: {
        siswa_id: siswaId,
        semester_id: semesterId,
        wali_kelas_id: waliKelasId,
        catatan,
      },
      include: {
        siswa: { select: { nama_lengkap: true } },
        semester: { select: { nama: true, tahun_ajaran: { select: { kode: true } } } },
      },
    });

    return res.status(200).json({
      message: 'Catatan akademik berhasil disimpan',
      data: {
        id: data.id,
        siswaId: data.siswa_id,
        siswaName: data.siswa.nama_lengkap,
        semesterId: data.semester_id,
        semester: data.semester.nama,
        tahunAjaran: data.semester.tahun_ajaran.kode,
        catatan: data.catatan,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    console.error('CatatanAkademik Upsert Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/catatan-akademik/siswa/:siswaId
 * Get all catatan for a student (all semesters)
 */
const getBySiswa = async (req, res) => {
  try {
    const { semesterId } = req.query;
    const where = { siswa_id: req.params.siswaId };
    if (semesterId) where.semester_id = semesterId;

    const data = await prisma.catatanAkademik.findMany({
      where,
      include: {
        semester: { select: { nama: true, tahun_ajaran: { select: { kode: true } } } },
        wali_kelas: { select: { nama_lengkap: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json({
      message: 'Data catatan akademik berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        siswaId: d.siswa_id,
        semesterId: d.semester_id,
        semester: d.semester.nama,
        tahunAjaran: d.semester.tahun_ajaran.kode,
        catatan: d.catatan,
        waliKelas: d.wali_kelas.nama_lengkap,
        updatedAt: d.updated_at,
      })),
    });
  } catch (error) {
    console.error('CatatanAkademik GetBySiswa Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/catatan-akademik/kelas/:kelasId
 * Get all catatan for students in a rombel (for wali kelas overview)
 */
const getByKelas = async (req, res) => {
  try {
    const { semesterId } = req.query;

    if (!semesterId) {
      return res.status(400).json({ message: 'Parameter semesterId wajib diisi' });
    }

    // Get students in this rombel
    const rombel = await prisma.rombel.findFirst({
      where: { master_kelas_id: req.params.kelasId },
      include: { siswa: { select: { siswa_id: true } } },
    });

    if (!rombel) {
      return res.status(404).json({ message: 'Rombel tidak ditemukan' });
    }

    const siswaIds = rombel.siswa.map((s) => s.siswa_id);

    const data = await prisma.catatanAkademik.findMany({
      where: {
        siswa_id: { in: siswaIds },
        semester_id: semesterId,
      },
      include: {
        siswa: { select: { id: true, nama_lengkap: true, nomor_induk: true } },
      },
      orderBy: { siswa: { nama_lengkap: 'asc' } },
    });

    return res.status(200).json({
      message: 'Data catatan akademik kelas berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        siswaId: d.siswa_id,
        siswaName: d.siswa.nama_lengkap,
        siswaNoInduk: d.siswa.nomor_induk,
        catatan: d.catatan,
        updatedAt: d.updated_at,
      })),
    });
  } catch (error) {
    console.error('CatatanAkademik GetByKelas Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * DELETE /api/catatan-akademik/:id
 */
const remove = async (req, res) => {
  try {
    await prisma.catatanAkademik.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Catatan akademik berhasil dihapus' });
  } catch (error) {
    console.error('CatatanAkademik Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { upsert, getBySiswa, getByKelas, remove };
