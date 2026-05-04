const express = require('express');
const request = require('supertest');

jest.mock('../src/config/prisma', () => ({
  semester: { findUnique: jest.fn(), findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  rombel: { findFirst: jest.fn() },
  rombelSiswa: { findFirst: jest.fn() },
  jadwalPelajaran: { findMany: jest.fn() },
  mataPelajaran: { count: jest.fn() },
  nilai: { findMany: jest.fn() },
  kehadiran: { findMany: jest.fn() },
  catatanAkademik: { findMany: jest.fn(), findUnique: jest.fn() },
}));

const prisma = require('../src/config/prisma');
const { getRaporStatusByRombel, previewRapor } = require('../src/controllers/raporController');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'wali-001', role: 'Wali Kelas' };
    next();
  });
  app.get('/api/rapor/status/rombel/:rombelId', getRaporStatusByRombel);
  app.get('/api/rapor/preview/:siswaId/:semesterId', previewRapor);
  return app;
}

describe('Rapor Status Rombel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.semester.findUnique.mockResolvedValue({
      id: 'sem-001',
      nama: 'Semester Ganjil',
      tahun_ajaran_id: 'ta-001',
      tahun_ajaran: { kode: '2026/2027' },
    });
    prisma.rombel.findFirst.mockResolvedValue({
      id: 'rombel-001',
      master_kelas: { nama: 'X-1', wali_kelas_id: 'wali-001' },
      tahun_ajaran: { kode: '2026/2027' },
      wali_kelas: { id: 'wali-001', nama_lengkap: 'Wali Kelas' },
      siswa: [
        {
          siswa_id: 'siswa-001',
          siswa: { id: 'siswa-001', nama_lengkap: 'Aulia', nomor_induk: '001' },
        },
        {
          siswa_id: 'siswa-002',
          siswa: { id: 'siswa-002', nama_lengkap: 'Bima', nomor_induk: '002' },
        },
      ],
    });
    prisma.mataPelajaran.count.mockResolvedValue(2);
    prisma.jadwalPelajaran.findMany.mockResolvedValue([
      { mata_pelajaran_id: 'mapel-001' },
      { mata_pelajaran_id: 'mapel-002' },
    ]);
  });

  test('menandai hanya siswa dengan nilai, kehadiran, dan catatan lengkap sebagai siap cetak', async () => {
    prisma.nilai.findMany.mockResolvedValue([
      { siswa_id: 'siswa-001' },
      { siswa_id: 'siswa-001' },
      { siswa_id: 'siswa-002' },
    ]);
    prisma.kehadiran.findMany.mockResolvedValue([
      { siswa_id: 'siswa-001' },
      { siswa_id: 'siswa-001' },
    ]);
    prisma.catatanAkademik.findMany.mockResolvedValue([
      { id: 'catatan-001', siswa_id: 'siswa-001', catatan: 'Baik' },
    ]);

    const res = await request(createApp()).get('/api/rapor/status/rombel/rombel-001?semesterId=sem-001');

    expect(res.status).toBe(200);
    expect(res.body.data.students[0]).toMatchObject({
      id: 'siswa-001',
      comp: 2,
      total: 2,
      kehadiranCount: 2,
      hasNotes: true,
      canPrint: true,
    });
    expect(res.body.data.students[1]).toMatchObject({
      id: 'siswa-002',
      comp: 1,
      total: 2,
      kehadiranCount: 0,
      hasNotes: false,
      canPrint: false,
      missingData: ['nilai', 'kehadiran', 'catatan'],
    });
  });

  test('preview rapor mengembalikan hasil studi dan status siap cetak dari backend', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'siswa-001',
      nama_lengkap: 'Aulia',
      nomor_induk: '001',
      profile: null,
      role: { name: 'Siswa' },
    });
    prisma.rombelSiswa.findFirst.mockResolvedValue({
      rombel: {
        id: 'rombel-001',
        master_kelas: { nama: 'X-1' },
        wali_kelas: { nama_lengkap: 'Wali Kelas', nomor_induk: 'WK001' },
      },
    });
    prisma.nilai.findMany.mockResolvedValue([
      {
        mata_pelajaran_id: 'mapel-001',
        nilai_tugas: 88,
        nilai_uh: 86,
        nilai_uts: 84,
        nilai_uas: 90,
        nilai_keaktifan: 92,
        nilai_kehadiran: 95,
        nilai_akhir: 89.4,
        mata_pelajaran: { nama: 'Matematika', kkm: 75 },
      },
    ]);
    prisma.kehadiran.findMany.mockResolvedValue([]);
    prisma.catatanAkademik.findUnique.mockResolvedValue(null);
    prisma.mataPelajaran.count.mockResolvedValue(2);

    const res = await request(createApp()).get('/api/rapor/preview/siswa-001/sem-001');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      canPrint: false,
      missingData: ['nilai', 'kehadiran', 'catatan'],
      nilaiCount: 1,
      totalMapel: 2,
      kehadiranCount: 0,
      siswa: {
        nama: 'Aulia',
        nisn: '001',
        kelas: 'X-1',
        waliKelas: 'Wali Kelas',
      },
    });
    expect(res.body.data.nilai[0]).toMatchObject({
      mapel: 'Matematika',
      nilaiTugas: 88,
      nilaiUH: 86,
      nilaiUTS: 84,
      nilaiUAS: 90,
      nilaiKeaktifan: 92,
      nilaiKehadiran: 95,
      nilaiAkhir: 89,
      predikat: 'A-',
      tuntas: true,
    });
  });
});
