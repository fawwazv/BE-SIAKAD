// BE-SIAKAD/test/homeroom_dashboard.test.js
// Verifikasi dashboard wali kelas membaca mapping dari Master Kelas.

const express = require('express');
const request = require('supertest');

jest.mock('../src/config/prisma', () => ({
  tahunAjaran: { findFirst: jest.fn() },
  masterKelas: { findMany: jest.fn() },
  rombel: { findFirst: jest.fn(), update: jest.fn() },
  jadwalPelajaran: { findMany: jest.fn() },
  kehadiran: { findMany: jest.fn() },
  semester: { findFirst: jest.fn() },
  nilai: { findMany: jest.fn() },
}));

const prisma = require('../src/config/prisma');
const {
  getWaliKelasDashboard,
  getWaliKelasKehadiranMapel,
} = require('../src/controllers/dashboardController');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'guru-001', role: 'Guru Mapel' };
    next();
  });
  app.get('/api/dashboard/wali-kelas', getWaliKelasDashboard);
  app.get('/api/dashboard/wali-kelas/kehadiran-mapel', getWaliKelasKehadiranMapel);
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
    prisma.jadwalPelajaran.findMany.mockResolvedValue([]);
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

  test('monitoring kehadiran menggabungkan beberapa jadwal pada mapel yang sama', async () => {
    prisma.semester.findFirst.mockResolvedValue({
      id: 'semester-001',
      nama: 'Semester Ganjil',
      tahun_ajaran: { kode: '2026/2027' },
    });
    prisma.rombel.findFirst.mockResolvedValue({
      id: 'rombel-001',
      master_kelas_id: 'kelas-001',
      wali_kelas_id: 'guru-001',
      master_kelas: { nama: 'XI IPA 1' },
      tahun_ajaran: { kode: '2026/2027' },
      siswa: [
        {
          siswa_id: 'siswa-001',
          siswa: { id: 'siswa-001', nama_lengkap: 'Aulia Rahma', nomor_induk: '001' },
        },
        {
          siswa_id: 'siswa-002',
          siswa: { id: 'siswa-002', nama_lengkap: 'Bagas Putra', nomor_induk: '002' },
        },
      ],
    });
    prisma.jadwalPelajaran.findMany.mockResolvedValue([
      {
        id: 'jadwal-mtk-senin',
        master_kelas_id: 'kelas-001',
        mata_pelajaran_id: 'mapel-mtk',
        hari: 'Senin',
        jam_mulai: '07:00',
        jam_selesai: '07:45',
        slot_index: 1,
        mata_pelajaran: { id: 'mapel-mtk', nama: 'Matematika' },
        guru: { nama_lengkap: 'Pak Guru' },
        ruang_kelas: { kode: 'R101' },
      },
      {
        id: 'jadwal-mtk-rabu',
        master_kelas_id: 'kelas-001',
        mata_pelajaran_id: 'mapel-mtk',
        hari: 'Rabu',
        jam_mulai: '09:00',
        jam_selesai: '09:45',
        slot_index: 3,
        mata_pelajaran: { id: 'mapel-mtk', nama: 'Matematika' },
        guru: { nama_lengkap: 'Pak Guru' },
        ruang_kelas: { kode: 'R101' },
      },
      {
        id: 'jadwal-bin-selasa',
        master_kelas_id: 'kelas-001',
        mata_pelajaran_id: 'mapel-bin',
        hari: 'Selasa',
        jam_mulai: '08:00',
        jam_selesai: '08:45',
        slot_index: 2,
        mata_pelajaran: { id: 'mapel-bin', nama: 'Bahasa Indonesia' },
        guru: { nama_lengkap: 'Bu Guru' },
        ruang_kelas: { kode: 'R102' },
      },
    ]);
    prisma.kehadiran.findMany.mockResolvedValue([
      {
        siswa_id: 'siswa-001',
        jadwal_id: 'jadwal-mtk-senin',
        tanggal: '2026-05-04',
        status: 'HADIR',
        pertemuan_ke: 1,
      },
      {
        siswa_id: 'siswa-001',
        jadwal_id: 'jadwal-mtk-rabu',
        tanggal: '2026-05-06',
        status: 'ALPA',
        pertemuan_ke: 2,
      },
      {
        siswa_id: 'siswa-002',
        jadwal_id: 'jadwal-mtk-rabu',
        tanggal: '2026-05-06',
        status: 'HADIR',
        pertemuan_ke: 2,
      },
      {
        siswa_id: 'siswa-001',
        jadwal_id: 'jadwal-bin-selasa',
        tanggal: '2026-05-05',
        status: 'HADIR',
        pertemuan_ke: 1,
      },
    ]);

    const res = await request(createApp()).get('/api/dashboard/wali-kelas/kehadiran-mapel');

    expect(res.status).toBe(200);
    expect(res.body.data.subjects).toHaveLength(2);

    const matematika = res.body.data.subjects.find((s) => s.subject === 'Matematika');
    expect(matematika.scheduleIds).toEqual(['jadwal-mtk-senin', 'jadwal-mtk-rabu']);
    expect(matematika.totalHadir).toBe(2);
    expect(matematika.totalAlpa).toBe(1);
    expect(matematika.totalPertemuan).toBe(3);

    const aulia = matematika.students.find((s) => s.siswaId === 'siswa-001');
    expect(aulia.totalHadir).toBe(1);
    expect(aulia.totalAlpa).toBe(1);
    expect(aulia.rate).toBe(50);
  });

  test('monitoring kehadiran memakai semesterId query saat tersedia', async () => {
    prisma.semester.findFirst.mockResolvedValue({
      id: 'semester-target',
      nama: 'Semester Genap',
      tahun_ajaran: { kode: '2026/2027' },
    });
    prisma.rombel.findFirst.mockResolvedValue({
      id: 'rombel-001',
      master_kelas_id: 'kelas-001',
      wali_kelas_id: 'guru-001',
      master_kelas: { nama: 'XI IPA 1' },
      tahun_ajaran: { kode: '2026/2027' },
      siswa: [
        {
          siswa_id: 'siswa-001',
          siswa: { id: 'siswa-001', nama_lengkap: 'Aulia Rahma', nomor_induk: '001' },
        },
      ],
    });
    prisma.jadwalPelajaran.findMany.mockResolvedValue([
      {
        id: 'jadwal-mtk',
        master_kelas_id: 'kelas-001',
        mata_pelajaran_id: 'mapel-mtk',
        hari: 'Senin',
        jam_mulai: '07:00',
        jam_selesai: '07:45',
        slot_index: 1,
        mata_pelajaran: { id: 'mapel-mtk', nama: 'Matematika' },
        guru: { nama_lengkap: 'Pak Guru' },
        ruang_kelas: { kode: 'R101' },
      },
    ]);
    prisma.kehadiran.findMany.mockResolvedValue([]);

    await request(createApp()).get('/api/dashboard/wali-kelas/kehadiran-mapel?semesterId=semester-target');

    expect(prisma.semester.findFirst).toHaveBeenCalledWith({
      where: { id: 'semester-target' },
      include: { tahun_ajaran: true },
    });
    expect(prisma.kehadiran.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ semester_id: 'semester-target' }),
      })
    );
  });

  test('monitoring kehadiran mengembalikan hasClass false jika belum menjadi wali', async () => {
    prisma.masterKelas.findMany.mockResolvedValue([]);
    prisma.rombel.findFirst.mockResolvedValue(null);

    const res = await request(createApp()).get('/api/dashboard/wali-kelas/kehadiran-mapel');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ hasClass: false });
    expect(prisma.jadwalPelajaran.findMany).not.toHaveBeenCalled();
  });
});
