// src/controllers/rombelController.js
// ═══════════════════════════════════════════════
// ROMBEL (Rombongan Belajar) CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

// ── Prisma Error Handler ──
const handlePrismaError = (error, res, context) => {
  console.error(`Rombel ${context} Error:`, error);

  // P2002: Unique constraint violation
  if (error.code === 'P2002') {
    const fields = error.meta?.target || [];
    if (fields.includes('master_kelas_id') && fields.includes('tahun_ajaran_id')) {
      return res.status(409).json({
        message: 'Rombel untuk kelas ini sudah ada di tahun ajaran yang aktif. Setiap kelas hanya boleh memiliki satu rombel per tahun ajaran.',
      });
    }
    if (fields.includes('ruang_kelas_id') || fields.includes('ruangKelasId')) {
      return res.status(409).json({
        message: 'Ruangan ini sudah digunakan oleh rombel lain di tahun ajaran yang sama.',
      });
    }
    return res.status(409).json({
      message: `Data yang Anda masukkan sudah ada atau bentrok dengan data lain (kolom: ${fields.join(', ')}).`,
    });
  }

  // P2003: Foreign key constraint failed
  if (error.code === 'P2003') {
    return res.status(400).json({
      message: 'Data referensi tidak ditemukan. Pastikan Kelas, Ruangan, dan Tahun Ajaran yang dipilih masih valid.',
    });
  }

  // P2025: Record not found (for update/delete)
  if (error.code === 'P2025') {
    return res.status(404).json({
      message: 'Data tidak ditemukan atau sudah dihapus sebelumnya.',
    });
  }

  return res.status(500).json({ message: 'Terjadi kesalahan internal pada server. Hubungi administrator.' });
};

