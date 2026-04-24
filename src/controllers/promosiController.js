// src/controllers/promosiController.js
// ═══════════════════════════════════════════════
// PROMOSI (Kenaikan Kelas) CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

/**
 * GET /api/promosi/rombel/:id
 * Mendapatkan daftar siswa di rombel beserta rata-rata nilai, kehadiran, dan status promosi.
 */
const getSiswaPromosi = async (req, res) => {
  try {
    const rombelId = req.params.id;

    // Get rombel info
    const rombel = await prisma.rombel.findUnique({
      where: { id: rombelId },
      include: {
        siswa: {
          include: {
            siswa: {
              select: { id: true, nama_lengkap: true, nomor_induk: true },
            },
          },
        },
      },
    });

    if (!rombel) {
      return res.status(404).json({ message: 'Rombel tidak ditemukan' });
    }

    const siswaList = rombel.siswa.map((rs) => rs.siswa);

    // Ambil data nilai akhir rata-rata (hanya untuk tahun ajaran terkait)
    // Untuk mempermudah perhitungan, kita agregat manual atau panggil findMany
    const semesters = await prisma.semester.findMany({
      where: { tahun_ajaran_id: rombel.tahun_ajaran_id },
      select: { id: true }
    });
    const semesterIds = semesters.map(s => s.id);

    // Get all nilai and kehadiran for these students in this semester
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
        siswa_id: { in: siswaList.map((s) => s.id) }
      },
      select: { siswa_id: true, status: true }
    });

    // Construct the response
    const results = rombel.siswa.map((rs) => {
      const { siswa_id, status_promosi } = rs;
      const sNilai = nilaiData.filter((n) => n.siswa_id === siswa_id);
      const sKehadiran = kehadiranData.filter((k) => k.siswa_id === siswa_id);

      // Hitung rata-rata nilai
      const avgNilai = sNilai.length > 0 
        ? sNilai.reduce((acc, curr) => acc + curr.nilai_akhir, 0) / sNilai.length 
        : 85.0; // Default jika kosong (sesuai persetujuan untuk seed dummy UI)

      // Hitung persentase kehadiran
      let hadirCount = 0;
      let totalCount = sKehadiran.length;
      sKehadiran.forEach(k => {
        if (k.status === 'HADIR') hadirCount++;
      });
      const percentHadir = totalCount > 0 ? (hadirCount / totalCount) * 100 : 95.0; // Default 95%

      // Tentukan status default jika belum ada
      let status = status_promosi;
      if (!status) {
        status = (avgNilai >= 75 && percentHadir >= 80) ? 'NAIK' : 'TINGGAL';
      }

      return {
        id: rs.siswa.id,
        nama: rs.siswa.nama_lengkap,
        nisn: rs.siswa.nomor_induk || '-',
        nilaiRataRata: avgNilai,
        persentaseKehadiran: Math.round(percentHadir),
        status: status === 'NAIK' ? 'naik' : 'tinggal' // Map back to frontend enum value
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

    const rombel = await prisma.rombel.findUnique({ where: { id: rombelId } });
    if (!rombel) return res.status(404).json({ message: 'Rombel tidak ditemukan' });

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
