jest.mock('../src/config/prisma', () => ({
  jurnalMengajar: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
}));

const prisma = require('../src/config/prisma');
const jurnalController = require('../src/controllers/jurnalController');

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

const requestBody = {
  jadwalId: 'jadwal-001',
  tanggal: '2026-05-03',
  pertemuanKe: 1,
  judulMateri: 'Integral parsial',
  deskripsiKegiatan: 'Latihan soal',
};

const jadwalInclude = {
  mata_pelajaran: { nama: 'Matematika Wajib' },
  master_kelas: { nama: 'X-1' },
};

describe('jurnal create for attendance session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a new jurnal before opening attendance', async () => {
    prisma.jurnalMengajar.findFirst.mockResolvedValue(null);
    prisma.jurnalMengajar.create.mockResolvedValue({
      id: 'jurnal-001',
      jadwal_id: requestBody.jadwalId,
      tanggal: requestBody.tanggal,
      pertemuan_ke: requestBody.pertemuanKe,
      judul_materi: requestBody.judulMateri,
      deskripsi_kegiatan: requestBody.deskripsiKegiatan,
      jadwal: jadwalInclude,
    });

    const req = { body: requestBody, user: { userId: 'guru-001' } };
    const res = mockRes();

    await jurnalController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(prisma.jurnalMengajar.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jadwal_id: requestBody.jadwalId,
          guru_id: 'guru-001',
          tanggal: requestBody.tanggal,
          pertemuan_ke: requestBody.pertemuanKe,
          judul_materi: requestBody.judulMateri,
        }),
      })
    );
    expect(res.body.data).toMatchObject({
      id: 'jurnal-001',
      jadwalId: requestBody.jadwalId,
      pertemuanKe: requestBody.pertemuanKe,
      mapel: 'Matematika Wajib',
      kelas: 'X-1',
    });
  });

  test('returns existing jurnal as success so attendance QR can be reopened', async () => {
    prisma.jurnalMengajar.findFirst.mockResolvedValue({
      id: 'jurnal-existing',
      jadwal_id: requestBody.jadwalId,
      tanggal: requestBody.tanggal,
      pertemuan_ke: requestBody.pertemuanKe,
      judul_materi: requestBody.judulMateri,
      deskripsi_kegiatan: requestBody.deskripsiKegiatan,
      jadwal: jadwalInclude,
    });

    const req = { body: requestBody, user: { userId: 'guru-001' } };
    const res = mockRes();

    await jurnalController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(prisma.jurnalMengajar.create).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      message: 'Jurnal untuk pertemuan ini sudah ada. Sesi absensi dapat dibuka kembali.',
      data: {
        id: 'jurnal-existing',
        jadwalId: requestBody.jadwalId,
        tanggal: requestBody.tanggal,
        pertemuanKe: requestBody.pertemuanKe,
      },
    });
  });

  test('allows the same date when the meeting number is different', async () => {
    prisma.jurnalMengajar.findFirst.mockResolvedValue(null);
    prisma.jurnalMengajar.create.mockResolvedValue({
      id: 'jurnal-002',
      jadwal_id: requestBody.jadwalId,
      tanggal: requestBody.tanggal,
      pertemuan_ke: 2,
      judul_materi: 'Substitusi integral',
      deskripsi_kegiatan: requestBody.deskripsiKegiatan,
      jadwal: jadwalInclude,
    });

    const req = {
      body: {
        ...requestBody,
        pertemuanKe: 2,
        judulMateri: 'Substitusi integral',
      },
      user: { userId: 'guru-001' },
    };
    const res = mockRes();

    await jurnalController.create(req, res);

    expect(prisma.jurnalMengajar.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jadwal_id: requestBody.jadwalId, pertemuan_ke: 2 },
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.data).toMatchObject({
      id: 'jurnal-002',
      tanggal: requestBody.tanggal,
      pertemuanKe: 2,
    });
  });
});
