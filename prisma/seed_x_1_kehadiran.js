const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CLASS_NAME = 'X-1';
const MEETINGS_PER_SCHEDULE = 3;
const DAY_OFFSET = {
  Senin: 0,
  Selasa: 1,
  Rabu: 2,
  Kamis: 3,
  Jumat: 4,
  Sabtu: 5,
  Minggu: 6,
};

const pad2 = (value) => String(value).padStart(2, '0');

const toDateString = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const meetingDate = (scheduleDay, meetingNumber) => {
  // Monday of the current local week. Dates only need to be valid semester
  // attendance dates; the report validation keys off semester_id.
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() - day + 1);

  const date = new Date(monday);
  date.setDate(
    monday.getDate() -
      (MEETINGS_PER_SCHEDULE - meetingNumber) * 7 +
      (DAY_OFFSET[scheduleDay] ?? 0)
  );
  return toDateString(date);
};

const statusFor = (studentIndex, meetingNumber) => {
  if (meetingNumber === 1) return 'HADIR';
  const seed = (studentIndex + meetingNumber) % 12;
  if (seed === 0) return 'ALPA';
  if (seed === 1) return 'SAKIT';
  if (seed === 2) return 'IZIN';
  return 'HADIR';
};

async function main() {
  console.log(`Memulai seed kehadiran ${CLASS_NAME}...`);

  const activeSemester = await prisma.semester.findFirst({
    where: { is_active: true },
    include: { tahun_ajaran: true },
  });
  if (!activeSemester) {
    throw new Error('Tidak ada semester aktif. Aktifkan semester terlebih dahulu.');
  }

  const masterKelas = await prisma.masterKelas.findFirst({
    where: { nama: CLASS_NAME },
  });
  if (!masterKelas) {
    throw new Error(`Master kelas ${CLASS_NAME} tidak ditemukan.`);
  }

  const rombel = await prisma.rombel.findFirst({
    where: {
      master_kelas_id: masterKelas.id,
      tahun_ajaran_id: activeSemester.tahun_ajaran_id,
    },
    include: {
      siswa: {
        include: {
          siswa: { select: { id: true, nama_lengkap: true, nomor_induk: true } },
        },
      },
    },
  });
  if (!rombel || rombel.siswa.length === 0) {
    throw new Error(`Rombel aktif atau siswa ${CLASS_NAME} tidak ditemukan.`);
  }

  const schedules = await prisma.jadwalPelajaran.findMany({
    where: { master_kelas_id: masterKelas.id },
    include: {
      mata_pelajaran: { select: { nama: true } },
    },
    orderBy: [{ hari: 'asc' }, { slot_index: 'asc' }],
  });
  if (schedules.length === 0) {
    throw new Error(`Jadwal pelajaran ${CLASS_NAME} belum tersedia.`);
  }

  const attendanceRows = [];
  for (const [studentIndex, rombelSiswa] of rombel.siswa.entries()) {
    for (const schedule of schedules) {
      for (let meeting = 1; meeting <= MEETINGS_PER_SCHEDULE; meeting++) {
        const status = statusFor(studentIndex, meeting);
        attendanceRows.push({
          siswa_id: rombelSiswa.siswa_id,
          jadwal_id: schedule.id,
          tanggal: meetingDate(schedule.hari, meeting),
          status,
          keterangan: status === 'HADIR' ? null : `Seed ${status}`,
          pertemuan_ke: meeting,
          topik: `Seed ${schedule.mata_pelajaran?.nama || 'Mapel'} P${meeting}`,
          semester_id: activeSemester.id,
        });
      }
    }
  }

  const result = await prisma.kehadiran.createMany({
    data: attendanceRows,
    skipDuplicates: true,
  });

  console.log(`Semester: ${activeSemester.nama} - ${activeSemester.tahun_ajaran?.kode || '-'}`);
  console.log(`Siswa ${CLASS_NAME}: ${rombel.siswa.length}`);
  console.log(`Jadwal/mapel ${CLASS_NAME}: ${schedules.length}`);
  console.log(`Target record: ${attendanceRows.length}`);
  console.log(`Record baru dibuat: ${result.count}`);
  console.log('Seed kehadiran X-1 selesai.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
