const express = require('express');
const request = require('supertest');

jest.mock('../src/config/prisma', () => ({
  kontenPublik: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}));

const prisma = require('../src/config/prisma');
const { update } = require('../src/controllers/cmsController');
const { sanitizeAll } = require('../src/middlewares/sanitizeMiddleware');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(sanitizeAll);
  app.put('/api/cms/:id', update);
  return app;
}

describe('CMS Update Controller', () => {
  const existingContent = {
    id: 'cms-001',
    tipe: 'BERITA',
    judul: 'Judul Lama',
    konten: '<p>Konten lama</p>',
    gambar_url: '/uploads/cms/old.jpg',
    video_url: null,
    urutan: 0,
    is_active: true,
    created_at: new Date('2026-05-01T00:00:00.000Z'),
    updated_at: new Date('2026-05-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('updates title, content, status, and order without escaping CMS HTML tags', async () => {
    prisma.kontenPublik.findUnique.mockResolvedValue(existingContent);
    prisma.kontenPublik.update.mockImplementation(({ data }) =>
      Promise.resolve({
        ...existingContent,
        ...{
          tipe: data.tipe ?? existingContent.tipe,
          judul: data.judul ?? existingContent.judul,
          konten: data.konten ?? existingContent.konten,
          gambar_url: data.gambar_url ?? existingContent.gambar_url,
          video_url: data.video_url ?? existingContent.video_url,
          urutan: data.urutan ?? existingContent.urutan,
          is_active: data.is_active ?? existingContent.is_active,
          updated_at: new Date('2026-05-02T00:00:00.000Z'),
        },
      })
    );

    const res = await request(createApp())
      .put('/api/cms/cms-001')
      .send({
        title: 'Judul Baru',
        content: '<p><strong>Konten baru</strong> &amp; jelas</p>',
        order: 7,
        isActive: false,
      });

    expect(res.status).toBe(200);
    expect(prisma.kontenPublik.update).toHaveBeenCalledWith({
      where: { id: 'cms-001' },
      data: {
        judul: 'Judul Baru',
        konten: '<p><strong>Konten baru</strong> &amp; jelas</p>',
        urutan: 7,
        is_active: false,
      },
    });
    expect(res.body.data).toMatchObject({
      id: 'cms-001',
      type: 'BERITA',
      title: 'Judul Baru',
      content: '<p><strong>Konten baru</strong> &amp; jelas</p>',
      order: 7,
      isActive: false,
    });
  });

  test('returns 404 when content does not exist', async () => {
    prisma.kontenPublik.findUnique.mockResolvedValue(null);

    const res = await request(createApp())
      .put('/api/cms/missing-cms')
      .send({ title: 'Judul Baru' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Konten tidak ditemukan');
    expect(prisma.kontenPublik.update).not.toHaveBeenCalled();
  });

  test('returns 400 for invalid update payload', async () => {
    const res = await request(createApp())
      .put('/api/cms/cms-001')
      .send({
        type: 'INVALID',
        title: '',
        order: 'bukan-angka',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Tipe konten harus salah satu dari');
    expect(res.body.message).toContain('Judul wajib diisi');
    expect(res.body.message).toContain('Urutan tampil harus berupa angka');
    expect(prisma.kontenPublik.findUnique).not.toHaveBeenCalled();
    expect(prisma.kontenPublik.update).not.toHaveBeenCalled();
  });
});