const getAll = async (req, res) => {
  try {
    const data = await prisma.rombel.findMany({
      include: {
        master_kelas: true,
        tahun_ajaran: true,
        ruang_kelas: true,
        wali_kelas: { select: { id: true, nama_lengkap: true } },
        _count: { select: { siswa: true } },
      },
      orderBy: { master_kelas: { nama: 'asc' } },
    });

    return res.status(200).json({
      message: 'Data rombel berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        masterKelasId: d.master_kelas_id,
        masterKelasName: d.master_kelas.nama,
        tahunAjaranId: d.tahun_ajaran_id,
        tahunAjaranCode: d.tahun_ajaran.kode,
        ruangKelasId: d.ruang_kelas_id,
        ruangKelasCode: d.ruang_kelas?.kode || '-',
        ruangKelasCapacity: d.ruang_kelas?.kapasitas || 0,
        waliKelasId: d.wali_kelas_id,
        waliKelasName: d.wali_kelas?.nama_lengkap || '-',
        siswaCount: d._count.siswa,
      })),
    });
  } catch (error) {
    console.error('Rombel GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const create = async (req, res) => {
  try {
    const { masterKelasId, ruangKelasId } = req.body;
    if (!masterKelasId || !ruangKelasId) {
      return res.status(400).json({ message: 'Kelas dan ruangan wajib diisi.' });
    }

    const activeTahun = await prisma.tahunAjaran.findFirst({ where: { is_active: true } });
    if (!activeTahun) {
      return res.status(400).json({ message: 'Tidak ada Tahun Ajaran aktif. Aktifkan terlebih dahulu di menu Master Akademik.' });
    }

    // Pre-check 1: apakah rombel untuk kelas ini sudah ada?
    const existingKelas = await prisma.rombel.findFirst({
      where: { master_kelas_id: masterKelasId, tahun_ajaran_id: activeTahun.id },
      include: { master_kelas: { select: { nama: true } } },
    });
    if (existingKelas) {
      return res.status(409).json({
        message: `Rombel untuk kelas "${existingKelas.master_kelas.nama}" sudah dibuat pada tahun ajaran ${activeTahun.kode}. Satu kelas hanya boleh memiliki satu rombel per tahun ajaran.`,
      });
    }

    // Pre-check 2: apakah ruangan sudah dipakai rombel lain di tahun ajaran yang sama?
    const existingRuangan = await prisma.rombel.findFirst({
      where: { ruang_kelas_id: ruangKelasId, tahun_ajaran_id: activeTahun.id },
      include: {
        master_kelas: { select: { nama: true } },
        ruang_kelas: { select: { kode: true } },
      },
    });
    if (existingRuangan) {
      return res.status(409).json({
        message: `Ruangan "${existingRuangan.ruang_kelas?.kode}" sudah digunakan oleh rombel kelas "${existingRuangan.master_kelas.nama}" pada tahun ajaran ${activeTahun.kode}. Pilih ruangan lain.`,
      });
    }

    const data = await prisma.rombel.create({
      data: {
        master_kelas_id: masterKelasId,
        tahun_ajaran_id: activeTahun.id,
        ruang_kelas_id: ruangKelasId,
      },
      include: {
        master_kelas: true,
        tahun_ajaran: true,
        ruang_kelas: true,
      },
    });

    return res.status(201).json({
      message: `Rombel untuk kelas "${data.master_kelas.nama}" berhasil ditambahkan pada tahun ajaran ${data.tahun_ajaran.kode}.`,
      data: {
        id: data.id,
        masterKelasName: data.master_kelas.nama,
        tahunAjaranCode: data.tahun_ajaran.kode,
        ruangKelasCode: data.ruang_kelas?.kode || '-',
      },
    });
  } catch (error) {
    return handlePrismaError(error, res, 'Create');
  }
};

const update = async (req, res) => {
  try {
    const { ruangKelasId } = req.body;

    // Get current rombel to find linked masterKelasId & tahun_ajaran_id
    const currentRombel = await prisma.rombel.findUnique({
      where: { id: req.params.id },
      select: { master_kelas_id: true, tahun_ajaran_id: true },
    });

    if (!currentRombel) {
      return res.status(404).json({ message: 'Rombel tidak ditemukan' });
    }

    // Pre-check: apakah ruangan baru sudah digunakan rombel LAIN di tahun ajaran yang sama?
    if (ruangKelasId) {
      const ruanganBentrok = await prisma.rombel.findFirst({
        where: {
          ruang_kelas_id: ruangKelasId,
          tahun_ajaran_id: currentRombel.tahun_ajaran_id,
          NOT: { id: req.params.id }, // kecualikan rombel saat ini
        },
        include: {
          master_kelas: { select: { nama: true } },
          ruang_kelas: { select: { kode: true } },
        },
      });
      if (ruanganBentrok) {
        return res.status(409).json({
          message: `Ruangan "${ruanganBentrok.ruang_kelas?.kode}" sudah digunakan oleh rombel kelas "${ruanganBentrok.master_kelas.nama}" di tahun ajaran yang sama. Pilih ruangan lain.`,
        });
      }
    }

    // Update rombel
    const data = await prisma.rombel.update({
      where: { id: req.params.id },
      data: {
        ...(ruangKelasId !== undefined && { ruang_kelas_id: ruangKelasId || null }),
      },
      include: {
        master_kelas: true,
        ruang_kelas: true,
      },
    });

    // Sync: also update the linked masterKelas's ruang_kelas_id
    if (ruangKelasId !== undefined && currentRombel.master_kelas_id) {
      await prisma.masterKelas.update({
        where: { id: currentRombel.master_kelas_id },
        data: { ruang_kelas_id: ruangKelasId || null },
      });
    }

    return res.status(200).json({
      message: `Rombel berhasil diperbarui. Ruangan: ${data.ruang_kelas?.kode || '-'}.`,
      data: {
        id: data.id,
        masterKelasName: data.master_kelas?.nama,
        ruangKelasCode: data.ruang_kelas?.kode || '-',
        ruangKelasCapacity: data.ruang_kelas?.kapasitas || 0,
      },
    });
  } catch (error) {
    return handlePrismaError(error, res, 'Update');
  }
};

const remove = async (req, res) => {
  try {
    await prisma.rombel.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Rombel berhasil dihapus' });
  } catch (error) {
    return handlePrismaError(error, res, 'Delete');
  }
};

/**
 * GET /api/rombel/:id/siswa
 * Get assigned students for a rombel
 */
const getSiswa = async (req, res) => {
  try {
    const data = await prisma.rombelSiswa.findMany({
      where: { rombel_id: req.params.id },
      include: {
        siswa: { select: { id: true, nama_lengkap: true, nomor_induk: true } },
      },
      orderBy: { siswa: { nama_lengkap: 'asc' } },
    });

    return res.status(200).json({
      message: 'Data siswa rombel berhasil diambil',
      data: data.map((d) => ({
        id: d.siswa.id,
        name: d.siswa.nama_lengkap,
        nisn: d.siswa.nomor_induk || '-',
      })),
    });
  } catch (error) {
    console.error('Rombel GetSiswa Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/rombel/:id/available-siswa
 * Get students NOT assigned to this rombel
 */
const getAvailableSiswa = async (req, res) => {
  try {
    // Get role ID for Siswa
    const siswaRole = await prisma.role.findUnique({ where: { nama_role: 'Siswa' } });
    if (!siswaRole) return res.status(200).json({ data: [] });

    // Get current rombel's tahun_ajaran_id
    const currentRombel = await prisma.rombel.findUnique({
      where: { id: req.params.id },
      select: { tahun_ajaran_id: true }
    });

    if (!currentRombel) {
      return res.status(404).json({ message: 'Rombel tidak ditemukan' });
    }

    // Get already assigned IDs in ANY rombel for this tahun_ajaran
    const assigned = await prisma.rombelSiswa.findMany({
      where: { 
        rombel: {
          tahun_ajaran_id: currentRombel.tahun_ajaran_id
        }
      },
      select: { siswa_id: true },
    });
    const assignedIds = assigned.map((a) => a.siswa_id);

    const students = await prisma.user.findMany({
      where: {
        role_id: siswaRole.id,
        status_aktif: true,
        id: { notIn: assignedIds },
      },
      select: { id: true, nama_lengkap: true, nomor_induk: true },
      orderBy: { nama_lengkap: 'asc' },
    });

    return res.status(200).json({
      message: 'Data siswa tersedia berhasil diambil',
      data: students.map((s) => ({
        id: s.id,
        name: s.nama_lengkap,
        nisn: s.nomor_induk || '-',
      })),
    });
  } catch (error) {
    console.error('Rombel AvailableSiswa Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/rombel/available-wali
 * Get Guru who are NOT yet wali kelas in the current active active tahun ajaran
 */
const getAvailableWali = async (req, res) => {
  try {
    const validRoles = await prisma.role.findMany({
      where: {
        nama_role: { in: ['Guru Mapel', 'Wali Kelas', 'Guru'] }
      }
    });
    const validRoleIds = validRoles.map(r => r.id);

    if (validRoleIds.length === 0) return res.status(200).json({ data: [] });

    const activeTahun = await prisma.tahunAjaran.findFirst({ where: { is_active: true } });
    if (!activeTahun) return res.status(200).json({ data: [] });

    const rombels = await prisma.rombel.findMany({
      where: { 
        tahun_ajaran_id: activeTahun.id,
        wali_kelas_id: { not: null }
      },
      select: { wali_kelas_id: true }
    });
    
    // Allow the current rombel's wali_kelas to be included if id is provided in query
    let assignedWaliIds = rombels.map(r => r.wali_kelas_id);
    if (req.query.currentRombelId) {
      const currentRombel = await prisma.rombel.findUnique({ where: { id: req.query.currentRombelId } });
      if (currentRombel && currentRombel.wali_kelas_id) {
        assignedWaliIds = assignedWaliIds.filter(id => id !== currentRombel.wali_kelas_id);
      }
    }

    const availableGurus = await prisma.user.findMany({
      where: {
        role_id: { in: validRoleIds },
        status_aktif: true,
        id: { notIn: assignedWaliIds }
      },
      select: { id: true, nama_lengkap: true }
    });

    return res.status(200).json({
      message: 'Data calon wali kelas berhasil diambil',
      data: availableGurus.map(g => ({ id: g.id, name: g.nama_lengkap })),
    });
  } catch (error) {
    console.error('Rombel getAvailableWali Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * POST /api/rombel/:id/siswa
 * Assign students to rombel
 * Body: { siswaIds: ["id1", "id2"] }
 */
const assignSiswa = async (req, res) => {
  try {
    const { siswaIds } = req.body;
    if (!siswaIds || !Array.isArray(siswaIds) || siswaIds.length === 0) {
      return res.status(400).json({ message: 'Daftar siswa wajib diisi' });
    }

    // Capacity check
    const rombel = await prisma.rombel.findUnique({
      where: { id: req.params.id },
      include: {
        ruang_kelas: true,
        _count: { select: { siswa: true } }
      }
    });

    if (!rombel) return res.status(404).json({ message: 'Rombel tidak ditemukan' });

    if (rombel.ruang_kelas) {
      const newTotal = rombel._count.siswa + siswaIds.length;
      if (newTotal > rombel.ruang_kelas.kapasitas) {
        return res.status(400).json({ 
          message: `Kapasitas Ruang ${rombel.ruang_kelas.kode} tidak mencukupi. Terisi ${rombel._count.siswa}, maks ${rombel.ruang_kelas.kapasitas}. (Anda memasukkan ${siswaIds.length} siswa)` 
        });
      }
    }

    const createData = siswaIds.map((siswaId) => ({
      rombel_id: req.params.id,
      siswa_id: siswaId,
    }));

    await prisma.rombelSiswa.createMany({
      data: createData,
      skipDuplicates: true,
    });

    return res.status(201).json({ message: `${siswaIds.length} siswa berhasil ditambahkan ke rombel` });
  } catch (error) {
    console.error('Rombel AssignSiswa Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * DELETE /api/rombel/:id/siswa/:siswaId
 * Remove student from rombel
 */
const removeSiswa = async (req, res) => {
  try {
    await prisma.rombelSiswa.deleteMany({
      where: {
        rombel_id: req.params.id,
        siswa_id: req.params.siswaId,
      },
    });
    return res.status(200).json({ message: 'Siswa berhasil dikeluarkan dari rombel' });
  } catch (error) {
    console.error('Rombel RemoveSiswa Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * DELETE /api/rombel/:id/siswa
 * Remove all students from rombel
 */
const removeAllSiswa = async (req, res) => {
  try {
    await prisma.rombelSiswa.deleteMany({ where: { rombel_id: req.params.id } });
    return res.status(200).json({ message: 'Semua siswa berhasil dikeluarkan dari rombel' });
  } catch (error) {
    console.error('Rombel RemoveAllSiswa Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, create, update, remove, getSiswa, getAvailableSiswa, assignSiswa, removeSiswa, removeAllSiswa, getAvailableWali };
