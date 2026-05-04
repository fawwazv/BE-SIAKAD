// src/controllers/raporController.js
// ═══════════════════════════════════════════════
// E-RAPOR PDF GENERATION CONTROLLER (FR-05.3)
// Compiles grades + attendance + catatan into PDF
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const PDFDocument = require('pdfkit');
const { canBypassWaliOwnership, findOwnedRombel } = require('../middlewares/ownershipMiddleware');

const SCHOOL = {
  province: 'PEMERINTAH PROVINSI JAWA BARAT',
  office: 'DINAS PENDIDIKAN',
  name: 'SMA NEGERI 1 CIKALONG',
  address: 'Jalan Raya Cikalong KM 06, Desa Singkir, Kecamatan Cikalong, Kabupaten Tasikmalaya, Provinsi Jawa Barat, Kode Pos 46195',
  phone: '',
};

const formatDateId = (date = new Date()) =>
  date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

const safeFilename = (value) => String(value || 'dokumen').replace(/[^\w.-]+/g, '_');

const semesterOrderValue = (semester) => {
  const yearCode = semester?.tahun_ajaran?.kode || '';
  const startYear = parseInt(yearCode.split('/')[0], 10) || 0;
  const term = (semester?.nama || '').toLowerCase().includes('genap') ? 2 : 1;
  return startYear * 10 + term;
};

const averageNilai = (items) => {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + (Number(item.nilai_akhir) || 0), 0) / items.length;
};

const getRequiredMapelIds = async (masterKelasId) => {
  if (!masterKelasId) return [];

  const schedules = await prisma.jadwalPelajaran.findMany({
    where: { master_kelas_id: masterKelasId },
    select: { mata_pelajaran_id: true },
    distinct: ['mata_pelajaran_id'],
  });

  return schedules.map((schedule) => schedule.mata_pelajaran_id).filter(Boolean);
};

const getRequiredMapelCount = async (masterKelasId) => {
  const requiredMapelIds = await getRequiredMapelIds(masterKelasId);
  if (requiredMapelIds.length > 0) {
    return { totalMapel: requiredMapelIds.length, requiredMapelIds };
  }

  return {
    totalMapel: await prisma.mataPelajaran.count(),
    requiredMapelIds: [],
  };
};

const gradeLetter = (nilai) => {
  if (nilai >= 90) return 'A';
  if (nilai >= 85) return 'A-';
  if (nilai >= 80) return 'B+';
  if (nilai >= 75) return 'B';
  if (nilai >= 70) return 'B-';
  if (nilai >= 65) return 'C+';
  if (nilai >= 60) return 'C';
  if (nilai >= 55) return 'C-';
  return 'D';
};

const drawSchoolHeader = (doc, title) => {
  doc.font('Helvetica-Bold').fontSize(10).text(SCHOOL.province, { align: 'center' });
  doc.fontSize(10).text(SCHOOL.office, { align: 'center' });
  doc.fontSize(14).text(SCHOOL.name, { align: 'center' });
  const contactLine = SCHOOL.phone ? `${SCHOOL.address} | ${SCHOOL.phone}` : SCHOOL.address;
  doc.font('Helvetica').fontSize(8).text(contactLine, 65, doc.y, { width: 465, align: 'center' });
  doc.moveDown(0.4);
  doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(1.2).stroke();
  doc.moveTo(45, doc.y + 2).lineTo(550, doc.y + 2).lineWidth(0.4).stroke();
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(12).text(title, { align: 'center' });
  doc.moveDown(1);
};

const resetCursor = (doc, y = doc.y) => {
  doc.x = 45;
  doc.y = y;
};

const drawFullWidthText = (doc, text, options = {}) => {
  const { y = doc.y, align = 'left', ...rest } = options;
  doc.text(text, 45, y, {
    width: 505,
    align,
    ...rest,
  });
};

const drawSectionTitle = (doc, title) => {
  resetCursor(doc);
  doc.font('Helvetica-Bold').fontSize(10);
  drawFullWidthText(doc, title);
};

