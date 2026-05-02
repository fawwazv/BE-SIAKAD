// BE-SIAKAD/test/student_dashboard.test.js
// Verifikasi dashboard siswa mengambil jadwal, berita, dan presensi dari database.

const express = require('express');
const request = require('supertest');

jest.mock('../src/config/prisma', () => ({
  semester: { findFirst: jest.fn() },
  rombelSiswa: { findFirst: jest.fn() },
  jadwalPelajaran: { findMany: jest.fn() },
  kontenPublik: { findMany: jest.fn() },
  kehadiran: { findMany: jest.fn() },
}));

const prisma = require('../src/config/prisma');
const { getSiswaDashboard } = require('../src/controllers/dashboardController');

function createApp(userId = 'siswa-001') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId, role: 'Siswa' };
    next();
  });
  app.get('/api/dashboard/siswa', getSiswaDashboard);
  return app;
}

describe('Student Dashboard', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-06T01:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.semester.findFirst.mockResolvedValue({
      id: 'sem-active',
      nama: 'Semester Genap',
      tahun_ajaran_id: 'ta-active',
      tahun_ajaran: { kode: '2025/2026' },
    });
    prisma.rombelSiswa.findFirst.mockResolvedValue({
      rombel: {
        master_kelas_id: 'kelas-active',
        master_kelas: { nama: 'XI IPA 1' },
      },
    });
    prisma.jadwalPelajaran.findMany.mockResolvedValue([
      {
        id: 'jadwal-1',
        jam_mulai: '07:00',
        jam_selesai: '08:30',
        mata_pelajaran: { nama: 'Matematika' },
        guru: { nama_lengkap: 'Bu Ratna' },
        ruang_kelas: { kode: 'R-101' },
      },
    ]);
    prisma.kontenPublik.findMany.mockResolvedValue([
      {
        id: 'berita-1',
        judul: 'Upacara Hari Pendidikan',
        konten: 'Upacara dilaksanakan pukul 07.00.',
        gambar_url: '/uploads/berita.jpg',
        created_at: new Date('2026-05-05T10:00:00.000Z'),
      },
    ]);
    prisma.kehadiran.findMany.mockResolvedValue([
      { status: 'HADIR' },
      { status: 'HADIR' },
      { status: 'SAKIT' },
      { status: 'IZIN' },
      { status: 'ALPA' },
    ]);
  });

  test('returns schedule, school news, and current-month active-semester attendance', async () => {
    const res = await request(createApp()).get('/api/dashboard/siswa');

    expect(res.status).toBe(200);

    expect(prisma.rombelSiswa.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        siswa_id: 'siswa-001',
        rombel: { tahun_ajaran_id: 'ta-active' },
      },
    }));
    expect(prisma.jadwalPelajaran.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { master_kelas_id: 'kelas-active', hari: 'Rabu' },
    }));
    expect(prisma.kontenPublik.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tipe: 'BERITA', is_active: true },
    }));
    expect(prisma.kehadiran.findMany).toHaveBeenCalledWith({
      where: {
        siswa_id: 'siswa-001',
        semester_id: 'sem-active',
        tanggal: { startsWith: '2026-05' },
      },
    });

    expect(res.body.data).toMatchObject({
      kelasId: 'kelas-active',
      kelas: 'XI IPA 1',
      hari: 'Rabu',
      jadwalHariIni: [
        {
          id: 'jadwal-1',
          subject: 'Matematika',
          startTime: '07:00',
          endTime: '08:30',
          teacher: 'Bu Ratna',
          room: 'R-101',
        },
      ],
      pengumuman: [
        {
          id: 'berita-1',
          title: 'Upacara Hari Pendidikan',
          content: 'Upacara dilaksanakan pukul 07.00.',
          imageUrl: '/uploads/berita.jpg',
        },
      ],
      kehadiran: {
        hadir: 2,
        sakit: 1,
        izin: 1,
        alpa: 1,
        periode: { bulan: 5, tahun: 2026, label: 'Mei 2026' },
      },
      semesterAktif: {
        id: 'sem-active',
        label: 'Semester Genap - 2025/2026',
      },
    });
  });

  test('returns zero attendance when no active semester exists', async () => {
    prisma.semester.findFirst.mockResolvedValue(null);
    prisma.kehadiran.findMany.mockResolvedValue([{ status: 'HADIR' }]);

    const res = await request(createApp()).get('/api/dashboard/siswa');

    expect(res.status).toBe(200);
    expect(prisma.kehadiran.findMany).not.toHaveBeenCalled();
    expect(res.body.data.kehadiran).toMatchObject({
      hadir: 0,
      sakit: 0,
      izin: 0,
      alpa: 0,
      periode: { bulan: 5, tahun: 2026, label: 'Mei 2026' },
    });
    expect(res.body.data.semesterAktif).toBeNull();
  });
});
