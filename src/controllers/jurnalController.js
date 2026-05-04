// src/controllers/jurnalController.js
// ═══════════════════════════════════════════════
// JURNAL MENGAJAR CONTROLLER
// Teaching journal: must be filled before attendance
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const parseMeetingNumber = (value) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const repairJournalMeetingConstraints = async () => {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "JurnalMengajar" DROP CONSTRAINT IF EXISTS "JurnalMengajar_jadwal_id_tanggal_key"'
  );
  await prisma.$executeRawUnsafe(
    'DROP INDEX IF EXISTS "JurnalMengajar_jadwal_id_tanggal_key" CASCADE'
  );

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'JurnalMengajar_jadwal_id_pertemuan_ke_key'
      ) THEN
        ALTER TABLE "JurnalMengajar"
          ADD CONSTRAINT "JurnalMengajar_jadwal_id_pertemuan_ke_key"
          UNIQUE ("jadwal_id", "pertemuan_ke");
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Kehadiran" DROP CONSTRAINT IF EXISTS "Kehadiran_siswa_id_jadwal_id_tanggal_key"'
  );
  await prisma.$executeRawUnsafe(
    'DROP INDEX IF EXISTS "Kehadiran_siswa_id_jadwal_id_tanggal_key" CASCADE'
  );

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Kehadiran_siswa_id_jadwal_id_pertemuan_ke_key'
      ) THEN
        ALTER TABLE "Kehadiran"
          ADD CONSTRAINT "Kehadiran_siswa_id_jadwal_id_pertemuan_ke_key"
          UNIQUE ("siswa_id", "jadwal_id", "pertemuan_ke");
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SesiAbsensi_jadwal_id_pertemuan_ke_idx"
      ON "SesiAbsensi"("jadwal_id", "pertemuan_ke");
  `);
};

const serializeJurnal = (data) => ({
  id: data.id,
  jadwalId: data.jadwal_id,
  tanggal: data.tanggal,
  pertemuanKe: data.pertemuan_ke,
  judulMateri: data.judul_materi,
  deskripsiKegiatan: data.deskripsi_kegiatan,
  mapel: data.jadwal?.mata_pelajaran?.nama || '-',
  kelas: data.jadwal?.master_kelas?.nama || '-',
});

const createJurnalRecord = ({
  jadwalId,
  guruId,
  tanggal,
  meetingNumber,
  judulMateri,
  deskripsiKegiatan,
}) =>
  prisma.jurnalMengajar.create({
    data: {
      jadwal_id: jadwalId,
      guru_id: guruId,
      tanggal,
      pertemuan_ke: meetingNumber,
      judul_materi: judulMateri,
      deskripsi_kegiatan: deskripsiKegiatan || null,
    },
    include: {
      jadwal: {
        include: {
          mata_pelajaran: { select: { nama: true } },
          master_kelas: { select: { nama: true } },
        },
      },
    },
  });

/**
 * POST /api/jurnal
 * Guru opens a new meeting session (jurnal entry)
 * Must be created BEFORE attendance can be taken (FR-04.1)
 */
const create = async (req, res) => {
  try {
    const { jadwalId, tanggal, pertemuanKe, judulMateri, deskripsiKegiatan } = req.body;
    const guruId = req.user.userId;
    const meetingNumber = parseMeetingNumber(pertemuanKe);

    if (!jadwalId || !tanggal || !meetingNumber || !judulMateri) {
      return res.status(400).json({ 
        message: 'Jadwal, tanggal, pertemuan ke-, dan judul materi wajib diisi' 
      });
    }

    // Check if jurnal already exists for this jadwal+meeting number.
    // Multiple journals may share the same date when a teacher fills missed meetings later.
    const existing = await prisma.jurnalMengajar.findFirst({
      where: { jadwal_id: jadwalId, pertemuan_ke: meetingNumber },
      include: {
        jadwal: {
          include: {
            mata_pelajaran: { select: { nama: true } },
            master_kelas: { select: { nama: true } },
          },
        },
      },
    });

    if (existing) {
      return res.status(200).json({
        message: 'Jurnal untuk pertemuan ini sudah ada. Sesi absensi dapat dibuka kembali.',
        data: {
          ...serializeJurnal(existing),
        },
      });
    }

    const data = await createJurnalRecord({
      jadwalId,
      guruId,
      tanggal,
      meetingNumber,
      judulMateri,
      deskripsiKegiatan,
    });

    return res.status(201).json({
      message: 'Jurnal mengajar berhasil dibuat. Anda sekarang dapat membuka sesi absensi.',
      data: serializeJurnal(data),
    });
  } catch (error) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target : [];
      const { jadwalId, tanggal, pertemuanKe, judulMateri, deskripsiKegiatan } = req.body;
      const guruId = req.user.userId;
      const meetingNumber = parseMeetingNumber(pertemuanKe);

      if (target.includes('jadwal_id') && target.includes('pertemuan_ke') && meetingNumber) {
        const existing = await prisma.jurnalMengajar.findFirst({
          where: { jadwal_id: jadwalId, pertemuan_ke: meetingNumber },
          include: {
            jadwal: {
              include: {
                mata_pelajaran: { select: { nama: true } },
                master_kelas: { select: { nama: true } },
              },
            },
          },
        });

        if (existing) {
          return res.status(200).json({
            message: 'Jurnal untuk pertemuan ini sudah ada. Sesi absensi dapat dibuka kembali.',
            data: serializeJurnal(existing),
          });
        }
      }

      if (target.includes('jadwal_id') && target.includes('tanggal')) {
        try {
          await repairJournalMeetingConstraints();
          const data = await createJurnalRecord({
            jadwalId,
            guruId,
            tanggal,
            meetingNumber,
            judulMateri,
            deskripsiKegiatan,
          });

          return res.status(201).json({
            message: 'Jurnal mengajar berhasil dibuat setelah constraint database diperbaiki.',
            data: serializeJurnal(data),
          });
        } catch (repairError) {
          console.error('Jurnal Constraint Repair Error:', repairError);
          return res.status(409).json({
            message:
              'Database masih memakai constraint lama jadwal+tanggal dan perbaikan otomatis gagal. Jalankan migration perbaikan jurnal terlebih dahulu.',
            errorCode: 'OLD_JOURNAL_DATE_CONSTRAINT',
          });
        }
      }
    }

    console.error('Jurnal Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/jurnal/:jadwalId
 * Get all journal entries for a specific jadwal
 */
const getByJadwal = async (req, res) => {
  try {
    const data = await prisma.jurnalMengajar.findMany({
      where: { jadwal_id: req.params.jadwalId },
      orderBy: { pertemuan_ke: 'asc' },
    });

    return res.status(200).json({
      message: 'Data jurnal mengajar berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        jadwalId: d.jadwal_id,
        tanggal: d.tanggal,
        pertemuanKe: d.pertemuan_ke,
        judulMateri: d.judul_materi,
        deskripsiKegiatan: d.deskripsi_kegiatan,
        createdAt: d.created_at,
      })),
    });
  } catch (error) {
    console.error('Jurnal GetByJadwal Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/jurnal/check/:jadwalId/:tanggal
 * Check if jurnal exists for a jadwal+date (used by frontend before allowing attendance)
 */
const checkExists = async (req, res) => {
  try {
    const { jadwalId, tanggal } = req.params;
    const meetingNumber = parseMeetingNumber(req.query.pertemuanKe);

    const jurnal = await prisma.jurnalMengajar.findFirst({
      where: {
        jadwal_id: jadwalId,
        ...(meetingNumber ? { pertemuan_ke: meetingNumber } : { tanggal }),
      },
    });

    return res.status(200).json({
      message: jurnal ? 'Jurnal ditemukan' : 'Jurnal belum dibuat',
      data: {
        exists: !!jurnal,
        jurnal: jurnal ? {
          id: jurnal.id,
          pertemuanKe: jurnal.pertemuan_ke,
          judulMateri: jurnal.judul_materi,
          deskripsiKegiatan: jurnal.deskripsi_kegiatan,
        } : null,
      },
    });
  } catch (error) {
    console.error('Jurnal Check Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * PUT /api/jurnal/:id
 * Update an existing journal entry
 */
const update = async (req, res) => {
  try {
    const { pertemuanKe, judulMateri, deskripsiKegiatan } = req.body;

    const updateData = {};
    if (pertemuanKe !== undefined) updateData.pertemuan_ke = parseInt(pertemuanKe);
    if (judulMateri) updateData.judul_materi = judulMateri;
    if (deskripsiKegiatan !== undefined) updateData.deskripsi_kegiatan = deskripsiKegiatan || null;

    const data = await prisma.jurnalMengajar.update({
      where: { id: req.params.id },
      data: updateData,
    });

    return res.status(200).json({
      message: 'Jurnal mengajar berhasil diperbarui',
      data: {
        id: data.id,
        pertemuanKe: data.pertemuan_ke,
        judulMateri: data.judul_materi,
        deskripsiKegiatan: data.deskripsi_kegiatan,
      },
    });
  } catch (error) {
    console.error('Jurnal Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * DELETE /api/jurnal/:id
 * Cascade: hapus Kehadiran & SesiAbsensi terkait dulu, lalu JurnalMengajar
 */
const remove = async (req, res) => {
  try {
    // Get jurnal data first to get jadwal_id + tanggal
    const jurnal = await prisma.jurnalMengajar.findUnique({
      where: { id: req.params.id },
      select: { jadwal_id: true, tanggal: true, pertemuan_ke: true }
    });

    if (!jurnal) {
      return res.status(404).json({ message: 'Jurnal tidak ditemukan' });
    }

    // Cascade delete (order matters — FK constraints)
    await prisma.$transaction([
      // 1. Hapus semua Kehadiran untuk sesi ini
      prisma.kehadiran.deleteMany({
        where: { jadwal_id: jurnal.jadwal_id, pertemuan_ke: jurnal.pertemuan_ke }
      }),
      // 2. Hapus SesiAbsensi terkait
      prisma.sesiAbsensi.deleteMany({
        where: { jadwal_id: jurnal.jadwal_id, pertemuan_ke: jurnal.pertemuan_ke }
      }),
      // 3. Hapus JurnalMengajar
      prisma.jurnalMengajar.delete({ where: { id: req.params.id } }),
    ]);

    return res.status(200).json({ message: 'Pertemuan dan seluruh data absensinya berhasil dihapus' });
  } catch (error) {
    console.error('Jurnal Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { create, getByJadwal, checkExists, update, remove };
