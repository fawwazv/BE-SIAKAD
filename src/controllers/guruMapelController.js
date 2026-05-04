// src/controllers/guruMapelController.js
// ═══════════════════════════════════════════════
// GURU-MAPEL MAPPING CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

const parseClasses = (classes = '') =>
  `${classes}`
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeClasses = (classes = '') => [...new Set(parseClasses(classes))].join(', ');

const getMasterKelasIdsByNames = async (classes) => {
  const classNames = parseClasses(classes);
  if (classNames.length === 0) return [];

  const rows = await prisma.masterKelas.findMany({
    where: { nama: { in: classNames } },
    select: { id: true },
  });

  return rows.map((row) => row.id);
};

const syncSchedulesForMapping = async ({ teacherId, subjectId, classes }) => {
  if (!teacherId || !subjectId) return { count: 0 };

  const masterKelasIds = await getMasterKelasIdsByNames(classes);
  if (masterKelasIds.length === 0) return { count: 0 };

  return prisma.jadwalPelajaran.updateMany({
    where: {
      mata_pelajaran_id: subjectId,
      master_kelas_id: { in: masterKelasIds },
    },
    data: { guru_id: teacherId },
  });
};

const findClassSubjectConflicts = async ({ subjectId, classes, excludeId = null }) => {
  const selectedClasses = parseClasses(classes);
  if (!subjectId || selectedClasses.length === 0) return [];

  const existingMappings = await prisma.guruMapel.findMany({
    where: {
      mata_pelajaran_id: subjectId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: {
      guru: { select: { nama_lengkap: true } },
      mata_pelajaran: { select: { nama: true } },
    },
  });

  const conflicts = [];
  for (const mapping of existingMappings) {
    const existingClasses = parseClasses(mapping.kelas_diampu);
    const overlap = selectedClasses.filter((className) => existingClasses.includes(className));
    overlap.forEach((className) => {
      conflicts.push({
        className,
        subject: mapping.mata_pelajaran?.nama || 'Mata Pelajaran',
        teacher: mapping.guru?.nama_lengkap || 'Guru lain',
      });
    });
  }

  return conflicts;
};

const sendConflictResponse = (res, conflicts) => {
  const conflictText = conflicts
    .map((item) => `${item.className} - ${item.subject} sudah dipetakan ke ${item.teacher}`)
    .join('; ');

  return res.status(409).json({
    message: `Pemetaan duplikat tidak diizinkan. ${conflictText}`,
    errorCode: 'DUPLICATE_CLASS_SUBJECT_MAPPING',
    conflicts,
  });
};

const getAll = async (req, res) => {
  try {
    const { search = '' } = req.query;

    const where = search
      ? {
          OR: [
            { guru: { nama_lengkap: { contains: search, mode: 'insensitive' } } },
            { mata_pelajaran: { nama: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const data = await prisma.guruMapel.findMany({
      where,
      include: {
        guru: { select: { id: true, nama_lengkap: true } },
        mata_pelajaran: { select: { id: true, nama: true } },
      },
      orderBy: { guru: { nama_lengkap: 'asc' } },
    });

    // Get active tahun ajaran to find relevant master_kelas IDs
    const activeTahun = await prisma.tahunAjaran.findFirst({ where: { is_active: true } });

    // Get master_kelas IDs that have a rombel in the active tahun ajaran
    let activeMasterKelasIds = null;
    if (activeTahun) {
      const activeRombels = await prisma.rombel.findMany({
        where: { tahun_ajaran_id: activeTahun.id },
        select: { master_kelas_id: true },
      });
      activeMasterKelasIds = activeRombels.map((r) => r.master_kelas_id);
    }

    // Count scheduled slots per guru (filtered by active year via master_kelas)
    const jadwalCounts = await prisma.jadwalPelajaran.groupBy({
      by: ['guru_id'],
      where: activeMasterKelasIds
        ? { master_kelas_id: { in: activeMasterKelasIds } }
        : {},
      _count: { id: true },
    });
    const countMap = {};
    jadwalCounts.forEach((j) => (countMap[j.guru_id] = j._count.id));

    return res.status(200).json({
      message: 'Data pemetaan guru-mapel berhasil diambil',
      data: data.map((d) => ({
        id: d.id,
        teacher: d.guru.nama_lengkap,
        teacherId: d.guru_id,
        subject: d.mata_pelajaran.nama,
        subjectId: d.mata_pelajaran_id,
        classes: d.kelas_diampu || '-',   // selalu dari field manual (kelas_diampu)
        hoursPerWeek: d.jam_per_minggu,
        scheduled: countMap[d.guru_id] || 0, // dihitung dari jadwal aktif
      })),
    });
  } catch (error) {
    console.error('GuruMapel GetAll Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const create = async (req, res) => {
  try {
    const { teacherId, subjectId, classes, hoursPerWeek } = req.body;
    if (!teacherId || !subjectId) {
      return res.status(400).json({ message: 'Guru dan mata pelajaran wajib diisi' });
    }
    const normalizedClasses = normalizeClasses(classes);
    if (!normalizedClasses) {
      return res.status(400).json({ message: 'Minimal satu kelas yang diampu wajib dipilih' });
    }

    const conflicts = await findClassSubjectConflicts({
      subjectId,
      classes: normalizedClasses,
    });
    if (conflicts.length > 0) return sendConflictResponse(res, conflicts);

    const data = await prisma.guruMapel.create({
      data: {
        guru_id: teacherId,
        mata_pelajaran_id: subjectId,
        kelas_diampu: normalizedClasses,
        jam_per_minggu: parseInt(hoursPerWeek) || 0,
      },
      include: {
        guru: { select: { nama_lengkap: true } },
        mata_pelajaran: { select: { nama: true } },
      },
    });
    const syncedSchedules = await syncSchedulesForMapping({
      teacherId,
      subjectId,
      classes: normalizedClasses,
    });

    return res.status(201).json({
      message: 'Pemetaan guru-mapel berhasil ditambahkan',
      data: {
        id: data.id,
        teacher: data.guru.nama_lengkap,
        subject: data.mata_pelajaran.nama,
        classes: data.kelas_diampu,
        hoursPerWeek: data.jam_per_minggu,
        syncedSchedules: syncedSchedules.count,
      },
    });
  } catch (error) {
    console.error('GuruMapel Create Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const update = async (req, res) => {
  try {
    const { teacherId, subjectId, classes, hoursPerWeek } = req.body;
    const existing = await prisma.guruMapel.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: 'Pemetaan guru-mapel tidak ditemukan' });
    }

    const nextSubjectId = subjectId || existing.mata_pelajaran_id;
    const nextTeacherId = teacherId || existing.guru_id;
    const nextClasses = classes !== undefined
      ? normalizeClasses(classes)
      : normalizeClasses(existing.kelas_diampu);
    if (!nextClasses) {
      return res.status(400).json({ message: 'Minimal satu kelas yang diampu wajib dipilih' });
    }

    const conflicts = await findClassSubjectConflicts({
      subjectId: nextSubjectId,
      classes: nextClasses,
      excludeId: req.params.id,
    });
    if (conflicts.length > 0) return sendConflictResponse(res, conflicts);

    const data = await prisma.guruMapel.update({
      where: { id: req.params.id },
      data: {
        guru_id: nextTeacherId,
        mata_pelajaran_id: nextSubjectId,
        kelas_diampu: nextClasses,
        ...(hoursPerWeek !== undefined && { jam_per_minggu: parseInt(hoursPerWeek) }),
      },
      include: {
        guru: { select: { nama_lengkap: true } },
        mata_pelajaran: { select: { nama: true } },
      },
    });
    const syncedSchedules = await syncSchedulesForMapping({
      teacherId: nextTeacherId,
      subjectId: nextSubjectId,
      classes: nextClasses,
    });
    return res.status(200).json({
      message: 'Pemetaan guru-mapel berhasil diperbarui',
      data: {
        id: data.id,
        teacher: data.guru.nama_lengkap,
        subject: data.mata_pelajaran.nama,
        classes: data.kelas_diampu,
        hoursPerWeek: data.jam_per_minggu,
        syncedSchedules: syncedSchedules.count,
      },
    });
  } catch (error) {
    console.error('GuruMapel Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.guruMapel.delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Pemetaan guru-mapel berhasil dihapus' });
  } catch (error) {
    console.error('GuruMapel Delete Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getAll, create, update, remove };
