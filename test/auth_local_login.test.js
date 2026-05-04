const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/prisma', () => ({
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
}));

const prisma = require('../src/config/prisma');
const authController = require('../src/controllers/authController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn(function json(payload) {
      this.body = payload;
      return this;
    }),
  };
}

describe('local dev auth login', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      APP_ENV: 'development',
      JWT_SECRET: 'legacy-secret',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('logs in with email/password in development', async () => {
    const passwordHash = await bcrypt.hash('password123', 4);
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-001',
      email: 'admin@siakad.sch.id',
      password_hash: passwordHash,
      nama_lengkap: 'Admin SIAKAD',
      status_aktif: true,
      avatar_url: null,
      role: { nama_role: 'Administrator' },
    });

    const req = {
      body: {
        email: 'admin@siakad.sch.id',
        password: 'password123',
      },
    };
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toMatchObject({
      success: true,
      user: {
        id: 'user-001',
        email: 'admin@siakad.sch.id',
        role: 'admin',
      },
    });
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET)).toMatchObject({
      userId: 'user-001',
      role: 'Administrator',
    });
  });

  test('rejects local login in production unless explicitly enabled', async () => {
    process.env.APP_ENV = 'production';
    delete process.env.AUTH_LOCAL_LOGIN_ENABLED;

    const req = {
      body: {
        email: 'admin@siakad.sch.id',
        password: 'password123',
      },
    };
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.body).toMatchObject({ errorCode: 'LOCAL_LOGIN_DISABLED' });
  });
});

