const crypto = require('crypto');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/prisma', () => ({
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  userRefreshSession: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  userSecurityEvent: {
    create: jest.fn(),
  },
  $transaction: jest.fn((operations) => Promise.all(operations)),
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

describe('auth refresh flow', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'legacy-secret',
      ACCESS_TOKEN_EXPIRES_IN: '1h',
      REFRESH_TOKEN_EXPIRES_DAYS: '30',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('refresh token rotates session and returns a new access token', async () => {
    const refreshToken = 'refresh-token-001';
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    prisma.userRefreshSession.findFirst.mockResolvedValue({
      id: 'session-001',
      user_id: 'user-001',
      token_hash: tokenHash,
      session_version: 1,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      revoked_at: null,
      user: {
        id: 'user-001',
        email: 'guru@siakad.sch.id',
        nama_lengkap: 'Guru Satu',
        status_aktif: true,
        session_version: 1,
        role: { nama_role: 'Guru Mapel' },
        profile: null,
      },
    });
    prisma.userRefreshSession.update.mockResolvedValue({});
    prisma.userRefreshSession.create.mockResolvedValue({});

    const req = {
      body: {
        refreshToken,
      },
      headers: {
        'user-agent': 'jest',
      },
      ip: '127.0.0.1',
    };
    const res = mockRes();

    await authController.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toMatchObject({
      success: true,
      tokenType: 'Bearer',
      expiresIn: '1h',
      refreshTokenExpiresIn: '30d',
    });
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken).toHaveLength(64);

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe('user-001');
    expect(decoded.exp - decoded.iat).toBe(3600);

    expect(prisma.userRefreshSession.update).toHaveBeenCalledTimes(1);
    expect(prisma.userRefreshSession.create).toHaveBeenCalledTimes(1);
  });

  test('logout revokes refresh token when one is supplied', async () => {
    const refreshToken = 'refresh-token-logout';
    prisma.userRefreshSession.findFirst.mockResolvedValue({
      id: 'session-logout',
      revoked_at: null,
    });
    prisma.userRefreshSession.update.mockResolvedValue({});

    const req = {
      body: {
        refreshToken,
      },
      headers: {},
      user: {
        tokenSource: 'legacy',
      },
    };
    const res = mockRes();

    await authController.logout(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toMatchObject({
      success: true,
    });
    expect(prisma.userRefreshSession.update).toHaveBeenCalledTimes(1);
  });

  test('refresh rejects missing refresh token', async () => {
    const req = { body: {} };
    const res = mockRes();

    await authController.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toMatchObject({ errorCode: 'BAD_REQUEST' });
  });
});
