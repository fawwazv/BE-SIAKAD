// prisma/seed_jurnal.js
// ═══════════════════════════════════════════════
// SEED JURNAL MENGAJAR
// Menyinkronkan data jurnal guru dengan kehadiran siswa yang sudah di-seed
// Kelas: X-1 (3 pertemuan), XI-1 (5 pertemuan)
// ═══════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');

// Seed selalu gunakan koneksi langsung (DIRECT_URL / port 5432)
// agar tidak terbentur batas sesi pgbouncer pada operasi transaksi Prisma
const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

// ── Konfigurasi kelas yang di-seed ───────────────────────────────────────────
// Harus sesuai dengan jumlah pertemuan di seed kehadiran masing-masing kelas
const KELAS_CONFIG = [
  { nama: 'X-1',  totalPertemuan: 3 },
  { nama: 'XI-1', totalPertemuan: 5 },
];

// ── Helper: hitung tanggal pertemuan ke-N (mundur dari minggu sekarang) ──────
// Sama dengan logika di seed_x_1_kehadiran.js dan seed_xi_1_data.js
const pad2 = (v) => String(v).padStart(2, '0');

const toDateString = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

// Untuk X-1: gunakan logika meetingDate berdasarkan hari jadwal
const meetingDateForX1 = (scheduleDay, meetingNumber, totalMeetings) => {
  const DAY_OFFSET = {
    Senin: 0, Selasa: 1, Rabu: 2, Kamis: 3, Jumat: 4, Sabtu: 5, Minggu: 6,
  };
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() - day + 1);

  const date = new Date(monday);
  date.setDate(
    monday.getDate() -
      (totalMeetings - meetingNumber) * 7 +
      (DAY_OFFSET[scheduleDay] ?? 0)
  );
  return toDateString(date);
};

// Untuk XI-1: mundur i*7 hari dari hari ini
const meetingDateForXI1 = (meetingNumber) => {
  const today = new Date();
  const d = new Date(today);
  d.setDate(d.getDate() - (meetingNumber * 7));
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${d.getFullYear()}-${mm}-${dd}`;
};

// ── Judul materi default berdasarkan nama mapel & nomor pertemuan ────────────
const judulMateri = (namaMapel, pertemuanKe) =>
  `[Seed] ${namaMapel} - Pertemuan ${pertemuanKe}`;

const deskripsiKegiatan = (namaMapel, pertemuanKe) =>
  `Kegiatan belajar mengajar ${namaMapel} sesi ke-${pertemuanKe}. (Data seed otomatis)`;

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Memulai seed JurnalMengajar...\n');

  const activeSemester = await prisma.semester.findFirst({
    where: { is_active: true },
    include: { tahun_ajaran: true },
  });
  if (!activeSemester) {
    throw new Error('Tidak ada semester aktif! Aktifkan semester terlebih dahulu.');
  }
  console.log(`✅ Semester aktif: ${activeSemester.nama} (${activeSemester.tahun_ajaran?.kode || '-'})`);

  let totalDibuat = 0;
  let totalSkip = 0;

  for (const kelasConf of KELAS_CONFIG) {
    console.log(`\n📚 Memproses kelas ${kelasConf.nama}...`);

    // Cari master kelas
    const masterKelas = await prisma.masterKelas.findFirst({
      where: { nama: kelasConf.nama },
    });
    if (!masterKelas) {
      console.warn(`  ⚠️  Kelas ${kelasConf.nama} tidak ditemukan, dilewati.`);
      continue;
    }

    // Ambil semua jadwal kelas beserta info guru dan mapel
    const jadwalList = await prisma.jadwalPelajaran.findMany({
      where: { master_kelas_id: masterKelas.id },
      include: {
        mata_pelajaran: { select: { nama: true } },
        guru: { select: { id: true, nama_lengkap: true } },
      },
      orderBy: [{ hari: 'asc' }, { slot_index: 'asc' }],
    });

    if (jadwalList.length === 0) {
      console.warn(`  ⚠️  Tidak ada jadwal untuk kelas ${kelasConf.nama}, dilewati.`);
      continue;
    }

    console.log(`  📋 Ditemukan ${jadwalList.length} jadwal`);

    const jurnalData = [];

    for (const jadwal of jadwalList) {
      const namaMapel = jadwal.mata_pelajaran?.nama || 'Mapel';
      const guruId = jadwal.guru_id;

      for (let pertemuan = 1; pertemuan <= kelasConf.totalPertemuan; pertemuan++) {
        // Hitung tanggal sesuai logika masing-masing seed kehadiran
        let tanggal;
        if (kelasConf.nama === 'X-1') {
          tanggal = meetingDateForX1(jadwal.hari, pertemuan, kelasConf.totalPertemuan);
        } else {
          // XI-1 dan kelas lain: mundur pertemuan*7 hari
          tanggal = meetingDateForXI1(pertemuan);
        }

        jurnalData.push({
          jadwal_id: jadwal.id,
          guru_id: guruId,
          tanggal,
          pertemuan_ke: pertemuan,
          judul_materi: judulMateri(namaMapel, pertemuan),
          deskripsi_kegiatan: deskripsiKegiatan(namaMapel, pertemuan),
        });
      }
    }

    // Insert dengan skipDuplicates — aman dijalankan berulang kali
    const result = await prisma.jurnalMengajar.createMany({
      data: jurnalData,
      skipDuplicates: true,
    });

    const skip = jurnalData.length - result.count;
    totalDibuat += result.count;
    totalSkip += skip;

    console.log(`  ✅ Jurnal dibuat  : ${result.count}`);
    if (skip > 0) {
      console.log(`  ⏭️  Sudah ada (skip): ${skip}`);
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`🎉 Seed JurnalMengajar selesai!`);
  console.log(`   Total jurnal baru : ${totalDibuat}`);
  console.log(`   Total dilewati    : ${totalSkip}`);
  console.log('══════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Error saat seed jurnal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
