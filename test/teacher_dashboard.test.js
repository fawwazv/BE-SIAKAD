// BE-SIAKAD/test/teacher_dashboard.test.js
// ═══════════════════════════════════════════════
// TEACHER DASHBOARD — Backend Integration Test
// Verifikasi sinkronisasi backend ↔ database untuk fitur Daftar Kelas Guru
// ═══════════════════════════════════════════════

const express = require('express');
const request = require('supertest');

// ── Mock Prisma ──────────────────────────────────────────────────────────────
jest.mock('../src/config/prisma', () => ({
  guruMapel: { findMany: jest.fn() },
  jadwalPelajaran: { findMany: jest.fn(), count: jest.fn() },
  jurnalMengajar: { findMany: jest.fn() },
}));

const prisma = require('../src/config/prisma');
const { getGuruDashboard } = require('../src/controllers/dashboardController');

// ── Setup Express App ──────────────────────────────────────────────────────
function createApp(userId = 'guru-001') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId }; next(); });
  app.get('/api/dashboard/guru', getGuruDashboard);
  return app;
}

// ── Mock Data ────────────────────────────────────────────────────────────────
const mockSchedules = [
  {
    id: 'jadwal-1',
    master_kelas_id: 'kelas-1',
    mata_pelajaran_id: 'mapel-1',
    hari: 'Senin',
    jam_mulai: '07:00',
    jam_selesai: '07:45',
    master_kelas: {
      id: 'kelas-1',
      nama: 'X IPA 1',
      rombel: [{ id: 'rombel-1', _count: { siswa: 30 } }],
    },
    mata_pelajaran: { id: 'mapel-1', nama: 'Matematika' },
    ruang_kelas: { kode: 'R101' },
  },
  {
    id: 'jadwal-2',
    master_kelas_id: 'kelas-1',
    mata_pelajaran_id: 'mapel-1',
    hari: 'Rabu',
    jam_mulai: '07:00',
    jam_selesai: '07:45',
    master_kelas: {
      id: 'kelas-1',
      nama: 'X IPA 1',
      rombel: [{ id: 'rombel-1', _count: { siswa: 30 } }],
    },
    mata_pelajaran: { id: 'mapel-1', nama: 'Matematika' },
    ruang_kelas: { kode: 'R101' },
  },
  {
    id: 'jadwal-3',
    master_kelas_id: 'kelas-2',
    mata_pelajaran_id: 'mapel-1',
    hari: 'Selasa',
    jam_mulai: '09:00',
    jam_selesai: '09:45',
    master_kelas: {
      id: 'kelas-2',
      nama: 'X IPA 2',
      rombel: [{ id: 'rombel-2', _count: { siswa: 28 } }],
    },
    mata_pelajaran: { id: 'mapel-1', nama: 'Matematika' },
    ruang_kelas: { kode: 'R102' },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════
describe('Teacher Dashboard — Sinkronisasi Daftar Kelas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.guruMapel.findMany.mockResolvedValue([]);
    prisma.jadwalPelajaran.count.mockResolvedValue(3);
    prisma.jurnalMengajar.findMany.mockResolvedValue([]);
  });

  // ── TEST 1: daftarKelas harus ada di response ──
  test('GET /api/dashboard/guru harus mengembalikan field daftarKelas', async () => {
    prisma.jadwalPelajaran.findMany.mockResolvedValue(mockSchedules);

    const res = await request(createApp()).get('/api/dashboard/guru');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('daftarKelas');
    expect(Array.isArray(res.body.data.daftarKelas)).toBe(true);
  });

  // ── TEST 2: daftarKelas harus di-group unik per kelas+mapel ──
  test('daftarKelas harus mengelompokkan jadwal berdasarkan kelas & mata pelajaran unik', async () => {
    prisma.jadwalPelajaran.findMany.mockResolvedValue(mockSchedules);

    const res = await request(createApp()).get('/api/dashboard/guru');

    // Ada 3 jadwal tapi hanya 2 kombinasi unik (kelas-1+mapel-1 dan kelas-2+mapel-1)
    expect(res.body.data.daftarKelas).toHaveLength(2);
  });

  // ── TEST 3: Setiap entry harus memiliki field lengkap ──
  test('setiap item daftarKelas harus memiliki field yang dibutuhkan frontend', async () => {
    prisma.jadwalPelajaran.findMany.mockResolvedValue(mockSchedules);

    const res = await request(createApp()).get('/api/dashboard/guru');
    const item = res.body.data.daftarKelas[0];

    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('subject');
    expect(item).toHaveProperty('className');
    expect(item).toHaveProperty('scheduleSummary');
    expect(item).toHaveProperty('studentCount');
    expect(item).toHaveProperty('rombelId');
    expect(item).toHaveProperty('days');
  });

  // ── TEST 4: scheduleSummary menggabungkan hari dengan koma ──
  test('scheduleSummary harus menggabungkan beberapa hari menjadi string koma-separated', async () => {
    prisma.jadwalPelajaran.findMany.mockResolvedValue(mockSchedules);

    const res = await request(createApp()).get('/api/dashboard/guru');
    // kelas X IPA 1 ada di hari Senin dan Rabu
    const kelasXIPA1 = res.body.data.daftarKelas.find((c) => c.className === 'X IPA 1');

    expect(kelasXIPA1).toBeDefined();
    expect(kelasXIPA1.scheduleSummary).toContain('Senin');
    expect(kelasXIPA1.scheduleSummary).toContain('Rabu');
  });

  // ── TEST 5: studentCount dari rombel aktif ──
  test('studentCount harus diambil dari rombel aktif yang terhubung ke kelas', async () => {
    prisma.jadwalPelajaran.findMany.mockResolvedValue(mockSchedules);

    const res = await request(createApp()).get('/api/dashboard/guru');
    const kelasXIPA1 = res.body.data.daftarKelas.find((c) => c.className === 'X IPA 1');
    const kelasXIPA2 = res.body.data.daftarKelas.find((c) => c.className === 'X IPA 2');

    expect(kelasXIPA1.studentCount).toBe(30);
    expect(kelasXIPA2.studentCount).toBe(28);
  });

  // ── TEST 6: daftarKelas kosong jika guru tidak punya jadwal ──
  test('daftarKelas harus kosong [] jika guru belum memiliki jadwal', async () => {
    prisma.jadwalPelajaran.findMany.mockResolvedValue([]);
    prisma.jadwalPelajaran.count.mockResolvedValue(0);

    const res = await request(createApp()).get('/api/dashboard/guru');

    expect(res.status).toBe(200);
    expect(res.body.data.daftarKelas).toHaveLength(0);
    expect(res.body.data.totalKelas).toBe(0);
  });
});
