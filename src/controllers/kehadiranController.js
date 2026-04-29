// src/controllers/kehadiranController.js
// ═══════════════════════════════════════════════
// KEHADIRAN (PRESENSI) CONTROLLER
// QR Code Dinamis dengan JWT Token + SesiAbsensi
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const QR_EXPIRY_SECONDS = 180; // 3 menit

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

    // Upsert each record
    const results = [];
    for (const record of records) {
      const result = await prisma.kehadiran.upsert({
        where: {
          siswa_id_jadwal_id_tanggal: {
            siswa_id: record.siswaId,
            jadwal_id: jadwalId,
            tanggal: tanggal,
          },
        },
        update: {
          status: record.status,
          keterangan: record.keterangan || null,
          pertemuan_ke: pertemuanKe ? parseInt(pertemuanKe) : null,
          topik: topik || null,
        },
        create: {
          siswa_id: record.siswaId,
          jadwal_id: jadwalId,
          tanggal: tanggal,
          status: record.status,
          keterangan: record.keterangan || null,
          pertemuan_ke: pertemuanKe ? parseInt(pertemuanKe) : null,
          topik: topik || null,
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

    const data = await prisma.kehadiran.findMany({
      where: { jadwal_id: jadwalId },
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
    const data = await prisma.kehadiran.findMany({
      where: { siswa_id: req.params.siswaId },
      include: {
        jadwal: {
          include: {
            mata_pelajaran: { select: { nama: true } },
            master_kelas: { select: { nama: true } },
          },
        },
      },
      orderBy: { tanggal: 'desc' },
    });

    return res.status(200).json({
      message: 'Riwayat kehadiran berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        tanggal: d.tanggal,
        status: d.status,
        keterangan: d.keterangan,
        pertemuanKe: d.pertemuan_ke,
        topik: d.topik,
        mapel: d.jadwal.mata_pelajaran.nama,
        kelas: d.jadwal.master_kelas.nama,
      })),
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

    // Group by tanggal
    const grouped = {};
    data.forEach((d) => {
      if (!grouped[d.tanggal]) {
        grouped[d.tanggal] = {
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

    if (!jadwalId || !tanggal || !pertemuanKe) {
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
        pertemuanKe: parseInt(pertemuanKe),
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
        pertemuan_ke: parseInt(pertemuanKe),
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
      pertemuanKe: parseInt(pertemuanKe),
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
        siswa_id_jadwal_id_tanggal: {
          siswa_id: siswaId,
          jadwal_id: jadwalId,
          tanggal: tanggal,
        },
      },
    });

    if (existingAttendance && existingAttendance.status === 'HADIR') {
      return res.status(409).json({
        message: 'Anda sudah melakukan absen di pertemuan ini.',
        code: 'ALREADY_ATTENDED',
      });
    }

    // ─── ALL CHECKS PASSED — Record Attendance ──────────────
    await prisma.kehadiran.upsert({
      where: {
        siswa_id_jadwal_id_tanggal: {
          siswa_id: siswaId,
          jadwal_id: jadwalId,
          tanggal: tanggal,
        },
      },
      update: {
        status: 'HADIR',
        qr_token: qrToken,
        pertemuan_ke: sesi.pertemuan_ke,
      },
      create: {
        siswa_id: siswaId,
        jadwal_id: jadwalId,
        tanggal: tanggal,
        status: 'HADIR',
        qr_token: qrToken,
        pertemuan_ke: sesi.pertemuan_ke,
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
 * End attendance session — deactivate all active tokens for this jadwal+tanggal
 * Body: { jadwalId, tanggal }
 */
const endSession = async (req, res) => {
  try {
    const { jadwalId, tanggal } = req.body;
    const guruId = req.user.userId;

    if (!jadwalId || !tanggal) {
      return res.status(400).json({ message: 'jadwalId dan tanggal wajib diisi' });
    }

    // Deactivate all active sessions for this jadwal+tanggal
    const result = await prisma.sesiAbsensi.updateMany({
      where: {
        jadwal_id: jadwalId,
        tanggal,
        guru_id: guruId,
        is_active: true,
      },
      data: { is_active: false },
    });

    return res.status(200).json({
      message: `Sesi absensi ditutup. ${result.count} token dinonaktifkan.`,
      data: { deactivatedCount: result.count },
    });
  } catch (error) {
    console.error('EndSession Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/kehadiran/live-attendance?jadwalId=&tanggal=
 * Returns list of siswaId who are marked HADIR in the current session.
 * Used for real-time polling from teacher dashboard.
 */
const getSessionAttendance = async (req, res) => {
  try {
    const { jadwalId, tanggal } = req.query;
    if (!jadwalId || !tanggal) {
      return res.status(400).json({ message: 'jadwalId dan tanggal wajib diisi' });
    }

    const records = await prisma.kehadiran.findMany({
      where: { jadwal_id: jadwalId, tanggal, status: 'HADIR' },
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
