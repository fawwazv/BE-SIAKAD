// src/controllers/catatanAkademikController.js
// ═══════════════════════════════════════════════
// CATATAN AKADEMIK CONTROLLER
// Wali Kelas descriptive notes per student per semester
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const { canBypassWaliOwnership, findOwnedRombel } = require('../middlewares/ownershipMiddleware');

const ensureCanManageStudentNote = async (req, siswaId, semesterId) => {
  const requesterRole = req.user.role;
  const requesterId = req.user.userId;

  if (canBypassWaliOwnership(requesterRole)) return true;
  if (requesterRole === 'Siswa') return siswaId === requesterId;

  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    select: { tahun_ajaran_id: true },
  });
  if (!semester) return false;

  const rombel = await findOwnedRombel({
    userId: requesterId,
    role: requesterRole,
    tahunAjaranId: semester.tahun_ajaran_id,
    siswaId,
  });

  return Boolean(rombel);
};

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

    const allowed = await ensureCanManageStudentNote(req, siswaId, semesterId);
    if (!allowed) {
      return res.status(403).json({ message: 'Anda hanya dapat mengelola catatan siswa di kelas wali Anda' });
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

    if (semesterId) {
      const allowed = await ensureCanManageStudentNote(req, req.params.siswaId, semesterId);
      if (!allowed) {
        return res.status(403).json({ message: 'Anda tidak memiliki akses ke catatan siswa ini' });
      }
    } else if (req.user.role === 'Siswa' && req.params.siswaId !== req.user.userId) {
      return res.status(403).json({ message: 'Anda tidak memiliki akses ke catatan siswa ini' });
    } else if (!canBypassWaliOwnership(req.user.role) && req.user.role !== 'Siswa') {
      const rombel = await findOwnedRombel({
        userId: req.user.userId,
        role: req.user.role,
        siswaId: req.params.siswaId,
      });
      if (!rombel) {
        return res.status(403).json({ message: 'Anda tidak memiliki akses ke catatan siswa ini' });
      }
    }

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

    const semester = await prisma.semester.findUnique({
      where: { id: semesterId },
      select: { tahun_ajaran_id: true },
    });
    if (!semester) return res.status(404).json({ message: 'Semester tidak ditemukan' });

    const rombel = await findOwnedRombel({
      userId: req.user.userId,
      role: req.user.role,
      masterKelasId: req.params.kelasId,
      tahunAjaranId: semester.tahun_ajaran_id,
    });

    if (!rombel) {
      return res.status(403).json({ message: 'Anda tidak memiliki akses ke kelas ini' });
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
    const existing = await prisma.catatanAkademik.findUnique({
      where: { id: req.params.id },
      select: { siswa_id: true, semester_id: true },
    });
    if (!existing) return res.status(404).json({ message: 'Catatan akademik tidak ditemukan' });

    const allowed = await ensureCanManageStudentNote(req, existing.siswa_id, existing.semester_id);
    if (!allowed) {
      return res.status(403).json({ message: 'Anda hanya dapat menghapus catatan siswa di kelas wali Anda' });
    }

    await prisma.catatanAkademik.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Catatan akademik berhasil dihapus' });
  } catch (error) {
    console.error('CatatanAkademik Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { upsert, getBySiswa, getByKelas, remove };
