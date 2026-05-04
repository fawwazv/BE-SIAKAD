// src/controllers/kehadiranController.js
// ═══════════════════════════════════════════════
// KEHADIRAN (PRESENSI) CONTROLLER
// QR Code Dinamis dengan JWT Token + SesiAbsensi
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const QR_EXPIRY_SECONDS = 180; // 3 menit

const parseClasses = (classes = '') =>
  `${classes}`
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const getMappedTeacherForAttendance = (mappings, jadwal) =>
  mappings.find(
    (mapping) =>
      mapping.mata_pelajaran_id === jadwal.mata_pelajaran_id &&
      parseClasses(mapping.kelas_diampu).includes(jadwal.master_kelas.nama)
  );

const getActiveSemesterId = async () => {
  const activeSemester = await prisma.semester.findFirst({
    where: { is_active: true },
    select: { id: true },
  });
  return activeSemester?.id || null;
};

const parseMeetingNumber = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getSessionJournal = ({ jadwalId, tanggal, pertemuanKe }) =>
  prisma.jurnalMengajar.findFirst({
    where: {
      jadwal_id: jadwalId,
      ...(pertemuanKe ? { pertemuan_ke: pertemuanKe } : { tanggal }),
    },
    select: {
      pertemuan_ke: true,
      judul_materi: true,
      deskripsi_kegiatan: true,
    },
  });

const getActiveRombelForJadwal = async (jadwalId) => {
  const jadwal = await prisma.jadwalPelajaran.findUnique({
    where: { id: jadwalId },
    select: { master_kelas_id: true },
  });
  if (!jadwal) return null;

  const activeTahunAjaran = await prisma.tahunAjaran.findFirst({
    where: { is_active: true },
    select: { id: true },
  });
  if (!activeTahunAjaran) return null;

  return prisma.rombel.findFirst({
    where: {
      master_kelas_id: jadwal.master_kelas_id,
      tahun_ajaran_id: activeTahunAjaran.id,
    },
    include: { siswa: { select: { siswa_id: true } } },
  });
};

const finalizeAttendanceSession = async ({ jadwalId, tanggal, pertemuanKe }) => {
  const [semesterId, jurnal, rombel] = await Promise.all([
    getActiveSemesterId(),
    getSessionJournal({ jadwalId, tanggal, pertemuanKe }),
    getActiveRombelForJadwal(jadwalId),
  ]);

  if (!rombel) return { totalStudents: 0, createdAlpa: 0 };

  const studentIds = rombel.siswa.map((item) => item.siswa_id);
  const existingRecords = await prisma.kehadiran.findMany({
    where: {
      jadwal_id: jadwalId,
      pertemuan_ke: pertemuanKe,
      siswa_id: { in: studentIds },
    },
    select: { siswa_id: true },
  });
  const existingStudentIds = new Set(existingRecords.map((item) => item.siswa_id));
  const missingStudentIds = studentIds.filter((id) => !existingStudentIds.has(id));

  const finalPertemuanKe = jurnal?.pertemuan_ke || pertemuanKe || null;
  const topik = jurnal?.judul_materi || null;
  const keterangan = jurnal?.deskripsi_kegiatan || null;

  await prisma.kehadiran.updateMany({
    where: {
      jadwal_id: jadwalId,
      pertemuan_ke: finalPertemuanKe,
      siswa_id: { in: studentIds },
    },
    data: {
      ...(finalPertemuanKe ? { pertemuan_ke: finalPertemuanKe } : {}),
      ...(topik ? { topik } : {}),
      ...(keterangan ? { keterangan } : {}),
      ...(semesterId ? { semester_id: semesterId } : {}),
    },
  });

  if (missingStudentIds.length > 0) {
    await prisma.kehadiran.createMany({
      data: missingStudentIds.map((siswaId) => ({
        siswa_id: siswaId,
        jadwal_id: jadwalId,
        tanggal,
        status: 'ALPA',
        pertemuan_ke: finalPertemuanKe,
        topik,
        keterangan,
        semester_id: semesterId,
      })),
      skipDuplicates: true,
    });
  }

  return {
    totalStudents: studentIds.length,
    createdAlpa: missingStudentIds.length,
  };
};

