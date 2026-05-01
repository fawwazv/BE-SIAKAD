// BE-SIAKAD/test/import_users.test.js
// Verifikasi import user massal membuat akun dan profile shell.

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/config/prisma', () => ({
  role: { findMany: jest.fn() },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require('../src/config/prisma');
const { importUsers, exportUsers } = require('../src/controllers/importController');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(payload) {
      this.body = payload;
      return this;
    }),
    setHeader: jest.fn(function setHeader(key, value) {
      this.headers[key] = value;
      return this;
    }),
    send: jest.fn(function send(payload) {
      this.body = payload;
      return this;
    }),
  };
}

describe('Import Users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.role.findMany.mockResolvedValue([
      { id: 1, nama_role: 'Siswa' },
      { id: 2, nama_role: 'Guru Mapel' },
    ]);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (cb) => cb({
      user: {
        create: jest.fn().mockResolvedValue({ id: 'user-imported-001' }),
      },
      userProfile: {
        create: jest.fn().mockResolvedValue({ user_id: 'user-imported-001' }),
      },
    }));
  });

  test('creates user and editable profile shell from CSV', async () => {
    const filePath = path.join(os.tmpdir(), `import-users-${Date.now()}.csv`);
    fs.writeFileSync(
      filePath,
      [
        'nama_lengkap,email,nomor_induk,role,password,jenis_kelamin,nik',
        'Ahmad Siswa,ahmad.import@siakad.sch.id,0012345678,Siswa,password123,L,3203011501080001',
      ].join('\n')
    );

    const req = { file: { path: filePath, originalname: 'users.csv' } };
    const res = mockRes();

    await importUsers(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.data).toMatchObject({ success: 1, failed: 0 });
    const transactionCallback = prisma.$transaction.mock.calls[0][0];
    const tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'user-imported-001' }) },
      userProfile: { create: jest.fn().mockResolvedValue({}) },
    };
    await transactionCallback(tx);
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: 'ahmad.import@siakad.sch.id',
        nama_lengkap: 'Ahmad Siswa',
        nomor_induk: '0012345678',
        role_id: 1,
        status_aktif: true,
      }),
    }));
    expect(tx.userProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'user-imported-001',
        jenis_kelamin: 'L',
        nik: '3203011501080001',
      }),
    });
  });
});

describe('Export Users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([
      {
        nama_lengkap: 'Ahmad Siswa',
        email: 'ahmad@siakad.sch.id',
        nomor_induk: '001',
        status_aktif: true,
        role: { nama_role: 'Siswa' },
        profile: { jenis_kelamin: 'L', nik: '320301' },
      },
    ]);
  });

  test('exports users and profile data as CSV', async () => {
    const req = { query: { format: 'csv' } };
    const res = mockRes();

    await exportUsers(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.body).toContain('nama_lengkap,email,nomor_induk,role,status');
    expect(res.body).toContain('Ahmad Siswa,ahmad@siakad.sch.id,001,Siswa,Aktif');
  });
});
