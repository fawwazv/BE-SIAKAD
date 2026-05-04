// src/controllers/jadwalController.js
// ═══════════════════════════════════════════════
// JADWAL PELAJARAN CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const parseClasses = (classes = '') =>
  `${classes}`
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const getMappedTeacher = (mappings, schedule) =>
  mappings.find(
    (mapping) =>
      mapping.mata_pelajaran_id === schedule.mata_pelajaran_id &&
      parseClasses(mapping.kelas_diampu).includes(schedule.master_kelas.nama)
  );

const getActiveSemester = () =>
  prisma.semester.findFirst({
    where: { is_active: true },
    select: { id: true, tahun_ajaran_id: true },
  });

const getStudentClassId = async (studentId) => {
  const activeSemester = await getActiveSemester();

  const rombelSiswa = await prisma.rombelSiswa.findFirst({
    where: {
      siswa_id: studentId,
      ...(activeSemester?.tahun_ajaran_id
        ? { rombel: { tahun_ajaran_id: activeSemester.tahun_ajaran_id } }
        : {}),
    },
    include: { rombel: { select: { master_kelas_id: true } } },
  });

  return rombelSiswa?.rombel?.master_kelas_id || null;
};

/**
 * GET /api/jadwal
 * Get schedule, optionally filtered by class and academic year
 */
