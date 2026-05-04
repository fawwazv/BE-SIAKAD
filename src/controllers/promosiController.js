// src/controllers/promosiController.js
// ═══════════════════════════════════════════════
// PROMOSI (Kenaikan Kelas) CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const { canBypassWaliOwnership, findOwnedRombel } = require('../middlewares/ownershipMiddleware');

/**
 * GET /api/promosi/rombel/:id
 * Mendapatkan daftar siswa di rombel beserta rata-rata nilai, kehadiran, dan status promosi.
 */
const getSiswaPromosi = async (req, res) => {
  try {
    const rombelId = req.params.id;

    const rombel = await findOwnedRombel({
      userId: req.user.userId,
      role: req.user.role,
      rombelId,
    });

    if (!rombel) {
      const status = canBypassWaliOwnership(req.user.role) ? 404 : 403;
      return res.status(status).json({ message: 'Rombel tidak ditemukan atau bukan kelas wali Anda' });
    }

    const siswaList = rombel.siswa.map((rs) => rs.siswa);

    // Ambil data nilai akhir rata-rata (hanya untuk tahun ajaran terkait)
    // Untuk mempermudah perhitungan, kita agregat manual atau panggil findMany
    const semesters = await prisma.semester.findMany({
      where: { tahun_ajaran_id: rombel.tahun_ajaran_id },
      select: { id: true }
    });
    const semesterIds = semesters.map(s => s.id);

    // Get all nilai and kehadiran for these students in this academic year.
    const nilaiData = await prisma.nilai.findMany({
      where: {
        siswa_id: { in: siswaList.map((s) => s.id) },
        semester_id: { in: semesterIds },
      },
      select: { siswa_id: true, nilai_akhir: true }
    });

    // Kehadiran (Hitung persentase kehadiran: HADIR / Total * 100)
    // For simplicity, we just count the occurrences.
    // In a real app, you would join JadwalPelajaran that belongs to this rombel.
    // Here we just find kehadiran by siswa.
    const kehadiranData = await prisma.kehadiran.findMany({
      where: {
        siswa_id: { in: siswaList.map((s) => s.id) },
        semester_id: { in: semesterIds },
      },
      select: { siswa_id: true, status: true }
    });

    // Construct the response
    const results = rombel.siswa.map((rs) => {
      const { siswa_id, status_promosi } = rs;
      const sNilai = nilaiData.filter((n) => n.siswa_id === siswa_id);
      const sKehadiran = kehadiranData.filter((k) => k.siswa_id === siswa_id);

      const missingData = [];
      if (sNilai.length === 0) missingData.push('nilai');
      if (sKehadiran.length === 0) missingData.push('kehadiran');
      const isDataComplete = missingData.length === 0;

      // Hitung rata-rata nilai tanpa fallback dummy.
      const avgNilai = sNilai.length > 0
        ? sNilai.reduce((acc, curr) => acc + curr.nilai_akhir, 0) / sNilai.length 
        : 0;

      // Hitung persentase kehadiran
      let hadirCount = 0;
      let totalCount = sKehadiran.length;
      sKehadiran.forEach(k => {
        if (k.status === 'HADIR') hadirCount++;
      });
      const percentHadir = totalCount > 0 ? (hadirCount / totalCount) * 100 : 0;

      // Tentukan status default jika belum ada
      let status = status_promosi;
      if (!status) {
        status = isDataComplete
          ? ((avgNilai >= 75 && percentHadir >= 80) ? 'NAIK' : 'TINGGAL')
          : 'PERLU_CEK';
      }

      return {
        id: rs.siswa.id,
        nama: rs.siswa.nama_lengkap,
        nisn: rs.siswa.nomor_induk || '-',
        nilaiRataRata: avgNilai,
        persentaseKehadiran: Math.round(percentHadir),
        status: status === 'NAIK' ? 'naik' : (status === 'TINGGAL' ? 'tinggal' : 'perluCek'),
        isDataComplete,
        missingData,
      };
    });

    return res.status(200).json({
      message: 'Data siswa promosi berhasil diambil',
      isLocked: rombel.is_locked,
      data: results,
    });
  } catch (error) {
    console.error('getSiswaPromosi Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/promosi/lock
 * Menyimpan keputusan Wali Kelas (Naik/Tinggal) dan mengunci Rombel
 */
const lockPromosi = async (req, res) => {
  try {
    const { rombelId, decisions } = req.body; // decisions: [{ siswaId, status: 'naik'|'tinggal' }]

    if (!Array.isArray(decisions)) {
      return res.status(400).json({ message: 'Format decisions tidak valid' });
    }

    const rombel = await findOwnedRombel({
      userId: req.user.userId,
      role: req.user.role,
      rombelId,
    });
    if (!rombel) {
      const status = canBypassWaliOwnership(req.user.role) ? 404 : 403;
      return res.status(status).json({ message: 'Rombel tidak ditemukan atau bukan kelas wali Anda' });
    }

    const siswaIds = new Set(rombel.siswa.map((s) => s.siswa_id));
    if (decisions.length !== siswaIds.size) {
      return res.status(400).json({ message: 'Keputusan promosi harus mencakup semua siswa di rombel' });
    }

    for (const dec of decisions) {
      if (!siswaIds.has(dec.siswaId)) {
        return res.status(400).json({ message: 'Terdapat siswa yang bukan anggota rombel ini' });
      }
      if (!['naik', 'tinggal'].includes(dec.status)) {
        return res.status(400).json({ message: 'Semua siswa harus diputuskan naik atau tinggal kelas sebelum dikunci' });
      }
    }

    // Gunakan transaksi untuk update batch
    await prisma.$transaction(async (tx) => {
      // 1. Update RombelSiswa status
      for (const dec of decisions) {
        const statusDb = dec.status === 'naik' ? 'NAIK' : 'TINGGAL';
        
        // Cek apakah RombelSiswa exists
        const rs = await tx.rombelSiswa.findUnique({
          where: { rombel_id_siswa_id: { rombel_id: rombelId, siswa_id: dec.siswaId } }
        });

        if (rs) {
          await tx.rombelSiswa.update({
            where: { id: rs.id },
            data: { status_promosi: statusDb }
          });
        }
      }

      // 2. Lock Rombel
      await tx.rombel.update({
        where: { id: rombelId },
        data: { is_locked: true }
      });
    });

    return res.status(200).json({ message: 'Data promosi berhasil dikunci' });
  } catch (error) {
    console.error('lockPromosi Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/promosi/execute
 * Mengeksekusi migrasi dari rombel asal ke rombel tujuan (Kurikulum)
 */
const executePromosi = async (req, res) => {
  try {
    const { rombelAsalId, rombelTujuanId, tahunAjaranBaruId, siswaIds } = req.body;

    if (!Array.isArray(siswaIds) || siswaIds.length === 0) {
      return res.status(400).json({ message: 'Tidak ada siswa yang dipilih untuk dipromosikan' });
    }

    const rombelAsal = await prisma.rombel.findUnique({ where: { id: rombelAsalId } });
    if (!rombelAsal) return res.status(404).json({ message: 'Rombel Asal tidak ditemukan' });

    if (!rombelAsal.is_locked) {
      return res.status(400).json({ message: 'Rombel Asal belum divalidasi dan dikunci oleh Wali Kelas' });
    }

    const rombelTujuan = await prisma.rombel.findUnique({ where: { id: rombelTujuanId } });
    if (!rombelTujuan) return res.status(404).json({ message: 'Rombel Tujuan tidak ditemukan' });

    // Lakukan bulk insert ke RombelSiswa baru
    // Ingat critical rule: Insert row baru ke rombelSiswa tujuan
    const createData = siswaIds.map((siswaId) => ({
      rombel_id: rombelTujuanId,
      siswa_id: siswaId,
      // Status promosi untuk yang baru di-insert di-set null karena belum waktunya evaluasi lagi
      status_promosi: null 
    }));

    await prisma.rombelSiswa.createMany({
      data: createData,
      skipDuplicates: true, // Abaikan jika sudah pernah ada
    });

    return res.status(200).json({ message: 'Migrasi berhasil dieksekusi!' });
  } catch (error) {
    console.error('executePromosi Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = {
  getSiswaPromosi,
  lockPromosi,
  executePromosi,
};
