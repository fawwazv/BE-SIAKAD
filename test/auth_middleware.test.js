const jwt = require('jsonwebtoken');

jest.mock('../src/config/prisma', () => ({
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
}));

const prisma = require('../src/config/prisma');
const {
  verifyToken,
  authorizeRoles,
  normalizeRoleName,
} = require('../src/middlewares/authMiddleware');

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

function mockReq(token) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

const activeUser = {
  id: 'academic-user-001',
  auth_user_id: '11111111-1111-1111-1111-111111111111',
  email: 'guru@siakad.sch.id',
  nama_lengkap: 'Guru Satu',
  status_aktif: true,
  is_sso_allowed: true,
  role: { nama_role: 'Guru Mapel' },
};

describe('authMiddleware Supabase auth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      SUPABASE_JWT_SECRET: 'supabase-secret',
      JWT_SECRET: 'legacy-secret',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('rejects request without bearer token', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects invalid token', async () => {
    const req = mockReq('invalid-token');
    const res = mockRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toMatchObject({ errorCode: 'INVALID_TOKEN' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects valid Supabase token when academic user is missing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const token = jwt.sign(
      { sub: activeUser.auth_user_id, email: activeUser.email },
      process.env.SUPABASE_JWT_SECRET
    );
    const req = mockReq(token);
    const res = mockRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toMatchObject({ errorCode: 'UNREGISTERED_ACADEMIC_USER' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects inactive academic user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      status_aktif: false,
    });
    const token = jwt.sign(
      { sub: activeUser.auth_user_id, email: activeUser.email },
      process.env.SUPABASE_JWT_SECRET
    );
    const req = mockReq(token);
    const res = mockRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toMatchObject({ errorCode: 'INACTIVE_USER' });
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches user from database role, not from client payload', async () => {
    prisma.user.findUnique.mockResolvedValue(activeUser);
    const token = jwt.sign(
      {
        sub: activeUser.auth_user_id,
        email: activeUser.email,
        school_role: 'ADMIN',
      },
      process.env.SUPABASE_JWT_SECRET
    );
    const req = mockReq(token);
    const res = mockRes();
    const next = jest.fn();

    await verifyToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      userId: activeUser.id,
      academicUserId: activeUser.id,
      authUserId: activeUser.auth_user_id,
      role: 'Guru Mapel',
      securityRole: 'GURU',
      email: activeUser.email,
    });
  });
});

describe('authorizeRoles', () => {
  test('normalizes existing role names to security role names', () => {
    expect(normalizeRoleName('Administrator')).toBe('ADMIN');
    expect(normalizeRoleName('Wali Kelas')).toBe('WALI_KELAS');
    expect(normalizeRoleName('Guru Mapel')).toBe('GURU');
  });

  test('allows matching normalized role', () => {
    const req = {
      user: {
        role: 'Guru Mapel',
        securityRole: 'GURU',
      },
    };
    const res = mockRes();
    const next = jest.fn();

    authorizeRoles('GURU')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('rejects wrong role with 403', () => {
    const req = {
      user: {
        role: 'Siswa',
        securityRole: 'SISWA',
      },
    };
    const res = mockRes();
    const next = jest.fn();

    authorizeRoles('Administrator')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toMatchObject({ errorCode: 'FORBIDDEN' });
    expect(next).not.toHaveBeenCalled();
  });
});

