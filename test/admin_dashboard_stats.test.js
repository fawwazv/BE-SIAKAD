// BE-SIAKAD/test/admin_dashboard_stats.test.js
// Verifikasi metrik dashboard Admin relevan dengan fitur administrasi data.

const express = require('express');
const request = require('supertest');

jest.mock('../src/config/prisma', () => ({
  role: { findMany: jest.fn() },
  user: { count: jest.fn() },
  masterKelas: { count: jest.fn() },
  mataPelajaran: { count: jest.fn() },
  kontenPublik: { count: jest.fn() },
  tahunAjaran: { findFirst: jest.fn() },
  semester: { findFirst: jest.fn() },
}));

const prisma = require('../src/config/prisma');
const { getStats } = require('../src/controllers/dashboardController');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'admin-001', role: 'Administrator' };
    next();
  });
  app.get('/api/dashboard/stats', getStats);
  return app;
}

describe('Admin Dashboard Stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    prisma.role.findMany.mockResolvedValue([
      { id: 1, nama_role: 'Administrator' },
      { id: 2, nama_role: 'Siswa' },
      { id: 3, nama_role: 'Guru Mapel' },
      { id: 4, nama_role: 'Wali Kelas' },
    ]);
    prisma.user.count.mockImplementation(({ where } = {}) => {
      if (!where) return Promise.resolve(362);
      if (where.status_aktif === true && where.role_id === 1) return Promise.resolve(2);
      if (where.status_aktif === true && where.role_id === 2) return Promise.resolve(320);
      if (where.status_aktif === true && where.role_id?.in) return Promise.resolve(28);
      if (where.status_aktif === true) return Promise.resolve(350);
      if (where.status_aktif === false) return Promise.resolve(12);
      return Promise.resolve(0);
    });
    prisma.masterKelas.count.mockResolvedValue(18);
    prisma.mataPelajaran.count.mockResolvedValue(14);
    prisma.kontenPublik.count.mockImplementation(({ where } = {}) => {
      if (where?.is_active === true) return Promise.resolve(9);
      return Promise.resolve(12);
    });
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
  });

  test('returns admin-focused user, master data, and CMS metrics', async () => {
    const res = await request(createApp()).get('/api/dashboard/stats');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      totalUsers: 362,
      activeUsers: 350,
      inactiveUsers: 12,
      totalAdmin: 2,
      totalSiswa: 320,
      totalGuru: 28,
      totalKelas: 18,
      totalMapel: 14,
      totalKonten: 12,
      activeKonten: 9,
      activeSemester: { label: 'Semester Ganjil - 2026/2027' },
    });
  });
});
