// src/controllers/kehadiranController.js
// ═══════════════════════════════════════════════
// KEHADIRAN (PRESENSI) CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const crypto = require('crypto');

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

/**
 * POST /api/kehadiran/generate-qr
 * Generate QR token for attendance session
 */
const generateQR = async (req, res) => {
  try {
    const { jadwalId, tanggal } = req.body;
    const token = `SIAKAD-${jadwalId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    return res.status(200).json({
      message: 'QR Code berhasil dibuat',
      data: {
        qrToken: token,
        jadwalId,
        tanggal,
        expiresIn: 60, // seconds
      },
    });
  } catch (error) {
    console.error('GenerateQR Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/kehadiran/qr-scan
 * Siswa scans QR to mark attendance
 */
const qrScan = async (req, res) => {
  try {
    const { qrToken, jadwalId, tanggal } = req.body;
    const siswaId = req.user.userId;

    if (!qrToken || !jadwalId || !tanggal) {
      return res.status(400).json({ message: 'Data QR scan tidak lengkap' });
    }

    // Verify the QR token format
    if (!qrToken.startsWith('SIAKAD-')) {
      return res.status(400).json({ message: 'QR Code tidak valid' });
    }

    // Upsert attendance
    await prisma.kehadiran.upsert({
      where: {
        siswa_id_jadwal_id_tanggal: {
          siswa_id: siswaId,
          jadwal_id: jadwalId,
          tanggal: tanggal,
        },
      },
      update: { status: 'HADIR', qr_token: qrToken },
      create: {
        siswa_id: siswaId,
        jadwal_id: jadwalId,
        tanggal: tanggal,
        status: 'HADIR',
        qr_token: qrToken,
      },
    });

    return res.status(200).json({ message: 'Presensi berhasil dicatat. Status: HADIR' });
  } catch (error) {
    console.error('QRScan Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { saveBatch, getRekap, getBySiswa, getHistory, generateQR, qrScan };
