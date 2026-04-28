// BE-SIAKAD/test/profile.test.js
// ═══════════════════════════════════════════════
// PROFILE SYNC INTEGRATION TEST (Guru Role)
// Verifikasi sinkronisasi backend ↔ database
// ═══════════════════════════════════════════════

const express = require('express');
const request = require('supertest');

// ── Mock Prisma BEFORE requiring controller ──
jest.mock('../src/config/prisma', () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userProfile: {
    upsert: jest.fn(),
  },
}));

const prisma = require('../src/config/prisma');
const { getProfile, updateProfile } = require('../src/controllers/profileController');

// ── Setup Express App ──
function createApp(userId = 'guru-user-001') {
  const app = express();
  app.use(express.json());
  // Inject mock auth middleware
  app.use((req, res, next) => {
    req.user = { userId };
    next();
  });
  app.get('/api/profile', getProfile);
  app.put('/api/profile', updateProfile);
  return app;
}

// ═══════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════
describe('Profile Controller — Guru Role Sync Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── TEST 1: GET profile returns correct guru data ──
  describe('GET /api/profile', () => {
    test('should return guru profile data from database', async () => {
      const mockUser = {
        id: 'guru-user-001',
        email: 'siti.aminah@siakad.sch.id',
        nama_lengkap: 'Dra. Siti Aminah',
        nomor_induk: '198501012010012001',
        avatar_url: null,
        role: { nama_role: 'teacher' },
        profile: {
          id: 'profile-001',
          jenis_kelamin: 'Perempuan',
          tanggal_lahir: '1985-01-01',
          tempat_lahir: 'Bandung',
          agama: 'Islam',
          nik: '3204012345670001',
          nama_ibu_kandung: null,
          status_perkawinan: 'Menikah',
          provinsi: 'Jawa Barat',
          kota_kabupaten: 'Bandung',
          kecamatan: 'Cikalong',
          kelurahan: 'Cikalong Wetan',
          detail_alamat: 'Jl. Pendidikan No. 1',
          rt: '001',
          rw: '002',
          kode_pos: '40111',
        },
      };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      const app = createApp();

      const response = await request(app).get('/api/profile');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Profil berhasil diambil');
      expect(response.body.data).toMatchObject({
        namaLengkap: 'Dra. Siti Aminah',
        nomorInduk: '198501012010012001',
        email: 'siti.aminah@siakad.sch.id',
        jenisKelamin: 'Perempuan',
        tempatLahir: 'Bandung',
        agama: 'Islam',
        role: 'teacher',
      });

      // Verify prisma was called with correct userId
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'guru-user-001' },
        include: { role: true, profile: true },
      });
    });

    test('should return 404 when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const app = createApp('nonexistent-id');

      const response = await request(app).get('/api/profile');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User tidak ditemukan');
    });
  });

  // ── TEST 2: PUT profile updates namaLengkap (core sync test) ──
  describe('PUT /api/profile', () => {
    test('should update guru name in User table AND profile in UserProfile table', async () => {
      prisma.user.update.mockResolvedValue({ id: 'guru-user-001' });
      prisma.userProfile.upsert.mockResolvedValue({ user_id: 'guru-user-001' });

      const app = createApp();
      const updateData = {
        namaLengkap: 'Dra. Siti Aminah, M.Pd.',
        tempatLahir: 'Bandung',
        jenisKelamin: 'Perempuan',
        agama: 'Islam',
        statusPerkawinan: 'Menikah',
      };

      const response = await request(app)
        .put('/api/profile')
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Profil berhasil diperbarui');

      // ── CRITICAL: Verify User.nama_lengkap was updated ──
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'guru-user-001' },
        data: { nama_lengkap: 'Dra. Siti Aminah, M.Pd.' },
      });

      // ── Verify UserProfile upsert was called with correct fields ──
      expect(prisma.userProfile.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = prisma.userProfile.upsert.mock.calls[0][0];
      expect(upsertCall.where).toEqual({ user_id: 'guru-user-001' });
      expect(upsertCall.update).toMatchObject({
        tempat_lahir: 'Bandung',
        jenis_kelamin: 'Perempuan',
        agama: 'Islam',
      });
    });

    test('should only update profile fields when namaLengkap is not provided', async () => {
      prisma.userProfile.upsert.mockResolvedValue({ user_id: 'guru-user-001' });

      const app = createApp();
      const updateData = {
        tempatLahir: 'Surabaya',
        agama: 'Islam',
      };

      const response = await request(app)
        .put('/api/profile')
        .send(updateData);

      expect(response.status).toBe(200);

      // User.update should NOT be called when namaLengkap is absent
      expect(prisma.user.update).not.toHaveBeenCalled();

      // UserProfile.upsert should still be called
      expect(prisma.userProfile.upsert).toHaveBeenCalledTimes(1);
    });

    test('should handle server error gracefully', async () => {
      prisma.user.update.mockRejectedValue(new Error('DB connection lost'));

      const app = createApp();
      const updateData = { namaLengkap: 'Test Name' };

      const response = await request(app)
        .put('/api/profile')
        .send(updateData);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Terjadi kesalahan internal pada server');
    });
  });

  // ── TEST 3: Full round-trip sync ──
  describe('Full Round-Trip Sync', () => {
    test('after PUT update, GET should reflect the new name', async () => {
      const app = createApp();
      const newName = 'Dra. Siti Aminah, M.Pd.';

      // Step 1: PUT to update
      prisma.user.update.mockResolvedValue({ id: 'guru-user-001' });
      prisma.userProfile.upsert.mockResolvedValue({ user_id: 'guru-user-001' });

      const putResponse = await request(app)
        .put('/api/profile')
        .send({ namaLengkap: newName });
      expect(putResponse.status).toBe(200);

      // Step 2: GET should return updated name
      prisma.user.findUnique.mockResolvedValue({
        id: 'guru-user-001',
        email: 'siti.aminah@siakad.sch.id',
        nama_lengkap: newName, // Simulates DB already updated
        nomor_induk: '198501012010012001',
        avatar_url: null,
        role: { nama_role: 'teacher' },
        profile: {
          id: 'profile-001',
          jenis_kelamin: 'Perempuan',
          tanggal_lahir: '1985-01-01',
          tempat_lahir: 'Bandung',
          agama: 'Islam',
          nik: null,
          nama_ibu_kandung: null,
          status_perkawinan: 'Menikah',
          provinsi: '',
          kota_kabupaten: '',
          kecamatan: '',
          kelurahan: '',
          detail_alamat: '',
          rt: '',
          rw: '',
          kode_pos: '',
        },
      });

      const getResponse = await request(app).get('/api/profile');
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.data.namaLengkap).toBe(newName);
    });
  });
});