const drawInfoRows = (doc, rows, leftX = 50, rightX = 315) => {
  doc.fontSize(9).font('Helvetica');
  for (let i = 0; i < rows.length; i += 2) {
    const y = doc.y;
    const left = rows[i];
    const right = rows[i + 1];
    doc.font('Helvetica-Bold').text(left[0], leftX, y, { width: 85 });
    doc.font('Helvetica').text(`: ${left[1] || '-'}`, leftX + 88, y, { width: 170 });
    if (right) {
      doc.font('Helvetica-Bold').text(right[0], rightX, y, { width: 85 });
      doc.font('Helvetica').text(`: ${right[1] || '-'}`, rightX + 88, y, { width: 150 });
    }
    doc.moveDown(0.55);
  }
};

const ensureSpace = (doc, needed = 90) => {
  if (doc.y + needed > doc.page.height - 45) {
    doc.addPage();
  }
};

const drawTableHeader = (doc, columns, y) => {
  doc.rect(45, y, 505, 18).fill('#E5E7EB');
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(7.5);
  columns.forEach((col) => {
    doc.text(col.label, col.x, y + 5, { width: col.width, align: col.align || 'left' });
  });
  doc.fillColor('#000000');
  doc.y = y + 20;
  return doc.y;
};

const drawSignatureSlots = (doc, slots) => {
  ensureSpace(doc, 110);
  const startY = doc.y;
  const slotWidth = 150;
  const gap = (505 - (slotWidth * slots.length)) / Math.max(slots.length - 1, 1);

  slots.forEach((slot, index) => {
    const x = 45 + index * (slotWidth + gap);
    doc.font('Helvetica').fontSize(9).text(slot.placeDate || '', x, startY, { width: slotWidth, align: 'center' });
    doc.text(slot.role, x, startY + 14, { width: slotWidth, align: 'center' });
    doc.text(slot.name || '( ____________________ )', x, startY + 75, { width: slotWidth, align: 'center' });
    if (slot.nip) doc.text(`NIP. ${slot.nip}`, x, startY + 88, { width: slotWidth, align: 'center' });
  });
};

const getStudentContext = async (siswaId, semester) => {
  const siswa = await prisma.user.findUnique({
    where: { id: siswaId },
    include: { profile: true, role: true },
  });

  if (!siswa) return { siswa: null, rombelSiswa: null };

  const rombelSiswa = await prisma.rombelSiswa.findFirst({
    where: {
      siswa_id: siswaId,
      ...(semester?.tahun_ajaran_id ? { rombel: { tahun_ajaran_id: semester.tahun_ajaran_id } } : {}),
    },
    include: {
      rombel: {
        include: {
          master_kelas: true,
          wali_kelas: { select: { nama_lengkap: true, nomor_induk: true } },
        },
      },
    },
  });

  return { siswa, rombelSiswa };
};

const ensureCanAccessRapor = async (req, siswaId, semester, rombelSiswa) => {
  const role = req.user.role;
  const userId = req.user.userId;

  if (canBypassWaliOwnership(role)) return true;
  if (role === 'Siswa') return siswaId === userId;
  if (!['Wali Kelas', 'Guru Mapel'].includes(role)) return false;
  if (!rombelSiswa?.rombel?.id) return false;

  const ownedRombel = await findOwnedRombel({
    userId,
    role,
    rombelId: rombelSiswa.rombel.id,
    tahunAjaranId: semester?.tahun_ajaran_id,
  });

  return Boolean(ownedRombel);
};

