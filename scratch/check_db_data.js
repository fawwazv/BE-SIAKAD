const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  console.log('--- Database Dummy Data Check ---');
  try {
    const roles = await prisma.role.count();
    const users = await prisma.user.count();
    const profiles = await prisma.userProfile.count();
    const tahunAjaran = await prisma.tahunAjaran.count();
    const semesters = await prisma.semester.count();
    const mataPelajaran = await prisma.mataPelajaran.count();
    const ruangKelas = await prisma.ruangKelas.count();
    const masterKelas = await prisma.masterKelas.count();
    const guruMapel = await prisma.guruMapel.count();
    const rombel = await prisma.rombel.count();
    const rombelSiswa = await prisma.rombelSiswa.count();
    const jadwal = await prisma.jadwalPelajaran.count();
    const nilai = await prisma.nilai.count();
    const kehadiran = await prisma.kehadiran.count();
    const jurnal = await prisma.jurnalMengajar.count();
    const catatan = await prisma.catatanAkademik.count();
    const konten = await prisma.kontenPublik.count();

    console.log(`Roles: ${roles}`);
    console.log(`Users: ${users}`);
    console.log(`Profiles: ${profiles}`);
    console.log(`Tahun Ajaran: ${tahunAjaran}`);
    console.log(`Semesters: ${semesters}`);
    console.log(`Mata Pelajaran: ${mataPelajaran}`);
    console.log(`Ruang Kelas: ${ruangKelas}`);
    console.log(`Master Kelas: ${masterKelas}`);
    console.log(`Guru Mapel: ${guruMapel}`);
    console.log(`Rombel: ${rombel}`);
    console.log(`Rombel Siswa: ${rombelSiswa}`);
    console.log(`Jadwal Pelajaran: ${jadwal}`);
    console.log(`Nilai Records: ${nilai}`);
    console.log(`Kehadiran Records: ${kehadiran}`);
    console.log(`Jurnal Mengajar: ${jurnal}`);
    console.log(`Catatan Akademik: ${catatan}`);
    console.log(`Konten Publik (CMS): ${konten}`);

    // Check specific critical users
    const admin = await prisma.user.findUnique({ where: { email: 'admin@siakad.sch.id' } });
    const kurikulum = await prisma.user.findUnique({ where: { email: 'kurikulum@siakad.sch.id' } });
    const walikelas = await prisma.user.findUnique({ where: { email: 'walikelas@siakad.sch.id' } });
    const siswa001 = await prisma.user.findUnique({ where: { email: 'siswa001@siakad.sch.id' } });

    console.log('\n--- Critical User Check ---');
    console.log(`Admin (admin@siakad.sch.id): ${admin ? 'OK' : 'MISSING'}`);
    console.log(`Kurikulum (kurikulum@siakad.sch.id): ${kurikulum ? 'OK' : 'MISSING'}`);
    console.log(`Wali Kelas (walikelas@siakad.sch.id): ${walikelas ? 'OK' : 'MISSING'}`);
    console.log(`Siswa 001 (siswa001@siakad.sch.id): ${siswa001 ? 'OK' : 'MISSING'}`);

  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
