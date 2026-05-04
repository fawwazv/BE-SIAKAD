const request = require('supertest');
const app = require('../src/app');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let server;
let adminToken;
let teacherToken;
let testJadwalId;
let testSiswaId;
let testSemesterId;

beforeAll(async () => {
  // Start server
  server = app.listen(0);

  // Authenticate (using test routes or mock)
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'siakad_cikalong_secret_key_2026_@!';
  
  // Use existing admin user for token
  const adminUser = await prisma.user.findFirst({ where: { role: 'Admin' } });
  adminToken = jwt.sign({ userId: adminUser.id, role: 'Admin' }, JWT_SECRET, { expiresIn: '1h' });

  const teacherUser = await prisma.user.findFirst({ where: { role: 'Guru' } });
  teacherToken = jwt.sign({ userId: teacherUser.id, role: 'Guru' }, JWT_SECRET, { expiresIn: '1h' });

  // Get some valid DB IDs
  const jadwal = await prisma.jadwalPelajaran.findFirst();
  testJadwalId = jadwal.id;

  const siswa = await prisma.user.findFirst({ where: { role: 'Siswa' } });
  testSiswaId = siswa.id;

  const semester = await prisma.semester.findFirst({ where: { is_active: true } });
  testSemesterId = semester.id;
});

afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

describe('Kehadiran Integration Tests', () => {
  it('harus memvalidasi pembuatan jurnal sebelum buka sesi', async () => {
    // API should return valid response when fetching journals
    const res = await request(server)
      .get(`/api/jurnal/${testJadwalId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  it('harus berhasil generate QR code untuk absensi (Mocked Response)', async () => {
    const payload = {
      jadwalId: testJadwalId,
      tanggal: new Date().toISOString().split('T')[0],
      pertemuanKe: 999, // dummy
      topik: 'Test Integration Topic',
      deskripsi: 'Test Description'
    };

    const res = await request(server)
      .post('/api/kehadiran/generate-qr')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('qrImage');
    expect(res.body.data).toHaveProperty('token');
  });
});
