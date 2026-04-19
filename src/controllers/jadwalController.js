// src/controllers/jadwalController.js
// ═══════════════════════════════════════════════
// JADWAL PELAJARAN CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

/**
 * GET /api/jadwal
 * Get schedule, optionally filtered by class and academic year
 */
const getAll = async (req, res) => {
  try {
    const { kelasId, hari } = req.query;

    const where = {};
    if (kelasId) where.master_kelas_id = kelasId;
    if (hari) where.hari = hari;

    const data = await prisma.jadwalPelajaran.findMany({
      where,
      include: {
        master_kelas: { select: { id: true, nama: true } },
        mata_pelajaran: { select: { id: true, nama: true } },
        ruang_kelas: { select: { id: true, kode: true } },
      },
      orderBy: [{ hari: 'asc' }, { slot_index: 'asc' }],
    });

    const guruIds = data.map((d) => d.guru_id).filter(Boolean);
    const gurus = await prisma.user.findMany({
      where: { id: { in: guruIds } },
      select: { id: true, nama_lengkap: true },
    });
    const guruMap = {};
    gurus.forEach((g) => (guruMap[g.id] = g.nama_lengkap));

    return res.status(200).json({
      message: 'Data jadwal berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        day: d.hari,
        startTime: d.jam_mulai,
        endTime: d.jam_selesai,
        slotIndex: d.slot_index,
        subject: d.mata_pelajaran.nama,
        subjectId: d.mata_pelajaran_id,
        teacher: guruMap[d.guru_id] || '-',
        teacherId: d.guru_id,
        classId: d.master_kelas_id,
        className: d.master_kelas.nama,
        room: d.ruang_kelas?.kode || '-',
        roomId: d.ruang_kelas_id,
      })),
    });
  } catch (error) {
    console.error('Jadwal GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/jadwal/by-guru/:guruId
 * Get schedule for a specific teacher
 */
const getByGuru = async (req, res) => {
  try {
    const data = await prisma.jadwalPelajaran.findMany({
      where: { guru_id: req.params.guruId },
      include: {
        master_kelas: { select: { nama: true } },
        mata_pelajaran: { select: { nama: true } },
        ruang_kelas: { select: { kode: true } },
      },
      orderBy: [{ hari: 'asc' }, { slot_index: 'asc' }],
    });

    const guruIds = data.map((d) => d.guru_id).filter(Boolean);
    const gurus = await prisma.user.findMany({
      where: { id: { in: guruIds } },
      select: { id: true, nama_lengkap: true },
    });
    const guruMap = {};
    gurus.forEach((g) => (guruMap[g.id] = g.nama_lengkap));

    return res.status(200).json({
      message: 'Data jadwal guru berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        day: d.hari,
        startTime: d.jam_mulai,
        endTime: d.jam_selesai,
        subject: d.mata_pelajaran.nama,
        teacher: guruMap[d.guru_id] || '-',
        className: d.master_kelas.nama,
        room: d.ruang_kelas?.kode || '-',
      })),
    });
  } catch (error) {
    console.error('Jadwal GetByGuru Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const create = async (req, res) => {
  try {
    const { classId, subjectId, guruId, roomId, day, startTime, endTime, slotIndex } = req.body;

    if (!classId || !subjectId || !guruId || !day || !startTime || !endTime) {
      return res.status(400).json({ message: 'Data jadwal tidak lengkap' });
    }

    // Check for teacher conflict
    const conflict = await prisma.jadwalPelajaran.findFirst({
      where: {
        guru_id: guruId,
        hari: day,
        slot_index: slotIndex || 0,
      },
    });

    if (conflict) {
      return res.status(400).json({ message: 'Guru sudah dijadwalkan pada slot yang sama' });
    }

    const data = await prisma.jadwalPelajaran.create({
      data: {
        master_kelas_id: classId,
        mata_pelajaran_id: subjectId,
        guru_id: guruId,
        ruang_kelas_id: roomId || null,
        hari: day,
        jam_mulai: startTime,
        jam_selesai: endTime,
        slot_index: slotIndex || 0,
      },
      include: {
        mata_pelajaran: { select: { nama: true } },
        master_kelas: { select: { nama: true } },
      },
    });

    return res.status(201).json({
      message: 'Jadwal berhasil ditambahkan',
      data: {
        id: data.id,
        day: data.hari,
        startTime: data.jam_mulai,
        endTime: data.jam_selesai,
        subject: data.mata_pelajaran.nama,
        className: data.master_kelas.nama,
      },
    });
  } catch (error) {
    console.error('Jadwal Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const update = async (req, res) => {
  try {
    const { classId, subjectId, guruId, roomId, day, startTime, endTime, slotIndex } = req.body;

    const data = await prisma.jadwalPelajaran.update({
      where: { id: req.params.id },
      data: {
        ...(classId && { master_kelas_id: classId }),
        ...(subjectId && { mata_pelajaran_id: subjectId }),
        ...(guruId && { guru_id: guruId }),
        ...(roomId !== undefined && { ruang_kelas_id: roomId || null }),
        ...(day && { hari: day }),
        ...(startTime && { jam_mulai: startTime }),
        ...(endTime && { jam_selesai: endTime }),
        ...(slotIndex !== undefined && { slot_index: slotIndex }),
      },
    });
    return res.status(200).json({ message: 'Jadwal berhasil diperbarui', data });
  } catch (error) {
    console.error('Jadwal Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * PATCH /api/jadwal/:id/move
 * Move a schedule entry (drag & drop)
 */
const move = async (req, res) => {
  try {
    const { targetDay, targetSlotIndex } = req.body;

    const existing = await prisma.jadwalPelajaran.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Jadwal tidak ditemukan' });

    // Check conflict at target
    const conflict = await prisma.jadwalPelajaran.findFirst({
      where: {
        master_kelas_id: existing.master_kelas_id,
        hari: targetDay,
        slot_index: targetSlotIndex,
        id: { not: req.params.id },
      },
    });

    if (conflict) {
      return res.status(400).json({ message: 'Slot tujuan sudah terisi' });
    }

    const data = await prisma.jadwalPelajaran.update({
      where: { id: req.params.id },
      data: { hari: targetDay, slot_index: targetSlotIndex },
    });

    return res.status(200).json({ message: 'Jadwal berhasil dipindahkan', data });
  } catch (error) {
    console.error('Jadwal Move Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.jadwalPelajaran.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Jadwal berhasil dihapus' });
  } catch (error) {
    console.error('Jadwal Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, getByGuru, create, update, move, remove };