const loadRaporData = async (siswaId, semesterId) => {
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    include: { tahun_ajaran: true },
  });
  if (!semester) return { notFound: 'Semester tidak ditemukan' };

  const { siswa, rombelSiswa } = await getStudentContext(siswaId, semester);
  if (!siswa) return { notFound: 'Siswa tidak ditemukan' };

  const [nilaiList, kehadiranAll, catatan] = await Promise.all([
    prisma.nilai.findMany({
      where: { siswa_id: siswaId, semester_id: semesterId },
      include: { mata_pelajaran: true },
      orderBy: { mata_pelajaran: { nama: 'asc' } },
    }),
    prisma.kehadiran.findMany({ where: { siswa_id: siswaId, semester_id: semesterId } }),
    prisma.catatanAkademik.findUnique({
      where: { siswa_id_semester_id: { siswa_id: siswaId, semester_id: semesterId } },
      include: { wali_kelas: { select: { nama_lengkap: true, nomor_induk: true } } },
    }),
  ]);

  return { siswa, semester, rombelSiswa, nilaiList, kehadiranAll, catatan };
};

const drawRaporContent = (doc, payload) => {
  const { siswa, semester, rombelSiswa, nilaiList, kehadiranAll, catatan } = payload;

  drawSchoolHeader(doc, 'LAPORAN HASIL BELAJAR PESERTA DIDIK');
  drawInfoRows(doc, [
    ['Nama Peserta Didik', siswa.nama_lengkap],
    ['NIS/NISN', siswa.nomor_induk || '-'],
    ['Kelas', rombelSiswa?.rombel?.master_kelas?.nama || '-'],
    ['Semester', semester.nama],
    ['Tahun Pelajaran', semester.tahun_ajaran?.kode || '-'],
    ['Wali Kelas', rombelSiswa?.rombel?.wali_kelas?.nama_lengkap || '-'],
  ]);

  doc.moveDown(0.6);
  drawSectionTitle(doc, 'A. RINCIAN NILAI MATA PELAJARAN');
  doc.moveDown(0.3);

  const columns = [
    { label: 'No', x: 48, width: 22, align: 'center' },
    { label: 'Mata Pelajaran', x: 75, width: 135 },
    { label: 'Tugas', x: 215, width: 34, align: 'center' },
    { label: 'UH', x: 252, width: 30, align: 'center' },
    { label: 'UTS', x: 285, width: 32, align: 'center' },
    { label: 'UAS', x: 320, width: 32, align: 'center' },
    { label: 'Aktif', x: 355, width: 36, align: 'center' },
    { label: 'Hadir', x: 394, width: 36, align: 'center' },
    { label: 'Akhir', x: 435, width: 38, align: 'center' },
    { label: 'Pred.', x: 478, width: 34, align: 'center' },
    { label: 'Ket.', x: 515, width: 32, align: 'center' },
  ];

  let y = drawTableHeader(doc, columns, doc.y);
  doc.font('Helvetica').fontSize(7.5);
  nilaiList.forEach((nilai, index) => {
    ensureSpace(doc, 32);
    if (doc.y !== y && doc.y < y) y = doc.y;
    y = doc.y;
    const rowHeight = 24;
    if (index % 2 === 0) doc.rect(45, y - 2, 505, rowHeight).fill('#F9FAFB').fillColor('#000000');
    const lulus = nilai.nilai_akhir >= nilai.mata_pelajaran.kkm;
    const values = [
      index + 1,
      nilai.mata_pelajaran.nama,
      Math.round(nilai.nilai_tugas),
      Math.round(nilai.nilai_uh),
      Math.round(nilai.nilai_uts),
      Math.round(nilai.nilai_uas),
      Math.round(nilai.nilai_keaktifan),
      Math.round(nilai.nilai_kehadiran),
      Math.round(nilai.nilai_akhir),
      gradeLetter(nilai.nilai_akhir),
      lulus ? 'T' : 'BT',
    ];
    columns.forEach((col, colIndex) => {
      doc.text(String(values[colIndex]), col.x, y + 4, { width: col.width, align: col.align || 'left' });
    });
    doc.y = y + rowHeight;
  });

  if (!nilaiList.length) {
    resetCursor(doc, doc.y + 4);
    doc.font('Helvetica').fontSize(9);
    drawFullWidthText(doc, 'Belum ada data nilai.');
    doc.moveDown();
  }

  const avg = averageNilai(nilaiList);
  resetCursor(doc, doc.y + 8);
  doc.font('Helvetica-Bold').fontSize(9);
  drawFullWidthText(doc, `Rata-rata nilai semester: ${avg.toFixed(2)}`, { align: 'right' });

  doc.moveDown(1);
  ensureSpace(doc, 90);
  const hadir = kehadiranAll.filter((k) => k.status === 'HADIR').length;
  const sakit = kehadiranAll.filter((k) => k.status === 'SAKIT').length;
  const izin = kehadiranAll.filter((k) => k.status === 'IZIN').length;
  const alpa = kehadiranAll.filter((k) => k.status === 'ALPA').length;
  drawSectionTitle(doc, 'B. KEHADIRAN');
  doc.font('Helvetica').fontSize(9);
  drawFullWidthText(doc, `Hadir: ${hadir}    Sakit: ${sakit}    Izin: ${izin}    Alpa: ${alpa}`);
  doc.moveDown(0.8);

  drawSectionTitle(doc, 'C. CATATAN WALI KELAS');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(9);
  drawFullWidthText(doc, catatan?.catatan || 'Tidak ada catatan.', { align: 'justify' });
  doc.moveDown(2);

  drawSignatureSlots(doc, [
    { role: 'Orang Tua/Wali', name: '( ____________________ )' },
    {
      placeDate: `Cikalong, ${formatDateId()}`,
      role: 'Wali Kelas',
      name: rombelSiswa?.rombel?.wali_kelas?.nama_lengkap || catatan?.wali_kelas?.nama_lengkap || '( ____________________ )',
      nip: rombelSiswa?.rombel?.wali_kelas?.nomor_induk || catatan?.wali_kelas?.nomor_induk || null,
    },
  ]);
};

