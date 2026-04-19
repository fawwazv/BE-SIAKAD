// src/controllers/dashboardController.js
// ═══════════════════════════════════════════════
// DASHBOARD STATS CONTROLLER
// Role-specific dashboard data endpoints
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

/**
 * GET /api/dashboard/stats
 * Admin KPI dashboard stats
 */
const getStats = async (req, res) => {
  try {
    const roles = await prisma.role.findMany();
    const roleMap = {};
    roles.forEach((r) => (roleMap[r.nama_role] = r.id));

    const [totalSiswa, totalGuru, totalKelas, totalMapel] = await Promise.all([
      prisma.user.count({ where: { role_id: roleMap['Siswa'], status_aktif: true } }),
      prisma.user.count({
        where: {
          role_id: { in: [roleMap['Guru Mapel'], roleMap['Wali Kelas']].filter(Boolean) },
          status_aktif: true,
        },
      }),
      prisma.masterKelas.count(),
      prisma.mataPelajaran.count(),
    ]);

    return res.status(200).json({
      message: 'Statistik dashboard berhasil diambil',
      data: {
        totalSiswa,
        totalGuru,
        totalKelas,
        totalMapel,
      },
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/dashboard/wali-kelas
 * Wali Kelas dashboard: class summary, attendance %, grade averages, flagged students (FR-05.1)
 */
const getWaliKelasDashboard = async (req, res) => {
  try {
    const waliId = req.user.userId;

    // Find rombel where this user is wali kelas
    const rombel = await prisma.rombel.findFirst({
      where: { wali_kelas_id: waliId },
      include: {
        master_kelas: true,
        tahun_ajaran: true,
        siswa: {
          include: {
            siswa: { select: { id: true, nama_lengkap: true, nomor_induk: true } },
          },
        },
      },
    });

    if (!rombel) {
      return res.status(200).json({
        message: 'Anda belum ditugaskan sebagai wali kelas',
        data: { hasClass: false },
      });
    }

    const siswaIds = rombel.siswa.map((s) => s.siswa_id);

    // Get attendance stats per student
    const kehadiranAll = await prisma.kehadiran.findMany({
      where: { siswa_id: { in: siswaIds } },
    });

    // Group kehadiran by siswa
    const kehadiranMap = {};
    siswaIds.forEach((id) => {
      kehadiranMap[id] = { hadir: 0, sakit: 0, izin: 0, alpa: 0, total: 0 };
    });
    kehadiranAll.forEach((k) => {
      if (kehadiranMap[k.siswa_id]) {
        kehadiranMap[k.siswa_id][k.status.toLowerCase()]++;
        kehadiranMap[k.siswa_id].total++;
      }
    });

    // Get active semester
    const activeSemester = await prisma.semester.findFirst({
      where: { is_active: true },
    });

    // Get grade averages per student
    let nilaiMap = {};
    if (activeSemester) {
      const nilaiAll = await prisma.nilai.findMany({
        where: {
          siswa_id: { in: siswaIds },
          semester_id: activeSemester.id,
        },
        include: { mata_pelajaran: { select: { nama: true } } },
      });

      nilaiAll.forEach((n) => {
        if (!nilaiMap[n.siswa_id]) nilaiMap[n.siswa_id] = [];
        nilaiMap[n.siswa_id].push({
          mapel: n.mata_pelajaran.nama,
          nilaiAkhir: n.nilai_akhir,
        });
      });
    }

    // Build student summaries
    const studentSummaries = rombel.siswa.map((rs) => {
      const s = rs.siswa;
      const kh = kehadiranMap[s.id] || { hadir: 0, total: 0 };
      const attendanceRate = kh.total > 0 ? Math.round((kh.hadir / kh.total) * 100) : 100;

      const grades = nilaiMap[s.id] || [];
      const avgGrade = grades.length > 0
        ? Math.round(grades.reduce((sum, g) => sum + g.nilaiAkhir, 0) / grades.length)
        : 0;

      return {
        id: s.id,
        name: s.nama_lengkap,
        nisn: s.nomor_induk || '-',
        attendanceRate,
        averageGrade: avgGrade,
        totalHadir: kh.hadir,
        totalSakit: kh.sakit,
        totalIzin: kh.izin,
        totalAlpa: kh.alpa,
        isFlagged: attendanceRate < 70,
        grades,
      };
    });

    // Total attendance chart data
    const totalStats = {
      hadir: kehadiranAll.filter((k) => k.status === 'HADIR').length,
      sakit: kehadiranAll.filter((k) => k.status === 'SAKIT').length,
      izin: kehadiranAll.filter((k) => k.status === 'IZIN').length,
      alpa: kehadiranAll.filter((k) => k.status === 'ALPA').length,
    };

    return res.status(200).json({
      message: 'Dashboard wali kelas berhasil diambil',
      data: {
        hasClass: true,
        kelas: rombel.master_kelas.nama,
        tahunAjaran: rombel.tahun_ajaran.kode,
        totalSiswa: siswaIds.length,
        attendanceStats: totalStats,
        flaggedStudents: studentSummaries.filter((s) => s.isFlagged),
        students: studentSummaries,
      },
    });
  } catch (error) {
    console.error('WaliKelas Dashboard Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/dashboard/siswa
 * Student dashboard: today's schedule + announcements (FR-06.1)
 */
const getSiswaDashboard = async (req, res) => {
  try {
    const siswaId = req.user.userId;

    // Get student's rombel → master_kelas
    const rombelSiswa = await prisma.rombelSiswa.findFirst({
      where: { siswa_id: siswaId },
      include: { rombel: { include: { master_kelas: true } } },
    });

    const kelasId = rombelSiswa?.rombel?.master_kelas_id;

    // Get today's schedule
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const today = days[new Date().getDay()];

    let todaySchedule = [];
    if (kelasId) {
      const jadwal = await prisma.jadwalPelajaran.findMany({
        where: { master_kelas_id: kelasId, hari: today },
        include: {
          mata_pelajaran: { select: { nama: true } },
          ruang_kelas: { select: { kode: true } },
        },
        orderBy: { slot_index: 'asc' },
      });

      const guruIds = jadwal.map((j) => j.guru_id).filter(Boolean);
      const gurus = await prisma.user.findMany({
        where: { id: { in: guruIds } },
        select: { id: true, nama_lengkap: true },
      });
      const guruMap = {};
      gurus.forEach((g) => (guruMap[g.id] = g.nama_lengkap));

      todaySchedule = jadwal.map((j) => ({
        id: j.id,
        subject: j.mata_pelajaran.nama,
        startTime: j.jam_mulai,
        endTime: j.jam_selesai,
        teacher: guruMap[j.guru_id] || '-',
        room: j.ruang_kelas?.kode || '-',
      }));
    }

    // Get latest announcements (Berita dari CMS)
    const announcements = await prisma.kontenPublik.findMany({
      where: { tipe: 'BERITA', is_active: true },
      orderBy: { created_at: 'desc' },
      take: 5,
    });

    // Get student's attendance summary
    const kehadiran = await prisma.kehadiran.findMany({
      where: { siswa_id: siswaId },
    });

    const attendanceStats = {
      hadir: kehadiran.filter((k) => k.status === 'HADIR').length,
      sakit: kehadiran.filter((k) => k.status === 'SAKIT').length,
      izin: kehadiran.filter((k) => k.status === 'IZIN').length,
      alpa: kehadiran.filter((k) => k.status === 'ALPA').length,
    };

    return res.status(200).json({
      message: 'Dashboard siswa berhasil diambil',
      data: {
        kelas: rombelSiswa?.rombel?.master_kelas?.nama || '-',
        hari: today,
        jadwalHariIni: todaySchedule,
        pengumuman: announcements.map((a) => ({
          id: a.id,
          title: a.judul,
          content: a.konten,
          imageUrl: a.gambar_url,
          createdAt: a.created_at,
        })),
        kehadiran: attendanceStats,
      },
    });
  } catch (error) {
    console.error('Siswa Dashboard Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/dashboard/guru
 * Teacher dashboard: teaching summary (classes, subjects, next schedule)
 */
const getGuruDashboard = async (req, res) => {
  try {
    const guruId = req.user.userId;

    // Get guru's mapel assignments
    const assignments = await prisma.guruMapel.findMany({
      where: { guru_id: guruId },
      include: { mata_pelajaran: { select: { nama: true } } },
    });

    // Get today's schedule
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const today = days[new Date().getDay()];

    const todaySchedule = await prisma.jadwalPelajaran.findMany({
      where: { guru_id: guruId, hari: today },
      include: {
        mata_pelajaran: { select: { nama: true } },
        master_kelas: { select: { nama: true } },
        ruang_kelas: { select: { kode: true } },
      },
      orderBy: { slot_index: 'asc' },
    });

    // Count total classes taught
    const totalJadwal = await prisma.jadwalPelajaran.count({ where: { guru_id: guruId } });

    // Count distinct classes
    const distinctClasses = await prisma.jadwalPelajaran.findMany({
      where: { guru_id: guruId },
      distinct: ['master_kelas_id'],
      select: { master_kelas_id: true },
    });

    // Get recent journal entries
    const recentJournals = await prisma.jurnalMengajar.findMany({
      where: { guru_id: guruId },
      orderBy: { created_at: 'desc' },
      take: 5,
      include: {
        jadwal: {
          include: {
            mata_pelajaran: { select: { nama: true } },
            master_kelas: { select: { nama: true } },
          },
        },
      },
    });

    return res.status(200).json({
      message: 'Dashboard guru berhasil diambil',
      data: {
        hari: today,
        totalMapel: assignments.length,
        totalKelas: distinctClasses.length,
        totalJadwal,
        mapelDiampu: assignments.map((a) => ({
          id: a.id,
          subject: a.mata_pelajaran.nama,
          classes: a.kelas_diampu,
          hoursPerWeek: a.jam_per_minggu,
        })),
        jadwalHariIni: todaySchedule.map((j) => ({
          id: j.id,
          subject: j.mata_pelajaran.nama,
          className: j.master_kelas.nama,
          startTime: j.jam_mulai,
          endTime: j.jam_selesai,
          room: j.ruang_kelas?.kode || '-',
        })),
        jurnalTerbaru: recentJournals.map((j) => ({
          id: j.id,
          tanggal: j.tanggal,
          pertemuanKe: j.pertemuan_ke,
          judulMateri: j.judul_materi,
          mapel: j.jadwal.mata_pelajaran.nama,
          kelas: j.jadwal.master_kelas.nama,
        })),
      },
    });
  } catch (error) {
    console.error('Guru Dashboard Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getStats, getWaliKelasDashboard, getSiswaDashboard, getGuruDashboard };
