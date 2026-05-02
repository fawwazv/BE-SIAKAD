// src/controllers/dashboardController.js
// ═══════════════════════════════════════════════
// DASHBOARD STATS CONTROLLER
// Role-specific dashboard data endpoints
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const QR_EXPIRY_SECONDS = 180; // 3 menit
const DAY_ORDER = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad2 = (value) => String(value).padStart(2, '0');

const getJakartaPeriod = (date = new Date()) => {
  const jakartaDate = new Date(date.getTime() + JAKARTA_OFFSET_MS);
  const month = jakartaDate.getUTCMonth() + 1;
  const year = jakartaDate.getUTCFullYear();

  return {
    dayName: DAY_NAMES[jakartaDate.getUTCDay()],
    month,
    year,
    datePrefix: `${year}-${pad2(month)}`,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
};

const sortSchedule = (a, b) => {
  const dayA = DAY_ORDER.indexOf(a.hari);
  const dayB = DAY_ORDER.indexOf(b.hari);
  const normalizedDayA = dayA === -1 ? DAY_ORDER.length : dayA;
  const normalizedDayB = dayB === -1 ? DAY_ORDER.length : dayB;
  if (normalizedDayA !== normalizedDayB) return normalizedDayA - normalizedDayB;
  return (a.slot_index || 0) - (b.slot_index || 0);
};

/**
 * GET /api/dashboard/stats
 * Admin KPI dashboard stats
 */
const getStats = async (req, res) => {
  try {
    const roles = await prisma.role.findMany();
    const roleMap = {};
    roles.forEach((r) => (roleMap[r.nama_role] = r.id));

    const siswaRoleId = roleMap['Siswa'];
    const guruRoleIds = [roleMap['Guru Mapel'], roleMap['Wali Kelas']].filter(Boolean);
    const adminRoleId = roleMap['Administrator'];

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalAdmin,
      totalSiswa,
      totalGuru,
      totalKelas,
      totalMapel,
      totalKonten,
      activeKonten,
      activeTahunAjaran,
      activeSemester,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status_aktif: true } }),
      prisma.user.count({ where: { status_aktif: false } }),
      adminRoleId
        ? prisma.user.count({ where: { role_id: adminRoleId, status_aktif: true } })
        : Promise.resolve(0),
      siswaRoleId
        ? prisma.user.count({ where: { role_id: siswaRoleId, status_aktif: true } })
        : Promise.resolve(0),
      guruRoleIds.length
        ? prisma.user.count({ where: { role_id: { in: guruRoleIds }, status_aktif: true } })
        : Promise.resolve(0),
      prisma.masterKelas.count(),
      prisma.mataPelajaran.count(),
      prisma.kontenPublik.count(),
      prisma.kontenPublik.count({ where: { is_active: true } }),
      prisma.tahunAjaran.findFirst({
        where: { is_active: true },
        select: { id: true, kode: true, deskripsi: true },
      }),
      prisma.semester.findFirst({
        where: { is_active: true },
        include: { tahun_ajaran: true },
      }),
    ]);

    return res.status(200).json({
      message: 'Statistik dashboard berhasil diambil',
      data: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        totalAdmin,
        totalSiswa,
        totalGuru,
        totalKelas,
        totalMapel,
        totalKonten,
        activeKonten,
        activeTahunAjaran,
        activeSemester: activeSemester
          ? {
              id: activeSemester.id,
              nama: activeSemester.nama,
              tahunAjaran: activeSemester.tahun_ajaran?.kode || '-',
              label: `${activeSemester.nama} - ${activeSemester.tahun_ajaran?.kode || '-'}`,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/dashboard/kurikulum
 * Curriculum dashboard data sourced directly from academic master data.
 */
const getKurikulumDashboard = async (req, res) => {
  try {
    const roles = await prisma.role.findMany();
    const roleMap = {};
    roles.forEach((r) => (roleMap[r.nama_role] = r.id));

    const [activeTahunAjaran, activeSemester] = await Promise.all([
      prisma.tahunAjaran.findFirst({
        where: { is_active: true },
        select: { id: true, kode: true, deskripsi: true },
      }),
      prisma.semester.findFirst({
        where: { is_active: true },
        include: { tahun_ajaran: true },
      }),
    ]);

    const activeYearWhere = activeTahunAjaran
      ? { tahun_ajaran_id: activeTahunAjaran.id }
      : { id: '__no_active_tahun_ajaran__' };

    const siswaRoleId = roleMap['Siswa'];
    const guruRoleIds = [roleMap['Guru Mapel'], roleMap['Wali Kelas']].filter(Boolean);

    const countActiveSiswa = siswaRoleId
      ? prisma.user.count({ where: { role_id: siswaRoleId, status_aktif: true } })
      : Promise.resolve(0);
    const countActiveGuru = guruRoleIds.length > 0
      ? prisma.user.count({ where: { role_id: { in: guruRoleIds }, status_aktif: true } })
      : Promise.resolve(0);

    const [
      totalSiswa,
      totalGuru,
      totalKelas,
      totalMapel,
      totalRombel,
      totalJadwal,
      totalRuang,
      totalGuruMapel,
      rombelTerkunci,
      rombelTanpaWali,
      jadwalTanpaRuang,
      scheduleByDayRaw,
      allSchedules,
      rombelOverviewRaw,
    ] = await Promise.all([
      countActiveSiswa,
      countActiveGuru,
      prisma.masterKelas.count(),
      prisma.mataPelajaran.count(),
      prisma.rombel.count({ where: activeYearWhere }),
      prisma.jadwalPelajaran.count(),
      prisma.ruangKelas.count(),
      prisma.guruMapel.count(),
      prisma.rombel.count({ where: { ...activeYearWhere, is_locked: true } }),
      prisma.rombel.count({
        where: {
          ...activeYearWhere,
          wali_kelas_id: null,
          master_kelas: { wali_kelas_id: null },
        },
      }),
      prisma.jadwalPelajaran.count({ where: { ruang_kelas_id: null } }),
      prisma.jadwalPelajaran.groupBy({
        by: ['hari'],
        _count: { _all: true },
      }),
      prisma.jadwalPelajaran.findMany({
        include: {
          master_kelas: { select: { nama: true } },
          mata_pelajaran: { select: { nama: true } },
          ruang_kelas: { select: { kode: true } },
          guru: { select: { nama_lengkap: true } },
        },
      }),
      prisma.rombel.findMany({
        where: activeYearWhere,
        include: {
          master_kelas: {
            select: {
              nama: true,
              tingkat: true,
              wali_kelas: { select: { nama_lengkap: true } },
            },
          },
          wali_kelas: { select: { nama_lengkap: true } },
          ruang_kelas: { select: { kode: true } },
          _count: { select: { siswa: true } },
        },
        take: 8,
      }),
    ]);

    const scheduleCounts = {};
    scheduleByDayRaw.forEach((item) => {
      scheduleCounts[item.hari] = item._count?._all || 0;
    });

    const scheduleByDay = DAY_ORDER.slice(0, 6).map((day) => ({
      day,
      count: scheduleCounts[day] || 0,
    }));

    const recentSchedules = allSchedules
      .sort(sortSchedule)
      .slice(0, 6)
      .map((j) => ({
        id: j.id,
        day: j.hari,
        startTime: j.jam_mulai,
        endTime: j.jam_selesai,
        subject: j.mata_pelajaran?.nama || '-',
        className: j.master_kelas?.nama || '-',
        teacher: j.guru?.nama_lengkap || '-',
        room: j.ruang_kelas?.kode || '-',
      }));

    const rombelOverview = rombelOverviewRaw.map((r) => ({
      id: r.id,
      className: r.master_kelas?.nama || '-',
      grade: r.master_kelas?.tingkat || '-',
      waliKelas: r.wali_kelas?.nama_lengkap || r.master_kelas?.wali_kelas?.nama_lengkap || '-',
      room: r.ruang_kelas?.kode || '-',
      studentCount: r._count?.siswa || 0,
      isLocked: r.is_locked,
    }));

    return res.status(200).json({
      message: 'Dashboard kurikulum berhasil diambil',
      data: {
        activeTahunAjaran,
        activeSemester: activeSemester
          ? {
              id: activeSemester.id,
              nama: activeSemester.nama,
              tahunAjaran: activeSemester.tahun_ajaran?.kode || '-',
              label: `${activeSemester.nama} - ${activeSemester.tahun_ajaran?.kode || '-'}`,
            }
          : null,
        totalSiswa,
        totalGuru,
        totalKelas,
        totalMapel,
        totalRombel,
        totalJadwal,
        totalRuang,
        totalGuruMapel,
        rombelTerkunci,
        rombelTanpaWali,
        jadwalTanpaRuang,
        scheduleByDay,
        recentSchedules,
        rombelOverview,
      },
    });
  } catch (error) {
    console.error('Kurikulum Dashboard Error:', error);
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

    const activeTahunAjaran = await prisma.tahunAjaran.findFirst({
      where: { is_active: true },
      select: { id: true },
    });

    const mappedMasterKelas = await prisma.masterKelas.findMany({
      where: { wali_kelas_id: waliId },
      select: { id: true },
    });
    const mappedMasterKelasIds = mappedMasterKelas.map((kelas) => kelas.id);

    // Find rombel where this user is wali kelas directly or through Master Kelas mapping.
    const rombel = await prisma.rombel.findFirst({
      where: {
        ...(activeTahunAjaran ? { tahun_ajaran_id: activeTahunAjaran.id } : {}),
        OR: [
          { wali_kelas_id: waliId },
          ...(mappedMasterKelasIds.length
            ? [{ master_kelas_id: { in: mappedMasterKelasIds } }]
            : []),
        ],
      },
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

    if (rombel.wali_kelas_id !== waliId) {
      await prisma.rombel.update({
        where: { id: rombel.id },
        data: { wali_kelas_id: waliId },
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
        rombelId: rombel.id,
        masterKelasId: rombel.master_kelas_id,
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
    const period = getJakartaPeriod();

    const activeSemester = await prisma.semester.findFirst({
      where: { is_active: true },
      include: { tahun_ajaran: true },
    });

    // Get student's rombel for the active semester academic year.
    const rombelSiswa = await prisma.rombelSiswa.findFirst({
      where: {
        siswa_id: siswaId,
        ...(activeSemester?.tahun_ajaran_id
          ? { rombel: { tahun_ajaran_id: activeSemester.tahun_ajaran_id } }
          : {}),
      },
      include: { rombel: { include: { master_kelas: true } } },
    });

    const kelasId = rombelSiswa?.rombel?.master_kelas_id;

    // Get today's schedule
    const today = period.dayName;

    let todaySchedule = [];
    if (kelasId) {
      const jadwal = await prisma.jadwalPelajaran.findMany({
        where: { master_kelas_id: kelasId, hari: today },
        include: {
          mata_pelajaran: { select: { nama: true } },
          ruang_kelas: { select: { kode: true } },
          guru: { select: { nama_lengkap: true } },
        },
        orderBy: { slot_index: 'asc' },
      });

      todaySchedule = jadwal.map((j) => ({
        id: j.id,
        subject: j.mata_pelajaran?.nama || '-',
        startTime: j.jam_mulai,
        endTime: j.jam_selesai,
        teacher: j.guru?.nama_lengkap || '-',
        room: j.ruang_kelas?.kode || '-',
      }));
    }

    // Get latest announcements (Berita dari CMS)
    const announcementsRaw = await prisma.kontenPublik.findMany({
      where: { tipe: 'BERITA', is_active: true },
      orderBy: { created_at: 'desc' },
      take: 5,
    });

    const announcements = announcementsRaw.map(a => ({
      id: a.id,
      title: a.judul,
      content: a.konten,
      imageUrl: a.gambar_url,
      createdAt: a.created_at,
    }));

    const kehadiran = activeSemester
      ? await prisma.kehadiran.findMany({
          where: {
            siswa_id: siswaId,
            semester_id: activeSemester.id,
            tanggal: { startsWith: period.datePrefix },
          },
        })
      : [];

    const attendanceStats = {
      hadir: kehadiran.filter((k) => k.status === 'HADIR').length,
      sakit: kehadiran.filter((k) => k.status === 'SAKIT').length,
      izin: kehadiran.filter((k) => k.status === 'IZIN').length,
      alpa: kehadiran.filter((k) => k.status === 'ALPA').length,
      periode: {
        bulan: period.month,
        tahun: period.year,
        label: period.label,
      },
    };

    return res.status(200).json({
      message: 'Dashboard siswa berhasil diambil',
      data: {
        kelasId: kelasId || '',
        kelas: rombelSiswa?.rombel?.master_kelas?.nama || '-',
        hari: today,
        jadwalHariIni: todaySchedule,
        pengumuman: announcements,
        kehadiran: attendanceStats,
        semesterAktif: activeSemester
          ? {
              id: activeSemester.id,
              label: `${activeSemester.nama} - ${activeSemester.tahun_ajaran?.kode || '-'}`,
            }
          : null,
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

    // Build daftarKelas: unique Class+Subject from ALL schedules, with student count
    const allSchedules = await prisma.jadwalPelajaran.findMany({
      where: { guru_id: guruId },
      include: {
        master_kelas: {
          select: {
            id: true,
            nama: true,
            rombel: {
              where: { tahun_ajaran: { is_active: true } },
              select: { id: true, _count: { select: { siswa: true } } },
              take: 1,
            },
          },
        },
        mata_pelajaran: { select: { id: true, nama: true } },
      },
    });

    // Group by unique masterKelasId + mataPelajaranId
    const classMap = new Map();
    for (const j of allSchedules) {
      const key = `${j.master_kelas_id}_${j.mata_pelajaran_id}`;
      if (!classMap.has(key)) {
        const rombel = j.master_kelas.rombel[0] ?? null;
        classMap.set(key, {
          id: key,
          masterKelasId: j.master_kelas_id,
          mataPelajaranId: j.mata_pelajaran_id,
          subject: j.mata_pelajaran.nama,
          className: j.master_kelas.nama,
          rombelId: rombel?.id ?? null,
          studentCount: rombel?._count?.siswa ?? 0,
          days: [j.hari],
        });
      } else {
        const entry = classMap.get(key);
        if (!entry.days.includes(j.hari)) entry.days.push(j.hari);
      }
    }
    const daftarKelas = Array.from(classMap.values()).map((c) => ({
      ...c,
      scheduleSummary: c.days.join(', '),
    }));

    // Count distinct classes
    const distinctClasses = [...new Set(allSchedules.map((j) => j.master_kelas_id))];

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
        daftarKelas,
        jadwalHariIni: todaySchedule.map((j) => ({
          id: j.id,
          masterKelasId: j.master_kelas_id,
          mataPelajaranId: j.mata_pelajaran_id,
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

/**
 * GET /api/dashboard/guru/kelas/:id
 * Teacher class detail: fetch students, attendance, grades for a specific class+subject
 * 
 * Enhanced: Returns dynamic per-pertemuan (P1, P2, ..., Pn) recap matrix
 * with backend-calculated percentages for frontend rendering.
 */
const getGuruClassDetail = async (req, res) => {
  try {
    const guruId = req.user.userId;
    const { id } = req.params;

    // id format is masterKelasId_mataPelajaranId
    const [masterKelasId, mataPelajaranId] = id.split('_');

    if (!masterKelasId || !mataPelajaranId) {
      return res.status(400).json({ message: 'Format ID kelas tidak valid' });
    }

    // Get active tahun ajaran
    const activeTahunAjaran = await prisma.tahunAjaran.findFirst({
      where: { is_active: true }
    });

    if (!activeTahunAjaran) {
      return res.status(404).json({ message: 'Tidak ada tahun ajaran aktif' });
    }

    // Find rombel for this class and active year
    const rombel = await prisma.rombel.findFirst({
      where: {
        master_kelas_id: masterKelasId,
        tahun_ajaran_id: activeTahunAjaran.id
      },
      include: {
        siswa: {
          include: {
            siswa: { select: { id: true, nama_lengkap: true, nomor_induk: true } }
          }
        },
        master_kelas: { select: { nama: true } }
      }
    });

    if (!rombel) {
      return res.status(404).json({ message: 'Rombel untuk kelas ini belum ada pada tahun ajaran aktif' });
    }

    const siswaIds = rombel.siswa.map(s => s.siswa_id);

    // Fetch grades (nilai) for this mapel and students
    const activeSemester = await prisma.semester.findFirst({ where: { is_active: true } });

    let gradesData = [];
    if (activeSemester) {
      gradesData = await prisma.nilai.findMany({
        where: {
          mata_pelajaran_id: mataPelajaranId,
          siswa_id: { in: siswaIds },
          semester_id: activeSemester.id
        }
      });
    }

    const mapel = await prisma.mataPelajaran.findUnique({
      where: { id: mataPelajaranId },
      select: { nama: true }
    });

    // Fetch past journals and attendance for this specific class+subject+guru
    const schedules = await prisma.jadwalPelajaran.findMany({
      where: {
        master_kelas_id: masterKelasId,
        mata_pelajaran_id: mataPelajaranId,
        guru_id: guruId
      },
      select: { id: true }
    });

    const scheduleIds = schedules.map(s => s.id);

    // Journals sorted by pertemuan_ke ASC for consistent P1, P2, ... ordering
    const journals = await prisma.jurnalMengajar.findMany({
      where: {
        jadwal_id: { in: scheduleIds },
        guru_id: guruId
      },
      orderBy: { pertemuan_ke: 'asc' }
    });

    // Fetch kehadiran by scheduleIds + tanggal from journals
    const journalTanggalPairs = journals.map(j => ({ jadwal_id: j.jadwal_id, tanggal: j.tanggal }));
    const allKehadiran = journalTanggalPairs.length > 0
      ? await prisma.kehadiran.findMany({
        where: {
          OR: journalTanggalPairs.map(p => ({ jadwal_id: p.jadwal_id, tanggal: p.tanggal })),
          siswa_id: { in: siswaIds }
        },
        select: { siswa_id: true, jadwal_id: true, tanggal: true, status: true }
      })
      : [];

    // Map kehadiran back to journals for easy lookup
    const journalsWithKehadiran = journals.map(j => ({
      ...j,
      kehadiran: allKehadiran.filter(k => k.jadwal_id === j.jadwal_id && k.tanggal === j.tanggal)
    }));

    const totalPertemuanDibuat = journals.length;

    // Process students mapping
    const students = rombel.siswa.map((rs) => {
      const s = rs.siswa;

      let hadir = 0, sakit = 0, izin = 0, alpa = 0, total = 0;
      journalsWithKehadiran.forEach(journal => {
        const kh = journal.kehadiran.find(k => k.siswa_id === s.id);
        if (kh) {
          total++;
          if (kh.status === 'HADIR') hadir++;
          else if (kh.status === 'SAKIT') sakit++;
          else if (kh.status === 'IZIN') izin++;
          else if (kh.status === 'ALPA') alpa++;
        }
      });

      // Persentase = (Total Kehadiran / Total Pertemuan yang Dibuat) * 100
      const presentCount = hadir + sakit + izin;
      const attendanceRate = totalPertemuanDibuat > 0
        ? Math.round((presentCount / totalPertemuanDibuat) * 100)
        : 0;

      // Map grade
      const studentGrade = gradesData.find(g => g.siswa_id === s.id);

      return {
        id: s.id,
        name: s.nama_lengkap,
        nisn: s.nomor_induk || '-',
        attendanceRate,
        isFlagged: attendanceRate < 70,
        grade: studentGrade?.nilai_akhir || null,
        totalHadir: hadir,
        totalSakit: sakit,
        totalIzin: izin,
        totalAlpa: alpa,
        totalPertemuan: totalPertemuanDibuat
      };
    });

    // History (Journals) — sorted desc for display
    const historiesSorted = [...journalsWithKehadiran].reverse();
    const histories = historiesSorted.map(j => ({
      id: j.id,
      jadwalId: j.jadwal_id,
      date: j.tanggal,
      session: j.pertemuan_ke,
      topic: j.judul_materi,
      present: j.kehadiran.filter(k => k.status === 'HADIR').length,
      total: j.kehadiran.length
    }));

    // ── Dynamic Recap Matrix (Backend-calculated) ─────────────
    // Build per-pertemuan attendance matrix for each student
    // This allows frontend to render P1, P2, ..., Pn columns dynamically
    const pertemuanHeaders = journals.map(j => ({
      pertemuanKe: j.pertemuan_ke,
      tanggal: j.tanggal,
      jadwalId: j.jadwal_id,
    }));

    const recap = rombel.siswa.map((rs) => {
      const s = rs.siswa;

      // Build per-meeting status array
      const pertemuan = journalsWithKehadiran.map(j => {
        const kh = j.kehadiran.find(k => k.siswa_id === s.id);
        return {
          pertemuanKe: j.pertemuan_ke,
          status: kh ? kh.status.charAt(0) : '-', // H, S, I, A, or -
        };
      });

      const studentData = students.find(st => st.id === s.id);

      return {
        name: s.nama_lengkap,
        nisn: s.nomor_induk || '-',
        pertemuan,
        hadir: studentData?.totalHadir || 0,
        sakit: studentData?.totalSakit || 0,
        izin: studentData?.totalIzin || 0,
        alpa: studentData?.totalAlpa || 0,
        totalPertemuan: totalPertemuanDibuat,
        persentase: studentData?.attendanceRate || 0,
      };
    });

    return res.status(200).json({
      message: 'Detail kelas guru berhasil diambil',
      data: {
        className: rombel.master_kelas.nama,
        subjectName: mapel?.nama || 'Mata Pelajaran',
        totalStudents: students.length,
        totalPertemuanDibuat,
        pertemuanHeaders,
        scheduleIds,
        students,
        histories,
        recap,
      }
    });

  } catch (error) {
    console.error('Guru Class Detail Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/dashboard/guru/quick-session
 * Dashboard shortcut: Atomically create jurnal + generate QR for a jadwal
 * Body: { jadwalId, mataPelajaranId }
 *
 * Auto-calculates pertemuanKe, tanggal, and default materi.
 * Returns QR data ready for modal display.
 */
const quickSession = async (req, res) => {
  try {
    const guruId = req.user.userId;
    const { jadwalId, mataPelajaranId } = req.body;

    if (!jadwalId) {
      return res.status(400).json({ message: 'jadwalId wajib diisi' });
    }

    // Verify jadwal exists and belongs to this guru
    const jadwal = await prisma.jadwalPelajaran.findUnique({
      where: { id: jadwalId },
      include: {
        mata_pelajaran: { select: { nama: true } },
        master_kelas: { select: { nama: true } },
      },
    });

    if (!jadwal) {
      return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
    }

    if (jadwal.guru_id !== guruId) {
      return res.status(403).json({ message: 'Anda tidak memiliki akses ke jadwal ini' });
    }

    // Calculate today's date string
    const now = new Date();
    const tanggal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Check if jurnal already exists for this jadwal + tanggal
    const existingJurnal = await prisma.jurnalMengajar.findUnique({
      where: { jadwal_id_tanggal: { jadwal_id: jadwalId, tanggal } },
    });

    let pertemuanKe;
    let jurnalId;

    if (existingJurnal) {
      // Jurnal already exists — reuse it (e.g. teacher re-opens session)
      pertemuanKe = existingJurnal.pertemuan_ke;
      jurnalId = existingJurnal.id;
    } else {
      // Auto-calculate pertemuanKe = total existing journals for this jadwal + 1
      const totalJurnals = await prisma.jurnalMengajar.count({
        where: { jadwal_id: jadwalId, guru_id: guruId },
      });
      pertemuanKe = totalJurnals + 1;

      // Create jurnal
      const jurnal = await prisma.jurnalMengajar.create({
        data: {
          jadwal_id: jadwalId,
          guru_id: guruId,
          tanggal,
          pertemuan_ke: pertemuanKe,
          judul_materi: `Pertemuan ke-${pertemuanKe}`,
          deskripsi_kegiatan: `Sesi dibuka dari Dashboard pada ${now.toLocaleTimeString('id-ID')}`,
        },
      });
      jurnalId = jurnal.id;
    }

    // Deactivate all previous tokens for this jadwal+tanggal
    await prisma.sesiAbsensi.updateMany({
      where: { jadwal_id: jadwalId, tanggal, is_active: true },
      data: { is_active: false },
    });

    // Generate unique session ID
    const sessionId = crypto.randomUUID();

    // Create JWT token with 3-minute expiry
    const token = jwt.sign(
      {
        sessionId,
        jadwalId,
        tanggal,
        pertemuanKe,
        guruId,
        type: 'qr_attendance',
      },
      process.env.JWT_SECRET,
      { expiresIn: `${QR_EXPIRY_SECONDS}s` }
    );

    // Calculate expiry timestamp
    const expiredAt = new Date(Date.now() + QR_EXPIRY_SECONDS * 1000);

    // Save to SesiAbsensi
    await prisma.sesiAbsensi.create({
      data: {
        id: sessionId,
        jadwal_id: jadwalId,
        guru_id: guruId,
        tanggal,
        pertemuan_ke: pertemuanKe,
        token,
        expired_at: expiredAt,
        is_active: true,
      },
    });

    // Build QR data payload
    const qrData = JSON.stringify({
      token,
      jadwalId,
      tanggal,
      pertemuanKe,
    });

    return res.status(200).json({
      message: 'Sesi pertemuan berhasil dibuka dari Dashboard',
      data: {
        qrData,
        sessionId,
        jurnalId,
        jadwalId,
        tanggal,
        pertemuanKe,
        expiresIn: QR_EXPIRY_SECONDS,
        expiredAt: expiredAt.toISOString(),
        subject: jadwal.mata_pelajaran.nama,
        className: jadwal.master_kelas.nama,
      },
    });
  } catch (error) {
    console.error('QuickSession Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = {
  getStats,
  getKurikulumDashboard,
  getWaliKelasDashboard,
  getSiswaDashboard,
  getGuruDashboard,
  getGuruClassDetail,
  quickSession,
};