/**
 * GET /api/rapor/:siswaId/:semesterId
 * Generate e-Rapor PDF for a student in a specific semester.
 */
const generateRapor = async (req, res) => {
  try {
    const { siswaId, semesterId } = req.params;

    const payload = await loadRaporData(siswaId, semesterId);
    if (payload.notFound) return res.status(404).json({ message: payload.notFound });

    const allowed = await ensureCanAccessRapor(req, siswaId, payload.semester, payload.rombelSiswa);
    if (!allowed) return res.status(403).json({ message: 'Anda tidak memiliki akses ke rapor siswa ini' });

    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rapor_${safeFilename(payload.siswa.nama_lengkap)}_${safeFilename(payload.semester.nama)}.pdf`);
    doc.pipe(res);
    drawRaporContent(doc, payload);
    doc.end();
  } catch (error) {
    console.error('Generate Rapor Error:', error);
    if (!res.headersSent) return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/rapor/transkrip/:siswaId
 * Generate transcript PDF for all semesters completed by a student.
 */
const generateTranskrip = async (req, res) => {
  try {
    const { siswaId } = req.params;
    const nilaiList = await prisma.nilai.findMany({
      where: { siswa_id: siswaId },
      include: {
        mata_pelajaran: true,
        semester: { include: { tahun_ajaran: true } },
        siswa: true,
      },
      orderBy: { mata_pelajaran: { nama: 'asc' } },
    });
    nilaiList.sort((a, b) => {
      const semesterOrder = semesterOrderValue(a.semester) - semesterOrderValue(b.semester);
      if (semesterOrder !== 0) return semesterOrder;
      return (a.mata_pelajaran?.nama || '').localeCompare(b.mata_pelajaran?.nama || '');
    });

    const siswa = nilaiList[0]?.siswa || await prisma.user.findUnique({ where: { id: siswaId } });
    if (!siswa) return res.status(404).json({ message: 'Siswa tidak ditemukan' });

    const latestSemester = [...nilaiList].sort((a, b) => semesterOrderValue(b.semester) - semesterOrderValue(a.semester))[0]?.semester || null;
    const { rombelSiswa } = await getStudentContext(siswaId, latestSemester);
    const allowed = await ensureCanAccessRapor(req, siswaId, latestSemester, rombelSiswa);
    if (!allowed) return res.status(403).json({ message: 'Anda tidak memiliki akses ke transkrip siswa ini' });

    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=transkrip_${safeFilename(siswa.nama_lengkap)}.pdf`);
    doc.pipe(res);

    drawSchoolHeader(doc, 'TRANSKRIP NILAI PESERTA DIDIK');
    drawInfoRows(doc, [
      ['Nama Peserta Didik', siswa.nama_lengkap],
      ['NIS/NISN', siswa.nomor_induk || '-'],
      ['Kelas Terakhir', rombelSiswa?.rombel?.master_kelas?.nama || '-'],
      ['Jumlah Semester', new Set(nilaiList.map((n) => n.semester_id)).size],
    ]);

    doc.moveDown(0.8);
    const columns = [
      { label: 'No', x: 48, width: 24, align: 'center' },
      { label: 'Semester', x: 78, width: 95 },
      { label: 'Tahun', x: 178, width: 58, align: 'center' },
      { label: 'Mata Pelajaran', x: 242, width: 190 },
      { label: 'KKM', x: 438, width: 35, align: 'center' },
      { label: 'Nilai', x: 478, width: 35, align: 'center' },
      { label: 'Pred.', x: 518, width: 30, align: 'center' },
    ];

    drawTableHeader(doc, columns, doc.y);
    doc.font('Helvetica').fontSize(8);
    nilaiList.forEach((nilai, index) => {
      ensureSpace(doc, 28);
      const y = doc.y;
      if (index % 2 === 0) doc.rect(45, y - 2, 505, 21).fill('#F9FAFB').fillColor('#000000');
      const values = [
        index + 1,
        nilai.semester?.nama || '-',
        nilai.semester?.tahun_ajaran?.kode || '-',
        nilai.mata_pelajaran?.nama || '-',
        nilai.mata_pelajaran?.kkm || '-',
        Math.round(nilai.nilai_akhir),
        gradeLetter(nilai.nilai_akhir),
      ];
      columns.forEach((col, colIndex) => {
        doc.text(String(values[colIndex]), col.x, y + 4, { width: col.width, align: col.align || 'left' });
      });
      doc.y = y + 21;
    });

    if (!nilaiList.length) {
      resetCursor(doc, doc.y + 4);
      doc.font('Helvetica').fontSize(9);
      drawFullWidthText(doc, 'Belum ada data nilai.');
      doc.moveDown();
    }

    resetCursor(doc, doc.y + 10);
    doc.font('Helvetica-Bold').fontSize(10);
    drawFullWidthText(doc, `Rata-rata kumulatif: ${averageNilai(nilaiList).toFixed(2)}`, { align: 'right' });
    doc.moveDown(2);

    drawSignatureSlots(doc, [
      {
        placeDate: `Cikalong, ${formatDateId()}`,
        role: 'Kepala Sekolah',
        name: '( ____________________ )',
      },
    ]);

    doc.end();
  } catch (error) {
    console.error('Generate Transkrip Error:', error);
    if (!res.headersSent) return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * GET /api/rapor/preview/:siswaId/:semesterId
 * Get rapor data as JSON (for frontend preview)
 */
const previewRapor = async (req, res) => {
  try {
    const { siswaId, semesterId } = req.params;

    const payload = await loadRaporData(siswaId, semesterId);
    if (payload.notFound) return res.status(404).json({ message: payload.notFound });

    const allowed = await ensureCanAccessRapor(req, siswaId, payload.semester, payload.rombelSiswa);
    if (!allowed) return res.status(403).json({ message: 'Anda tidak memiliki akses ke rapor siswa ini' });

    const { siswa, semester, rombelSiswa, nilaiList, kehadiranAll, catatan } = payload;
    const { totalMapel, requiredMapelIds } = await getRequiredMapelCount(rombelSiswa?.rombel?.master_kelas_id);
    const completedMapelCount = requiredMapelIds.length > 0
      ? new Set(
          nilaiList
            .filter((nilai) => requiredMapelIds.includes(nilai.mata_pelajaran_id))
            .map((nilai) => nilai.mata_pelajaran_id)
        ).size
      : nilaiList.length;
    const hasNotes = Boolean(catatan?.catatan?.trim());
    const nilaiComplete = totalMapel > 0 ? completedMapelCount >= totalMapel : completedMapelCount > 0;
    const missingData = [];
    if (!nilaiComplete) missingData.push('nilai');
    if (kehadiranAll.length === 0) missingData.push('kehadiran');
    if (!hasNotes) missingData.push('catatan');

    return res.status(200).json({
      message: 'Preview rapor berhasil',
      data: {
        canPrint: missingData.length === 0,
        missingData,
        nilaiCount: completedMapelCount,
        totalMapel,
        kehadiranCount: kehadiranAll.length,
        siswa: {
          nama: siswa.nama_lengkap,
          nisn: siswa.nomor_induk || '-',
          kelas: rombelSiswa?.rombel?.master_kelas?.nama || '-',
          waliKelas: rombelSiswa?.rombel?.wali_kelas?.nama_lengkap || '-',
        },
        semester: semester.nama,
        tahunAjaran: semester.tahun_ajaran.kode,
        nilai: nilaiList.map((n) => ({
          mapel: n.mata_pelajaran.nama,
          kkm: n.mata_pelajaran.kkm,
          nilaiTugas: n.nilai_tugas,
          nilaiUH: n.nilai_uh,
          nilaiUTS: n.nilai_uts,
          nilaiUAS: n.nilai_uas,
          nilaiKeaktifan: n.nilai_keaktifan,
          nilaiKehadiran: n.nilai_kehadiran,
          nilaiAkhir: Math.round(n.nilai_akhir),
          predikat: gradeLetter(n.nilai_akhir),
          tuntas: n.nilai_akhir >= n.mata_pelajaran.kkm,
        })),
        kehadiran: {
          hadir: kehadiranAll.filter((k) => k.status === 'HADIR').length,
          sakit: kehadiranAll.filter((k) => k.status === 'SAKIT').length,
          izin: kehadiranAll.filter((k) => k.status === 'IZIN').length,
          alpa: kehadiranAll.filter((k) => k.status === 'ALPA').length,
        },
        catatan: catatan?.catatan || null,
      },
    });
  } catch (error) {
    console.error('Preview Rapor Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const getRaporStatusByRombel = async (req, res) => {
  try {
    const { rombelId } = req.params;
    let { semesterId } = req.query;

    let semester = null;
    if (semesterId) {
      semester = await prisma.semester.findUnique({
        where: { id: semesterId },
        include: { tahun_ajaran: true },
      });
    } else {
      semester = await prisma.semester.findFirst({
        where: { is_active: true },
        include: { tahun_ajaran: true },
      });
      semesterId = semester?.id;
    }

    if (!semester || !semesterId) {
      return res.status(404).json({ message: 'Semester tidak ditemukan' });
    }

    const rombel = await findOwnedRombel({
      userId: req.user.userId,
      role: req.user.role,
      rombelId,
      tahunAjaranId: semester.tahun_ajaran_id,
    });

    if (!rombel) {
      const status = canBypassWaliOwnership(req.user.role) ? 404 : 403;
      return res.status(status).json({ message: 'Rombel tidak ditemukan atau bukan kelas wali Anda' });
    }

    const siswaIds = rombel.siswa.map((s) => s.siswa_id);
    const { totalMapel, requiredMapelIds } = await getRequiredMapelCount(rombel.master_kelas_id);
    const mapelWhere = requiredMapelIds.length > 0
      ? { mata_pelajaran_id: { in: requiredMapelIds } }
      : {};
    const [nilaiList, catatanList, kehadiranList] = await Promise.all([
      prisma.nilai.findMany({
        where: { siswa_id: { in: siswaIds }, semester_id: semesterId, ...mapelWhere },
        select: { siswa_id: true },
      }),
      prisma.catatanAkademik.findMany({
        where: { siswa_id: { in: siswaIds }, semester_id: semesterId },
        select: { id: true, siswa_id: true, catatan: true },
      }),
      prisma.kehadiran.findMany({
        where: { siswa_id: { in: siswaIds }, semester_id: semesterId },
        select: { siswa_id: true },
      }),
    ]);

    const nilaiCount = {};
    nilaiList.forEach((n) => {
      nilaiCount[n.siswa_id] = (nilaiCount[n.siswa_id] || 0) + 1;
    });
    const catatanMap = {};
    catatanList.forEach((c) => {
      catatanMap[c.siswa_id] = c;
    });
    const kehadiranCount = {};
    kehadiranList.forEach((k) => {
      kehadiranCount[k.siswa_id] = (kehadiranCount[k.siswa_id] || 0) + 1;
    });

    const data = rombel.siswa.map((rs, index) => {
      const count = nilaiCount[rs.siswa_id] || 0;
      const note = catatanMap[rs.siswa_id];
      const attendanceCount = kehadiranCount[rs.siswa_id] || 0;
      const hasNotes = Boolean(note?.catatan?.trim());
      const nilaiComplete = totalMapel > 0 ? count >= totalMapel : count > 0;
      const missingData = [];
      if (!nilaiComplete) missingData.push('nilai');
      if (attendanceCount === 0) missingData.push('kehadiran');
      if (!hasNotes) missingData.push('catatan');

      return {
        id: rs.siswa.id,
        no: index + 1,
        nisn: rs.siswa.nomor_induk || '-',
        name: rs.siswa.nama_lengkap,
        comp: count,
        total: totalMapel,
        kehadiranCount: attendanceCount,
        catatanId: note?.id || null,
        hasNotes,
        canPrint: missingData.length === 0,
        missingData,
      };
    });

    return res.status(200).json({
      message: 'Status rapor rombel berhasil diambil',
      data: {
        rombelId: rombel.id,
        kelas: rombel.master_kelas?.nama || '-',
        semesterId,
        semester: semester.nama,
        tahunAjaran: semester.tahun_ajaran?.kode || '-',
        students: data,
      },
    });
  } catch (error) {
    console.error('Rapor Status Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

const generateBulkRapor = async (req, res) => {
  try {
    const { semesterId, siswaIds } = req.body;

    if (!semesterId || !Array.isArray(siswaIds) || siswaIds.length === 0) {
      return res.status(400).json({ message: 'semesterId dan siswaIds wajib diisi' });
    }

    const payloads = [];
    for (const siswaId of siswaIds) {
      const payload = await loadRaporData(siswaId, semesterId);
      if (payload.notFound) return res.status(404).json({ message: payload.notFound });

      const allowed = await ensureCanAccessRapor(req, siswaId, payload.semester, payload.rombelSiswa);
      if (!allowed) {
        return res.status(403).json({ message: 'Anda tidak memiliki akses ke salah satu rapor siswa yang dipilih' });
      }

      payloads.push(payload);
    }

    const semester = payloads[0].semester;
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rapor_massal_${safeFilename(semester.nama)}_${safeFilename(semester.tahun_ajaran?.kode)}.pdf`);
    doc.pipe(res);

    payloads.forEach((payload, index) => {
      if (index > 0) doc.addPage();
      drawRaporContent(doc, payload);
    });

    doc.end();
  } catch (error) {
    console.error('Generate Bulk Rapor Error:', error);
    if (!res.headersSent) return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = {
  generateRapor,
  generateTranskrip,
  previewRapor,
  getRaporStatusByRombel,
  generateBulkRapor,
};
