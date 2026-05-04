// src/controllers/nilaiController.js
// ═══════════════════════════════════════════════
// NILAI (GRADES) CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const semesterOrderValue = (semester) => {
  const yearCode = semester?.tahun_ajaran?.kode || '';
  const startYear = parseInt(yearCode.split('/')[0], 10) || 0;
  const term = (semester?.nama || '').toLowerCase().includes('genap') ? 2 : 1;
  return startYear * 10 + term;
};

const averageNilai = (items) => {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + (Number(item.nilai_akhir) || 0), 0) / items.length;
};

const gradeLetter = (nilai) => {
  if (nilai >= 90) return 'A';
  if (nilai >= 85) return 'A-';
  if (nilai >= 80) return 'B+';
  if (nilai >= 75) return 'B';
  if (nilai >= 70) return 'B-';
  if (nilai >= 65) return 'C+';
  if (nilai >= 60) return 'C';
  if (nilai >= 55) return 'C-';
  return 'D';
};

/**
 * GET /api/nilai
 * Get grades filtered by mapel + semester + kelas
 */
const getAll = async (req, res) => {
  try {
    const { mapelId, semesterId, kelasId } = req.query;

    const where = {};
    if (mapelId) where.mata_pelajaran_id = mapelId;
    if (semesterId) where.semester_id = semesterId;

    // If kelasId, get students in that rombel
    let siswaFilter = undefined;
    if (kelasId) {
      const rombel = await prisma.rombel.findFirst({
        where: { master_kelas_id: kelasId },
        include: { siswa: { select: { siswa_id: true } } },
      });
      if (rombel) {
        siswaFilter = rombel.siswa.map((s) => s.siswa_id);
        where.siswa_id = { in: siswaFilter };
      }
    }

    const data = await prisma.nilai.findMany({
      where,
      include: {
        siswa: { select: { id: true, nama_lengkap: true, nomor_induk: true } },
        mata_pelajaran: { select: { id: true, nama: true, kkm: true } },
        semester: { select: { id: true, nama: true, tahun_ajaran: { select: { kode: true } } } },
      },
      orderBy: { siswa: { nama_lengkap: 'asc' } },
    });

    return res.status(200).json({
      message: 'Data nilai berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        siswaId: d.siswa_id,
        siswaName: d.siswa.nama_lengkap,
        siswaNoInduk: d.siswa.nomor_induk,
        mataPelajaranId: d.mata_pelajaran_id,
        mataPelajaran: d.mata_pelajaran.nama,
        kkm: d.mata_pelajaran.kkm,
        semesterId: d.semester_id,
        semester: d.semester.nama,
        tahunAjaran: d.semester.tahun_ajaran.kode,
        nilaiTugas: d.nilai_tugas,
        nilaiUH: d.nilai_uh,
        nilaiUTS: d.nilai_uts,
        nilaiUAS: d.nilai_uas,
        nilaiKeaktifan: d.nilai_keaktifan,
        nilaiKehadiran: d.nilai_kehadiran,
        bobotTugas: d.bobot_tugas,
        bobotUH: d.bobot_uh,
        bobotUTS: d.bobot_uts,
        bobotUAS: d.bobot_uas,
        bobotKeaktifan: d.bobot_keaktifan,
        bobotKehadiran: d.bobot_kehadiran,
        nilaiAkhir: d.nilai_akhir,
        predikat: gradeLetter(d.nilai_akhir),
      })),
    });
  } catch (error) {
    console.error('Nilai GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/nilai/siswa/:siswaId
 * Get all grades for a specific student
 */
const getBySiswa = async (req, res) => {
  try {
    const { semesterId } = req.query;
    const where = { siswa_id: req.params.siswaId };
    if (semesterId) where.semester_id = semesterId;

    const data = await prisma.nilai.findMany({
      where,
      include: {
        mata_pelajaran: { select: { kode: true, nama: true, kkm: true } },
        semester: { select: { id: true, nama: true, tahun_ajaran_id: true, tahun_ajaran: { select: { kode: true } } } },
      },
      orderBy: { mata_pelajaran: { nama: 'asc' } },
    });

    const sortedData = [...data].sort((a, b) => {
      const semesterDiff = semesterOrderValue(a.semester) - semesterOrderValue(b.semester);
      if (semesterDiff !== 0) return semesterDiff;
      return a.mata_pelajaran.nama.localeCompare(b.mata_pelajaran.nama, 'id');
    });

    const latestGrade = [...sortedData].sort((a, b) => semesterOrderValue(b.semester) - semesterOrderValue(a.semester))[0];
    let latestSummary = null;

    if (latestGrade) {
      const latestSemesterId = latestGrade.semester_id;
      const latestSemester = latestGrade.semester;
      const latestGrades = data.filter((d) => d.semester_id === latestSemesterId);
      const latestAverage = averageNilai(latestGrades);
      let latestRank = null;
      let latestClassSize = null;

      const rombelSiswa = await prisma.rombelSiswa.findFirst({
        where: {
          siswa_id: req.params.siswaId,
          rombel: { tahun_ajaran_id: latestSemester.tahun_ajaran_id },
        },
        include: { rombel: { include: { siswa: { select: { siswa_id: true } } } } },
      });

      const classStudentIds = rombelSiswa?.rombel?.siswa?.map((s) => s.siswa_id) || [];
      if (classStudentIds.length) {
        const classGrades = await prisma.nilai.findMany({
          where: {
            semester_id: latestSemesterId,
            siswa_id: { in: classStudentIds },
          },
          select: { siswa_id: true, nilai_akhir: true },
        });
        const grouped = new Map();
        classGrades.forEach((grade) => {
          if (!grouped.has(grade.siswa_id)) grouped.set(grade.siswa_id, []);
          grouped.get(grade.siswa_id).push(grade);
        });
        const ranked = [...grouped.entries()]
          .map(([siswaId, grades]) => ({ siswaId, average: averageNilai(grades) }))
          .sort((a, b) => b.average - a.average);
        latestClassSize = ranked.length;
        const rankIndex = ranked.findIndex((item) => item.siswaId === req.params.siswaId);
        latestRank = rankIndex >= 0 ? rankIndex + 1 : null;
      }

      latestSummary = {
        latestSemesterId,
        latestSemesterLabel: `${latestSemester.nama} - ${latestSemester.tahun_ajaran?.kode || '-'}`,
        latestAverage: Math.round(latestAverage * 100) / 100,
        latestRank,
        latestClassSize,
      };
    }

    return res.status(200).json({
      message: 'Data nilai siswa berhasil diambil',
      summary: latestSummary,
      data: sortedData.map((d) => ({
        id: d.id,
        mataPelajaranId: d.mata_pelajaran_id,
        mataPelajaranKode: d.mata_pelajaran.kode,
        mataPelajaran: d.mata_pelajaran.nama,
        kkm: d.mata_pelajaran.kkm,
        semesterId: d.semester_id,
        semester: d.semester.nama,
        tahunAjaran: d.semester.tahun_ajaran.kode,
        nilaiTugas: d.nilai_tugas,
        nilaiUH: d.nilai_uh,
        nilaiUTS: d.nilai_uts,
        nilaiUAS: d.nilai_uas,
        nilaiKeaktifan: d.nilai_keaktifan,
        nilaiKehadiran: d.nilai_kehadiran,
        bobotTugas: d.bobot_tugas,
        bobotUH: d.bobot_uh,
        bobotUTS: d.bobot_uts,
        bobotUAS: d.bobot_uas,
        bobotKeaktifan: d.bobot_keaktifan,
        bobotKehadiran: d.bobot_kehadiran,
        nilaiAkhir: d.nilai_akhir,
        predikat: gradeLetter(d.nilai_akhir),
      })),
    });
  } catch (error) {
    console.error('Nilai BySiswa Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/nilai/batch
 * Batch save/update grades
 * Body: { mapelId, semesterId, bobot: {...}, records: [{ siswaId, tugas, uh, uts, uas, keaktifan, kehadiran }] }
 */
const saveBatch = async (req, res) => {
  try {
    const { mapelId, semesterId, bobot, records } = req.body;

    if (!mapelId || !semesterId || !records || !Array.isArray(records)) {
      return res.status(400).json({ message: 'Data nilai tidak lengkap' });
    }

    const bobotTugas = bobot?.tugas ?? 20;
    const bobotUH = bobot?.uh ?? 20;
    const bobotUTS = bobot?.uts ?? 20;
    const bobotUAS = bobot?.uas ?? 20;
    const bobotKeaktifan = bobot?.keaktifan ?? 10;
    const bobotKehadiran = bobot?.kehadiran ?? 10;

    const results = [];
    for (const record of records) {
      const tugas = parseFloat(record.tugas) || 0;
      const uh = parseFloat(record.uh) || 0;
      const uts = parseFloat(record.uts) || 0;
      const uas = parseFloat(record.uas) || 0;
      const keaktifan = parseFloat(record.keaktifan) || 0;
      const kehadiran = parseFloat(record.kehadiran) || 0;

      // Calculate NA
      const nilaiAkhir =
        (tugas * bobotTugas / 100) +
        (uh * bobotUH / 100) +
        (uts * bobotUTS / 100) +
        (uas * bobotUAS / 100) +
        (keaktifan * bobotKeaktifan / 100) +
        (kehadiran * bobotKehadiran / 100);

      // Determine predikat
      const predikat = gradeLetter(nilaiAkhir);

      const result = await prisma.nilai.upsert({
        where: {
          siswa_id_mata_pelajaran_id_semester_id: {
            siswa_id: record.siswaId,
            mata_pelajaran_id: mapelId,
            semester_id: semesterId,
          },
        },
        update: {
          nilai_tugas: tugas,
          nilai_uh: uh,
          nilai_uts: uts,
          nilai_uas: uas,
          nilai_keaktifan: keaktifan,
          nilai_kehadiran: kehadiran,
          bobot_tugas: bobotTugas,
          bobot_uh: bobotUH,
          bobot_uts: bobotUTS,
          bobot_uas: bobotUAS,
          bobot_keaktifan: bobotKeaktifan,
          bobot_kehadiran: bobotKehadiran,
          nilai_akhir: Math.round(nilaiAkhir * 100) / 100,
          predikat,
        },
        create: {
          siswa_id: record.siswaId,
          mata_pelajaran_id: mapelId,
          semester_id: semesterId,
          nilai_tugas: tugas,
          nilai_uh: uh,
          nilai_uts: uts,
          nilai_uas: uas,
          nilai_keaktifan: keaktifan,
          nilai_kehadiran: kehadiran,
          bobot_tugas: bobotTugas,
          bobot_uh: bobotUH,
          bobot_uts: bobotUTS,
          bobot_uas: bobotUAS,
          bobot_keaktifan: bobotKeaktifan,
          bobot_kehadiran: bobotKehadiran,
          nilai_akhir: Math.round(nilaiAkhir * 100) / 100,
          predikat,
        },
      });
      results.push(result);
    }

    return res.status(200).json({
      message: `Nilai ${results.length} siswa berhasil disimpan`,
      data: results.length,
    });
  } catch (error) {
    console.error('Nilai SaveBatch Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, getBySiswa, saveBatch };