const getAll = async (req, res) => {
  try {
    const { kelasId, hari } = req.query;

    const where = {};

    if (req.user?.securityRole === 'SISWA') {
      const studentClassId = await getStudentClassId(req.user.userId);
      if (!studentClassId) {
        return res.status(200).json({
          message: 'Data jadwal berhasil diambil',
          data: [],
        });
      }
      where.master_kelas_id = studentClassId;
    } else if (kelasId) {
      where.master_kelas_id = kelasId;
    }

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

    const mappings = await prisma.guruMapel.findMany({
      include: { guru: { select: { id: true, nama_lengkap: true } } },
    });

    return res.status(200).json({
      message: 'Data jadwal berhasil diambil',
      data: data.map((d) => {
        const mappedTeacher = getMappedTeacher(mappings, d);
        return {
          id: d.id,
          day: d.hari,
          startTime: d.jam_mulai,
          endTime: d.jam_selesai,
          slotIndex: d.slot_index,
          subject: d.mata_pelajaran.nama,
          subjectId: d.mata_pelajaran_id,
          teacher: mappedTeacher?.guru?.nama_lengkap || guruMap[d.guru_id] || '-',
          teacherId: mappedTeacher?.guru_id || d.guru_id,
          classId: d.master_kelas_id,
          className: d.master_kelas.nama,
          room: d.ruang_kelas?.kode || '-',
          roomId: d.ruang_kelas_id,
        };
      }),
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

const timeToMins = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h * 60) + (m || 0);
};

const checkTimeConflict = (schedules, newStart, newEnd, skipId = null) => {
  for (const ex of schedules) {
    if (skipId && ex.id === skipId) continue;
    const exStart = timeToMins(ex.jam_mulai);
    const exEnd = timeToMins(ex.jam_selesai);
    if (newStart < exEnd && newEnd > exStart) {
      return ex;
    }
  }
  return null;
};

const create = async (req, res) => {
  try {
    const { classId, subjectId, guruId, roomId, day, startTime, endTime } = req.body;

    if (!classId || !subjectId || !guruId || !day || !startTime || !endTime) {
      return res.status(400).json({ message: 'Data jadwal tidak lengkap' });
    }

    const startMins = timeToMins(startTime);
    const endMins = timeToMins(endTime);

    // Get all schedules for the class on that day
    const classSchedules = await prisma.jadwalPelajaran.findMany({
      where: { master_kelas_id: classId, hari: day },
      include: { mata_pelajaran: { select: { nama: true } } },
    });

    // Check Class Conflict
    const classConflict = checkTimeConflict(classSchedules, startMins, endMins);
    if (classConflict) {
      return res.status(400).json({ 
        message: `Jadwal bentrok! Kelas ini sudah ada pelajaran ${classConflict.mata_pelajaran?.nama} pada jam ${classConflict.jam_mulai} - ${classConflict.jam_selesai}.`
      });
    }

    // Get all schedules for the teacher on that day
    const guruSchedules = await prisma.jadwalPelajaran.findMany({
      where: { guru_id: guruId, hari: day },
      include: { 
        master_kelas: { select: { nama: true } },
        mata_pelajaran: { select: { nama: true } }
      },
    });

    // Check Guru Conflict
    const guruConflict = checkTimeConflict(guruSchedules, startMins, endMins);
    if (guruConflict) {
      return res.status(400).json({ 
        message: `Jadwal bentrok! Guru ini sudah mengajar ${guruConflict.mata_pelajaran?.nama} di kelas ${guruConflict.master_kelas?.nama} pada jam ${guruConflict.jam_mulai} - ${guruConflict.jam_selesai}.`
      });
    }

    // Assign dynamic slot_index to bypass unique constraint
    const maxSlot = classSchedules.reduce((max, s) => Math.max(max, s.slot_index), -1);
    const nextSlotIndex = maxSlot + 1;

    const data = await prisma.jadwalPelajaran.create({
      data: {
        master_kelas_id: classId,
        mata_pelajaran_id: subjectId,
        guru_id: guruId,
        ruang_kelas_id: roomId || null,
        hari: day,
        jam_mulai: startTime,
        jam_selesai: endTime,
        slot_index: nextSlotIndex,
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
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Gagal membuat jadwal karena terjadi duplikasi sistem.' });
    }
    return res.status(500).json({ message: 'Terjadi kesalahan pada server saat menambahkan jadwal. Silakan coba lagi atau hubungi administrator.' });
  }
};

const update = async (req, res) => {
  try {
    const { classId, subjectId, guruId, roomId, day, startTime, endTime } = req.body;

    const existing = await prisma.jadwalPelajaran.findUnique({
      where: { id: req.params.id },
      include: { master_kelas: { select: { nama: true } } },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Jadwal tidak ditemukan. Data mungkin sudah dihapus.' });
    }

    const finalClassId = classId || existing.master_kelas_id;
    const finalDay = day || existing.hari;
    const finalStartTime = startTime || existing.jam_mulai;
    const finalEndTime = endTime || existing.jam_selesai;
    const finalGuruId = guruId || existing.guru_id;

    const startMins = timeToMins(finalStartTime);
    const endMins = timeToMins(finalEndTime);

    const classSchedules = await prisma.jadwalPelajaran.findMany({
      where: { master_kelas_id: finalClassId, hari: finalDay },
      include: { mata_pelajaran: { select: { nama: true } } },
    });

    const classConflict = checkTimeConflict(classSchedules, startMins, endMins, req.params.id);
    if (classConflict) {
      return res.status(400).json({ 
        message: `Jadwal bentrok! Kelas ini sudah ada pelajaran ${classConflict.mata_pelajaran?.nama} pada jam ${classConflict.jam_mulai} - ${classConflict.jam_selesai}.`
      });
    }

    const guruSchedules = await prisma.jadwalPelajaran.findMany({
      where: { guru_id: finalGuruId, hari: finalDay },
      include: { 
        master_kelas: { select: { nama: true } },
        mata_pelajaran: { select: { nama: true } }
      },
    });

    const guruConflict = checkTimeConflict(guruSchedules, startMins, endMins, req.params.id);
    if (guruConflict) {
      return res.status(400).json({ 
        message: `Jadwal bentrok! Guru ini sudah mengajar ${guruConflict.mata_pelajaran?.nama} di kelas ${guruConflict.master_kelas?.nama} pada jam ${guruConflict.jam_mulai} - ${guruConflict.jam_selesai}.`
      });
    }

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
      },
    });
    return res.status(200).json({ message: 'Jadwal berhasil diperbarui', data });
  } catch (error) {
    console.error('Jadwal Update Error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'Jadwal tidak dapat disimpan karena duplikasi sistem.' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Data jadwal yang ingin diperbarui tidak ditemukan. Mungkin sudah dihapus.' });
    }
    return res.status(500).json({ message: 'Terjadi kesalahan pada server saat memperbarui jadwal. Silakan coba lagi atau hubungi administrator.' });
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
    if (error.code === 'P2002') {
      const fields = error.meta?.target?.join(', ') || '';
      return res.status(400).json({
        message: `Jadwal tidak dapat dipindahkan karena terjadi duplikasi data pada (${fields}). Slot tujuan mungkin sudah terisi.`,
      });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Data jadwal yang ingin dipindahkan tidak ditemukan. Mungkin sudah dihapus.' });
    }
    return res.status(500).json({ message: 'Terjadi kesalahan pada server saat memindahkan jadwal. Silakan coba lagi atau hubungi administrator.' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.jadwalPelajaran.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Jadwal berhasil dihapus' });
  } catch (error) {
    console.error('Jadwal Delete Error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Data jadwal yang ingin dihapus tidak ditemukan. Mungkin sudah dihapus sebelumnya.' });
    }
    return res.status(500).json({ message: 'Terjadi kesalahan pada server saat menghapus jadwal. Silakan coba lagi atau hubungi administrator.' });
  }
};

module.exports = { getAll, getByGuru, create, update, move, remove };
