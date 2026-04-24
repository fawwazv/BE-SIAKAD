// src/controllers/rombelController.js
// ═══════════════════════════════════════════════
// ROMBEL (Rombongan Belajar) CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

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
    const { masterKelasId, ruangKelasId, waliKelasId } = req.body;
    if (!masterKelasId || !ruangKelasId) {
      return res.status(400).json({ message: 'Kelas dan ruangan wajib diisi' });
    }

    const activeTahun = await prisma.tahunAjaran.findFirst({ where: { is_active: true } });
    if (!activeTahun) {
      return res.status(400).json({ message: 'Tidak ada Tahun Ajaran aktif ditemukan' });
    }

    const data = await prisma.rombel.create({
      data: {
        master_kelas_id: masterKelasId,
        tahun_ajaran_id: activeTahun.id,
        ruang_kelas_id: ruangKelasId,
        wali_kelas_id: waliKelasId || null,
      },
      include: {
        master_kelas: true,
        tahun_ajaran: true,
        ruang_kelas: true,
        wali_kelas: { select: { nama_lengkap: true } },
      },
    });

    return res.status(201).json({
      message: 'Rombel berhasil ditambahkan',
      data: {
        id: data.id,
        masterKelasName: data.master_kelas.nama,
        tahunAjaranCode: data.tahun_ajaran.kode,
        waliKelasName: data.wali_kelas?.nama_lengkap || '-',
      },
    });
  } catch (error) {
    console.error('Rombel Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const update = async (req, res) => {
  try {
    const { waliKelasId, ruangKelasId } = req.body;
    const data = await prisma.rombel.update({
      where: { id: req.params.id },
      data: {
        ...(waliKelasId !== undefined && { wali_kelas_id: waliKelasId || null }),
        ...(ruangKelasId !== undefined && { ruang_kelas_id: ruangKelasId || null }),
      },
    });
    return res.status(200).json({ message: 'Rombel berhasil diperbarui', data });
  } catch (error) {
    console.error('Rombel Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.rombel.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Rombel berhasil dihapus' });
  } catch (error) {
    console.error('Rombel Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
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
