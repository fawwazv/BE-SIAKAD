// BE-SIAKAD/test/curriculum_dashboard.test.js
// Verifikasi dashboard Kurikulum membaca data akademik dari Prisma.

const express = require('express');
const request = require('supertest');

jest.mock('../src/config/prisma', () => ({
  role: { findMany: jest.fn() },
  tahunAjaran: { findFirst: jest.fn() },
  semester: { findFirst: jest.fn() },
  user: { count: jest.fn() },
  masterKelas: { count: jest.fn() },
  mataPelajaran: { count: jest.fn() },
  rombel: { count: jest.fn(), findMany: jest.fn() },
  jadwalPelajaran: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
  ruangKelas: { count: jest.fn() },
  guruMapel: { count: jest.fn() },
}));

const prisma = require('../src/config/prisma');
const { getKurikulumDashboard } = require('../src/controllers/dashboardController');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'kurikulum-001', role: 'Kurikulum' };
    next();
  });
  app.get('/api/dashboard/kurikulum', getKurikulumDashboard);
  return app;
}

describe('Curriculum Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    prisma.role.findMany.mockResolvedValue([
      { id: 1, nama_role: 'Siswa' },
      { id: 2, nama_role: 'Guru Mapel' },
      { id: 3, nama_role: 'Wali Kelas' },
    ]);
    prisma.tahunAjaran.findFirst.mockResolvedValue({
      id: 'ta-aktif',
      kode: '2026/2027',
      deskripsi: 'Tahun Ajaran 2026/2027',
    });
    prisma.semester.findFirst.mockResolvedValue({
      id: 'sem-aktif',
      nama: 'Semester Ganjil',
      tahun_ajaran: { kode: '2026/2027' },
    });

    prisma.user.count.mockImplementation(({ where }) => {
      if (where.role_id === 1) return Promise.resolve(320);
      if (where.role_id?.in?.includes(2)) return Promise.resolve(28);
      return Promise.resolve(0);
    });
    prisma.masterKelas.count.mockResolvedValue(18);
    prisma.mataPelajaran.count.mockResolvedValue(14);
    prisma.ruangKelas.count.mockResolvedValue(16);
    prisma.guruMapel.count.mockResolvedValue(32);
    prisma.rombel.count.mockImplementation(({ where }) => {
      if (where.is_locked) return Promise.resolve(5);
      if (where.wali_kelas_id === null) return Promise.resolve(1);
      return Promise.resolve(12);
    });
    prisma.jadwalPelajaran.count.mockImplementation(({ where } = {}) => {
      if (where?.ruang_kelas_id === null) return Promise.resolve(2);
      return Promise.resolve(84);
    });
    prisma.jadwalPelajaran.groupBy.mockResolvedValue([
      { hari: 'Senin', _count: { _all: 18 } },
      { hari: 'Rabu', _count: { _all: 16 } },
    ]);
    prisma.jadwalPelajaran.findMany.mockResolvedValue([
      {
        id: 'jadwal-rabu',
        hari: 'Rabu',
        jam_mulai: '09:00',
        jam_selesai: '09:45',
        slot_index: 2,
        mata_pelajaran: { nama: 'Biologi' },
        master_kelas: { nama: 'XI IPA 1' },
        guru: { nama_lengkap: 'Dra. Siti Aminah' },
        ruang_kelas: { kode: 'R-02' },
      },
      {
        id: 'jadwal-senin',
        hari: 'Senin',
        jam_mulai: '07:00',
        jam_selesai: '07:45',
        slot_index: 0,
        mata_pelajaran: { nama: 'Matematika' },
        master_kelas: { nama: 'X IPA 1' },
        guru: { nama_lengkap: 'Drs. Budi Santoso' },
        ruang_kelas: { kode: 'R-01' },
      },
    ]);
    prisma.rombel.findMany.mockResolvedValue([
      {
        id: 'rombel-1',
        is_locked: true,
        master_kelas: { nama: 'X IPA 1', tingkat: 'Kelas 10' },
        wali_kelas: { nama_lengkap: 'Dra. Siti Aminah' },
        ruang_kelas: { kode: 'R-01' },
        _count: { siswa: 30 },
      },
    ]);
  });

  test('returns KPI and active academic period from database', async () => {
    const res = await request(createApp()).get('/api/dashboard/kurikulum');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalSiswa: 320,
      totalGuru: 28,
      totalKelas: 18,
      totalMapel: 14,
      totalRombel: 12,
      totalJadwal: 84,
      activeTahunAjaran: { kode: '2026/2027' },
      activeSemester: { label: 'Semester Ganjil - 2026/2027' },
    });
    expect(prisma.rombel.count).toHaveBeenCalledWith({
      where: { tahun_ajaran_id: 'ta-aktif' },
    });
  });

  test('formats schedule and rombel data for the Flutter dashboard', async () => {
    const res = await request(createApp()).get('/api/dashboard/kurikulum');

    expect(res.body.data.scheduleByDay).toEqual([
      { day: 'Senin', count: 18 },
      { day: 'Selasa', count: 0 },
      { day: 'Rabu', count: 16 },
      { day: 'Kamis', count: 0 },
      { day: 'Jumat', count: 0 },
      { day: 'Sabtu', count: 0 },
    ]);
    expect(res.body.data.recentSchedules[0]).toMatchObject({
      id: 'jadwal-senin',
      day: 'Senin',
      subject: 'Matematika',
      className: 'X IPA 1',
      teacher: 'Drs. Budi Santoso',
      room: 'R-01',
    });
    expect(res.body.data.rombelOverview[0]).toMatchObject({
      className: 'X IPA 1',
      grade: 'Kelas 10',
      waliKelas: 'Dra. Siti Aminah',
      studentCount: 30,
      isLocked: true,
    });
  });
});
