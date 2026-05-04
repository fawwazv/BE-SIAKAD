const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function randomFloat(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function getRandomStatus() {
  const rand = Math.random();
  if (rand < 0.85) return 'HADIR';
  if (rand < 0.90) return 'SAKIT';
  if (rand < 0.95) return 'IZIN';
  return 'ALPA';
}

function getPredikat(nilai) {
  if (nilai >= 90) return 'A';
  if (nilai >= 80) return 'B';
  if (nilai >= 70) return 'C';
  if (nilai >= 60) return 'D';
  return 'E';
}

const CATATAN_TEMPLATES = [
  "Pertahankan prestasimu, tingkatkan terus belajarnya.",
  "Kehadiranmu sangat baik, semoga nilainya juga terus membaik.",
  "Lebih aktif lagi di kelas ya, jangan ragu untuk bertanya.",
  "Tingkatkan kedisiplinan dan rajinlah mengerjakan tugas.",
  "Prestasi yang membanggakan, teruslah berusaha yang terbaik.",
  "Perhatikan kehadiran dan tugas-tugas yang sering terlewat.",
  "Fokus belajar, kurangi bermain di dalam kelas.",
  "Kamu siswa yang cerdas, tingkatkan lagi rasa percaya dirimu."
];

async function main() {
  console.log('🌱 Memulai proses seeding batch data XI-1...');

  const masterKelas = await prisma.masterKelas.findFirst({
    where: { nama: 'XI-1' }
  });

  if (!masterKelas) {
    throw new Error('Kelas XI-1 tidak ditemukan!');
  }

  const activeSemester = await prisma.semester.findFirst({
    where: { is_active: true }
  });

  if (!activeSemester) {
    throw new Error('Tidak ada semester aktif!');
  }

  const rombel = await prisma.rombel.findFirst({
    where: { 
      master_kelas_id: masterKelas.id,
      tahun_ajaran_id: activeSemester.tahun_ajaran_id 
    },
    include: {
      siswa: true
    }
  });

  if (!rombel || !rombel.siswa.length) {
    throw new Error('Rombel atau siswa XI-1 tidak ditemukan!');
  }

  const siswaIds = rombel.siswa.map(s => s.siswa_id);
  
  const mapelList = await prisma.mataPelajaran.findMany();
  const jadwalList = await prisma.jadwalPelajaran.findMany({
    where: { master_kelas_id: masterKelas.id }
  });

  const catatanData = [];
  const nilaiData = [];
  const kehadiranData = [];

  for (const siswaId of siswaIds) {
    // 1. Catatan Akademik
    if (masterKelas.wali_kelas_id) {
      catatanData.push({
        siswa_id: siswaId,
        semester_id: activeSemester.id,
        wali_kelas_id: masterKelas.wali_kelas_id,
        catatan: CATATAN_TEMPLATES[Math.floor(Math.random() * CATATAN_TEMPLATES.length)]
      });
    }

    // 2. Nilai (semua mapel)
    const isPintar = Math.random() > 0.6;
    const baseMin = isPintar ? 80 : 65;
    const baseMax = isPintar ? 98 : 85;

    for (const mapel of mapelList) {
      const tugas = randomFloat(baseMin, baseMax);
      const uh = randomFloat(baseMin, baseMax);
      const uts = randomFloat(baseMin, baseMax);
      const uas = randomFloat(baseMin, baseMax);
      const keaktifan = randomFloat(baseMin, baseMax);
      const kehadiran = randomFloat(baseMin, baseMax);

      const nilai_akhir = (tugas * 0.2) + (uh * 0.2) + (uts * 0.2) + (uas * 0.2) + (keaktifan * 0.1) + (kehadiran * 0.1);
      const predikat = getPredikat(nilai_akhir);

      nilaiData.push({
        siswa_id: siswaId,
        mata_pelajaran_id: mapel.id,
        semester_id: activeSemester.id,
        nilai_tugas: tugas,
        nilai_uh: uh,
        nilai_uts: uts,
        nilai_uas: uas,
        nilai_keaktifan: keaktifan,
        nilai_kehadiran: kehadiran,
        bobot_tugas: 20,
        bobot_uh: 20,
        bobot_uts: 20,
        bobot_uas: 20,
        bobot_keaktifan: 10,
        bobot_kehadiran: 10,
        nilai_akhir: parseFloat(nilai_akhir.toFixed(2)),
        predikat: predikat
      });
    }

    // 3. Kehadiran
    const today = new Date();
    for (const jadwal of jadwalList) {
      for (let i = 1; i <= 5; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - (i * 7));
        
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const tglStr = `${d.getFullYear()}-${mm}-${dd}`;

        const statusRandom = getRandomStatus();
        kehadiranData.push({
          siswa_id: siswaId,
          jadwal_id: jadwal.id,
          tanggal: tglStr,
          status: statusRandom,
          keterangan: statusRandom !== 'HADIR' ? `Ket. ${statusRandom}` : null,
          pertemuan_ke: i,
          semester_id: activeSemester.id
        });
      }
    }
  }

  console.log(`Memasukkan ${catatanData.length} catatan...`);
  await prisma.catatanAkademik.createMany({
    data: catatanData,
    skipDuplicates: true,
  });

  console.log(`Memasukkan ${nilaiData.length} nilai...`);
  await prisma.nilai.createMany({
    data: nilaiData,
    skipDuplicates: true,
  });

  console.log(`Memasukkan ${kehadiranData.length} kehadiran...`);
  
  // Kehadiran datanya banyak (ribuan), batching ke chunks of 1000
  const chunkSize = 1000;
  for (let i = 0; i < kehadiranData.length; i += chunkSize) {
    const chunk = kehadiranData.slice(i, i + chunkSize);
    await prisma.kehadiran.createMany({
      data: chunk,
      skipDuplicates: true,
    });
  }

  console.log('🎉 Seeding XI-1 selesai!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