/**
 * POST /api/kehadiran/batch
 * Save attendance for a class session (batch)
 * Body: { jadwalId, tanggal, pertemuanKe, topik, records: [{ siswaId, status, keterangan }] }
 */
const saveBatch = async (req, res) => {
  try {
    const { jadwalId, tanggal, pertemuanKe, topik, records } = req.body;

    if (!jadwalId || !tanggal || !records || !Array.isArray(records)) {
      return res.status(400).json({ message: 'Data kehadiran tidak lengkap' });
    }

    const [semesterId, jurnal] = await Promise.all([
      getActiveSemesterId(),
      getSessionJournal({
        jadwalId,
        tanggal,
        pertemuanKe: parseMeetingNumber(pertemuanKe),
      }),
    ]);
    const finalPertemuanKe = parseMeetingNumber(pertemuanKe) || jurnal?.pertemuan_ke || null;
    if (!finalPertemuanKe) {
      return res.status(400).json({ message: 'Pertemuan ke- wajib diisi' });
    }
    const finalTopik = topik || jurnal?.judul_materi || null;
    const finalKeterangan = jurnal?.deskripsi_kegiatan || null;

    // Upsert each record
    const results = [];
    for (const record of records) {
      const result = await prisma.kehadiran.upsert({
        where: {
          siswa_id_jadwal_id_pertemuan_ke: {
            siswa_id: record.siswaId,
            jadwal_id: jadwalId,
            pertemuan_ke: finalPertemuanKe,
          },
        },
        update: {
          status: record.status,
          keterangan: record.keterangan || finalKeterangan,
          pertemuan_ke: finalPertemuanKe,
          topik: finalTopik,
          semester_id: semesterId,
        },
        create: {
          siswa_id: record.siswaId,
          jadwal_id: jadwalId,
          tanggal: tanggal,
          status: record.status,
          keterangan: record.keterangan || finalKeterangan,
          pertemuan_ke: finalPertemuanKe,
          topik: finalTopik,
          semester_id: semesterId,
        },
      });
      results.push(result);
    }

    return res.status(200).json({
      message: `Kehadiran ${results.length} siswa berhasil disimpan`,
      data: results.length,
    });
  } catch (error) {
    console.error('Kehadiran SaveBatch Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/kehadiran/rekap/:jadwalId
 * Get attendance recap for a specific jadwal (all meetings)
 */
const getRekap = async (req, res) => {
  try {
    const { jadwalId } = req.params;
    const { semesterId } = req.query;

    const data = await prisma.kehadiran.findMany({
      where: {
        jadwal_id: jadwalId,
        ...(semesterId ? { semester_id: semesterId } : {}),
      },
      include: {
        siswa: { select: { id: true, nama_lengkap: true, nomor_induk: true } },
      },
      orderBy: [{ siswa: { nama_lengkap: 'asc' } }, { tanggal: 'asc' }],
    });

    // Group by student
    const groupedMap = {};
    data.forEach((d) => {
      if (!groupedMap[d.siswa_id]) {
        groupedMap[d.siswa_id] = {
          siswaId: d.siswa.id,
          name: d.siswa.nama_lengkap,
          nisn: d.siswa.nomor_induk || '-',
          attendance: [],
        };
      }
      groupedMap[d.siswa_id].attendance.push({
        tanggal: d.tanggal,
        status: d.status,
        pertemuanKe: d.pertemuan_ke,
      });
    });

    const result = Object.values(groupedMap).map((s) => ({
      ...s,
      totalHadir: s.attendance.filter((a) => a.status === 'HADIR').length,
      totalSakit: s.attendance.filter((a) => a.status === 'SAKIT').length,
      totalIzin: s.attendance.filter((a) => a.status === 'IZIN').length,
      totalAlpa: s.attendance.filter((a) => a.status === 'ALPA').length,
    }));

    return res.status(200).json({
      message: 'Rekap kehadiran berhasil diambil',
      data: result,
    });
  } catch (error) {
    console.error('Kehadiran GetRekap Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/kehadiran/siswa/:siswaId
 * Get attendance history for a specific student
 */
const getBySiswa = async (req, res) => {
  try {
    const { semesterId } = req.query;
    const whereClause = { siswa_id: req.params.siswaId };

    // Beberapa data presensi lama/dev bisa tersimpan tanpa semester_id saat
    // semester aktif belum dikonfigurasi. Tetap tampilkan agar riwayat siswa
    // membaca hasil absensi manual maupun QR yang sudah masuk.
    if (semesterId) {
      whereClause.OR = [{ semester_id: semesterId }, { semester_id: null }];
    }

    const data = await prisma.kehadiran.findMany({
      where: whereClause,
      include: {
        jadwal: {
          include: {
            mata_pelajaran: { select: { nama: true } },
            master_kelas: { select: { nama: true } },
            guru: { select: { nama_lengkap: true } },
          },
        },
      },
      orderBy: { tanggal: 'desc' },
    });

    const journalPairs = data.map((item) => ({
      jadwal_id: item.jadwal_id,
      tanggal: item.tanggal,
      pertemuan_ke: item.pertemuan_ke,
    }));
    const journals = journalPairs.length > 0
      ? await prisma.jurnalMengajar.findMany({
          where: {
            OR: journalPairs.map((pair) => ({
              jadwal_id: pair.jadwal_id,
              ...(pair.pertemuan_ke ? { pertemuan_ke: pair.pertemuan_ke } : { tanggal: pair.tanggal }),
            })),
          },
          select: {
            jadwal_id: true,
            tanggal: true,
            pertemuan_ke: true,
            judul_materi: true,
            deskripsi_kegiatan: true,
          },
        })
      : [];
    const journalMap = new Map(
      journals.map((journal) => [`${journal.jadwal_id}:${journal.pertemuan_ke}`, journal])
    );

    const mappings = await prisma.guruMapel.findMany({
      include: { guru: { select: { nama_lengkap: true } } },
    });

    return res.status(200).json({
      message: 'Riwayat kehadiran berhasil diambil',
      data: data.map((d) => {
        const mappedTeacher = getMappedTeacherForAttendance(mappings, d.jadwal);
        const journal = journalMap.get(`${d.jadwal_id}:${d.pertemuan_ke}`);
        return {
          id: d.id,
          tanggal: d.tanggal,
          status: d.status,
          keterangan: d.keterangan || journal?.deskripsi_kegiatan || '',
          pertemuanKe: d.pertemuan_ke || journal?.pertemuan_ke || null,
          topik: d.topik || journal?.judul_materi || '',
          mapel: d.jadwal.mata_pelajaran.nama,
          kelas: d.jadwal.master_kelas.nama,
          guru: mappedTeacher?.guru?.nama_lengkap || d.jadwal.guru?.nama_lengkap || '-',
        };
      }),
    });
  } catch (error) {
    console.error('Kehadiran BySiswa Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/kehadiran/history/:jadwalId
 * Get past meetings (riwayat pertemuan) for a jadwal
 */
const getHistory = async (req, res) => {
  try {
    const data = await prisma.kehadiran.findMany({
      where: { jadwal_id: req.params.jadwalId },
      orderBy: { tanggal: 'asc' },
    });

    // Group by meeting number so multiple meetings on the same date stay separate.
    const grouped = {};
    data.forEach((d) => {
      const key = d.pertemuan_ke || d.tanggal;
      if (!grouped[key]) {
        grouped[key] = {
          tanggal: d.tanggal,
          pertemuanKe: d.pertemuan_ke,
          topik: d.topik,
          records: [],
        };
      }
      grouped[d.tanggal].records.push({ siswaId: d.siswa_id, status: d.status });
    });

    return res.status(200).json({
      message: 'Riwayat pertemuan berhasil diambil',
      data: Object.values(grouped),
    });
  } catch (error) {
    console.error('Kehadiran History Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

// ═══════════════════════════════════════════════
// QR CODE DINAMIS — GENERATE & REFRESH & SCAN
// ═══════════════════════════════════════════════

/**
 * POST /api/kehadiran/generate-qr
 * Generate QR token for attendance session
 * Body: { jadwalId, tanggal, pertemuanKe }
 * 
 * Creates a JWT token with 3-minute expiry, stores in SesiAbsensi,
 * and deactivates any previous active sessions for same jadwal+tanggal.
 */
const generateQR = async (req, res) => {
  try {
    const { jadwalId, tanggal, pertemuanKe } = req.body;
    const guruId = req.user.userId;
    const meetingNumber = parseMeetingNumber(pertemuanKe);

    if (!jadwalId || !tanggal || !meetingNumber) {
      return res.status(400).json({ message: 'jadwalId, tanggal, dan pertemuanKe wajib diisi' });
    }

    // Verify jadwal exists
    const jadwal = await prisma.jadwalPelajaran.findUnique({
      where: { id: jadwalId },
      select: { id: true, master_kelas_id: true, mata_pelajaran_id: true },
    });

    if (!jadwal) {
      return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
    }

    // Deactivate all previous tokens for this jadwal+meeting number.
    await prisma.sesiAbsensi.updateMany({
      where: { jadwal_id: jadwalId, pertemuan_ke: meetingNumber, is_active: true },
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
        pertemuanKe: meetingNumber,
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
        pertemuan_ke: meetingNumber,
        token,
        expired_at: expiredAt,
        is_active: true,
      },
    });

    // Build QR data payload (this is what gets encoded in the QR image)
    const qrData = JSON.stringify({
      token,
      jadwalId,
      tanggal,
      pertemuanKe: meetingNumber,
    });

    return res.status(200).json({
      message: 'QR Code berhasil dibuat',
      data: {
        qrData,
        sessionId,
        expiresIn: QR_EXPIRY_SECONDS,
        expiredAt: expiredAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('GenerateQR Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/kehadiran/refresh-qr
 * Refresh QR token (auto-refresh setiap 3 menit)
 * Body: { jadwalId, tanggal, pertemuanKe }
 * 
 * Same as generateQR but intended for the automatic 3-minute refresh cycle.
 * Deactivates old token, generates new one.
 */
const refreshQR = async (req, res) => {
  // Reuse generateQR logic — same behavior for refresh
  return generateQR(req, res);
};

/**
 * POST /api/kehadiran/qr-scan
 * Siswa scans QR to mark attendance
 * Body: { qrToken, jadwalId, tanggal }
 * 
 * 4-step validation:
 * 1. Verify JWT token (not expired, valid signature)
 * 2. Verify token exists in SesiAbsensi and is still active
 * 3. Verify siswa is enrolled in the class
 * 4. Check siswa hasn't already attended this session
 */
const qrScan = async (req, res) => {
  try {
    const { qrToken, jadwalId, tanggal } = req.body;
    const siswaId = req.user.userId;

    if (!qrToken || !jadwalId || !tanggal) {
      return res.status(400).json({ message: 'Data QR scan tidak lengkap' });
    }

    // ─── STEP 1: Verify JWT Token ─────────────────────────────
    let decoded;
    try {
      decoded = jwt.verify(qrToken, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(410).json({
          message: 'QR Code sudah expired. Minta guru untuk refresh QR Code.',
          code: 'QR_EXPIRED',
        });
      }
      return res.status(400).json({
        message: 'QR Code tidak valid.',
        code: 'QR_INVALID',
      });
    }

    // Verify token type
    if (decoded.type !== 'qr_attendance') {
      return res.status(400).json({
        message: 'QR Code tidak valid untuk absensi.',
        code: 'QR_INVALID',
      });
    }

    // Verify jadwalId matches
    if (decoded.jadwalId !== jadwalId) {
      return res.status(400).json({
        message: 'Data QR Code tidak sesuai.',
        code: 'QR_MISMATCH',
      });
    }
    const meetingNumber = parseMeetingNumber(decoded.pertemuanKe);
    if (!meetingNumber) {
      return res.status(400).json({
        message: 'Data pertemuan pada QR Code tidak valid.',
        code: 'QR_INVALID',
      });
    }

    // ─── STEP 2: Verify Token in Database ─────────────────────
    const sesi = await prisma.sesiAbsensi.findUnique({
      where: { token: qrToken },
    });

    if (!sesi) {
      return res.status(400).json({
        message: 'QR Code tidak dikenali oleh sistem.',
        code: 'QR_INVALID',
      });
    }

    if (!sesi.is_active) {
      return res.status(410).json({
        message: 'QR Code sudah expired. Minta guru untuk refresh QR Code.',
        code: 'QR_EXPIRED',
      });
    }

    if (new Date() > sesi.expired_at) {
      // Token still marked active but past expiry — deactivate it
      await prisma.sesiAbsensi.update({
        where: { id: sesi.id },
        data: { is_active: false },
      });
      return res.status(410).json({
        message: 'QR Code sudah expired. Minta guru untuk refresh QR Code.',
        code: 'QR_EXPIRED',
      });
    }

    // ─── STEP 3: Verify Siswa Enrolled in Class ──────────────
    const jadwal = await prisma.jadwalPelajaran.findUnique({
      where: { id: jadwalId },
      select: { master_kelas_id: true },
    });

    if (!jadwal) {
      return res.status(404).json({
        message: 'Jadwal pelajaran tidak ditemukan.',
        code: 'JADWAL_NOT_FOUND',
      });
    }

    // Find active tahun ajaran
    const activeTahunAjaran = await prisma.tahunAjaran.findFirst({
      where: { is_active: true },
    });

    if (!activeTahunAjaran) {
      return res.status(500).json({
        message: 'Tidak ada tahun ajaran aktif.',
        code: 'NO_ACTIVE_YEAR',
      });
    }

    // Check if siswa is in the rombel for this class
    const rombel = await prisma.rombel.findFirst({
      where: {
        master_kelas_id: jadwal.master_kelas_id,
        tahun_ajaran_id: activeTahunAjaran.id,
      },
      select: { id: true },
    });

    if (!rombel) {
      return res.status(403).json({
        message: 'Anda tidak terdaftar di kelas ini.',
        code: 'NOT_ENROLLED',
      });
    }

    const enrollment = await prisma.rombelSiswa.findFirst({
      where: {
        rombel_id: rombel.id,
        siswa_id: siswaId,
      },
    });

    if (!enrollment) {
      return res.status(403).json({
        message: 'Anda tidak terdaftar di kelas ini.',
        code: 'NOT_ENROLLED',
      });
    }

    // ─── STEP 4: Check Duplicate Attendance ──────────────────
    const existingAttendance = await prisma.kehadiran.findUnique({
      where: {
        siswa_id_jadwal_id_pertemuan_ke: {
          siswa_id: siswaId,
          jadwal_id: jadwalId,
          pertemuan_ke: meetingNumber,
        },
      },
    });

    if (existingAttendance && existingAttendance.status === 'HADIR') {
      return res.status(409).json({
        message: 'Anda sudah melakukan absen di pertemuan ini.',
        code: 'ALREADY_ATTENDED',
      });
    }

    const [semesterId, jurnal] = await Promise.all([
      getActiveSemesterId(),
      getSessionJournal({ jadwalId, tanggal, pertemuanKe: meetingNumber }),
    ]);

    // ─── ALL CHECKS PASSED — Record Attendance ──────────────
    await prisma.kehadiran.upsert({
      where: {
        siswa_id_jadwal_id_pertemuan_ke: {
          siswa_id: siswaId,
          jadwal_id: jadwalId,
          pertemuan_ke: meetingNumber,
        },
      },
      update: {
        status: 'HADIR',
        qr_token: qrToken,
        pertemuan_ke: jurnal?.pertemuan_ke || meetingNumber,
        topik: jurnal?.judul_materi || null,
        keterangan: jurnal?.deskripsi_kegiatan || null,
        semester_id: semesterId,
      },
      create: {
        siswa_id: siswaId,
        jadwal_id: jadwalId,
        tanggal: tanggal,
        status: 'HADIR',
        qr_token: qrToken,
        pertemuan_ke: jurnal?.pertemuan_ke || meetingNumber,
        topik: jurnal?.judul_materi || null,
        keterangan: jurnal?.deskripsi_kegiatan || null,
        semester_id: semesterId,
      },
    });

    return res.status(200).json({
      message: 'Presensi berhasil dicatat. Status: HADIR',
      code: 'SUCCESS',
    });
  } catch (error) {
    console.error('QRScan Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/kehadiran/end-session
 * End attendance session — deactivate all active tokens for this jadwal+pertemuanKe
 * Body: { jadwalId, tanggal, pertemuanKe }
 */
const endSession = async (req, res) => {
  try {
    const { jadwalId, tanggal, pertemuanKe } = req.body;
    const guruId = req.user.userId;
    const meetingNumber = parseMeetingNumber(pertemuanKe);

    if (!jadwalId || !tanggal || !meetingNumber) {
      return res.status(400).json({ message: 'jadwalId, tanggal, dan pertemuanKe wajib diisi' });
    }

    const [finalized, result] = await Promise.all([
      finalizeAttendanceSession({ jadwalId, tanggal, pertemuanKe: meetingNumber }),
      prisma.sesiAbsensi.updateMany({
        where: {
          jadwal_id: jadwalId,
          pertemuan_ke: meetingNumber,
          guru_id: guruId,
          is_active: true,
        },
        data: { is_active: false },
      }),
    ]);

    return res.status(200).json({
      message: `Sesi absensi ditutup. ${result.count} token dinonaktifkan.`,
      data: {
        deactivatedCount: result.count,
        totalStudents: finalized.totalStudents,
        createdAlpa: finalized.createdAlpa,
      },
    });
  } catch (error) {
    console.error('EndSession Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/kehadiran/live-attendance?jadwalId=&tanggal=&pertemuanKe=
 * Returns list of siswaId who are marked HADIR in the current session.
 * Used for real-time polling from teacher dashboard.
 */
const getSessionAttendance = async (req, res) => {
  try {
    const { jadwalId, tanggal, pertemuanKe } = req.query;
    const meetingNumber = parseMeetingNumber(pertemuanKe);
    if (!jadwalId || !tanggal || !meetingNumber) {
      return res.status(400).json({ message: 'jadwalId, tanggal, dan pertemuanKe wajib diisi' });
    }

    const records = await prisma.kehadiran.findMany({
      where: { jadwal_id: jadwalId, pertemuan_ke: meetingNumber, status: 'HADIR' },
      select: { siswa_id: true },
    });

    return res.status(200).json({
      message: 'OK',
      data: records.map(r => ({ siswaId: r.siswa_id })),
    });
  } catch (error) {
    console.error('GetSessionAttendance Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { saveBatch, getRekap, getBySiswa, getHistory, generateQR, refreshQR, qrScan, endSession, getSessionAttendance };
