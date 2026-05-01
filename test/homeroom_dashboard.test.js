// BE-SIAKAD/test/homeroom_dashboard.test.js
// Verifikasi dashboard wali kelas membaca mapping dari Master Kelas.

const express = require('express');
const request = require('supertest');

jest.mock('../src/config/prisma', () => ({
  tahunAjaran: { findFirst: jest.fn() },
  masterKelas: { findMany: jest.fn() },
  rombel: { findFirst: jest.fn(), update: jest.fn() },
  kehadiran: { findMany: jest.fn() },
  semester: { findFirst: jest.fn() },
  nilai: { findMany: jest.fn() },
}));

const prisma = require('../src/config/prisma');
const { getWaliKelasDashboard } = require('../src/controllers/dashboardController');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'guru-001', role: 'Guru Mapel' };
    next();
  });
  app.get('/api/dashboard/wali-kelas', getWaliKelasDashboard);
  return app;
}

describe('Homeroom Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.tahunAjaran.findFirst.mockResolvedValue({ id: 'ta-aktif' });
    prisma.masterKelas.findMany.mockResolvedValue([{ id: 'kelas-001' }]);
    prisma.kehadiran.findMany.mockResolvedValue([
      { siswa_id: 'siswa-001', status: 'HADIR' },
      { siswa_id: 'siswa-001', status: 'IZIN' },
    ]);
    prisma.semester.findFirst.mockResolvedValue({ id: 'semester-001' });
    prisma.nilai.findMany.mockResolvedValue([
      {
        siswa_id: 'siswa-001',
        nilai_akhir: 86,
        mata_pelajaran: { nama: 'Matematika' },
      },
    ]);
  });

  test('membaca wali kelas dari mapping master kelas dan menyinkronkan rombel', async () => {
    prisma.rombel.findFirst.mockResolvedValue({
      id: 'rombel-001',
      master_kelas_id: 'kelas-001',
      wali_kelas_id: null,
      master_kelas: { nama: 'XI IPA 1' },
      tahun_ajaran: { kode: '2026/2027' },
      siswa: [
        {
          siswa_id: 'siswa-001',
          siswa: {
            id: 'siswa-001',
            nama_lengkap: 'Aulia Rahma',
            nomor_induk: '001',
          },
        },
      ],
    });
    prisma.rombel.update.mockResolvedValue({});

    const res = await request(createApp()).get('/api/dashboard/wali-kelas');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      hasClass: true,
      rombelId: 'rombel-001',
      masterKelasId: 'kelas-001',
      kelas: 'XI IPA 1',
      tahunAjaran: '2026/2027',
      totalSiswa: 1,
    });
    expect(prisma.rombel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tahun_ajaran_id: 'ta-aktif',
          OR: expect.arrayContaining([
            { wali_kelas_id: 'guru-001' },
            { master_kelas_id: { in: ['kelas-001'] } },
          ]),
        }),
      })
    );
    expect(prisma.rombel.update).toHaveBeenCalledWith({
      where: { id: 'rombel-001' },
      data: { wali_kelas_id: 'guru-001' },
    });
  });

  test('mengembalikan hasClass false jika guru belum dipetakan sebagai wali kelas', async () => {
    prisma.masterKelas.findMany.mockResolvedValue([]);
    prisma.rombel.findFirst.mockResolvedValue(null);

    const res = await request(createApp()).get('/api/dashboard/wali-kelas');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ hasClass: false });
    expect(prisma.rombel.update).not.toHaveBeenCalled();
  });
});
