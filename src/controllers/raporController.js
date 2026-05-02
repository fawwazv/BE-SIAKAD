// src/controllers/raporController.js
// ═══════════════════════════════════════════════
// E-RAPOR PDF GENERATION CONTROLLER (FR-05.3)
// Compiles grades + attendance + catatan into PDF
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const PDFDocument = require('pdfkit');

const SCHOOL = {
  province: 'PEMERINTAH PROVINSI JAWA BARAT',
  office: 'DINAS PENDIDIKAN',
  name: 'SMA NEGERI 1 CIKALONG',
  address: 'Jl. Raya Cikalong No. 1, Cikalong, Kab. Cianjur, Jawa Barat',
  phone: 'Telp. (0263) 000000',
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
  doc.font('Helvetica').fontSize(8).text(`${SCHOOL.address} | ${SCHOOL.phone}`, { align: 'center' });
  doc.moveDown(0.4);
  doc.moveTo(45, doc.y).lineTo(550, doc.y).lineWidth(1.2).stroke();
  doc.moveTo(45, doc.y + 2).lineTo(550, doc.y + 2).lineWidth(0.4).stroke();
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(12).text(title, { align: 'center' });
  doc.moveDown(1);
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

/**
 * GET /api/rapor/:siswaId/:semesterId
 * Generate e-Rapor PDF for a student in a specific semester.
 */
const generateRapor = async (req, res) => {
  try {
    const { siswaId, semesterId } = req.params;

    const semester = await prisma.semester.findUnique({
      where: { id: semesterId },
      include: { tahun_ajaran: true },
    });
    if (!semester) return res.status(404).json({ message: 'Semester tidak ditemukan' });

    const { siswa, rombelSiswa } = await getStudentContext(siswaId, semester);
    if (!siswa) return res.status(404).json({ message: 'Siswa tidak ditemukan' });

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

    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=rapor_${safeFilename(siswa.nama_lengkap)}_${safeFilename(semester.nama)}.pdf`);
    doc.pipe(res);

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
    doc.font('Helvetica-Bold').fontSize(10).text('A. RINCIAN NILAI MATA PELAJARAN');
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
      doc.font('Helvetica').fontSize(9).text('Belum ada data nilai.', 45, doc.y + 4);
      doc.moveDown();
    }

    const avg = averageNilai(nilaiList);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(9).text(`Rata-rata nilai semester: ${avg.toFixed(2)}`, { align: 'right' });

    doc.moveDown(1);
    ensureSpace(doc, 90);
    const hadir = kehadiranAll.filter((k) => k.status === 'HADIR').length;
    const sakit = kehadiranAll.filter((k) => k.status === 'SAKIT').length;
    const izin = kehadiranAll.filter((k) => k.status === 'IZIN').length;
    const alpa = kehadiranAll.filter((k) => k.status === 'ALPA').length;
    doc.font('Helvetica-Bold').fontSize(10).text('B. KEHADIRAN');
    doc.font('Helvetica').fontSize(9).text(`Hadir: ${hadir}    Sakit: ${sakit}    Izin: ${izin}    Alpa: ${alpa}`);
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(10).text('C. CATATAN WALI KELAS');
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).text(catatan?.catatan || 'Tidak ada catatan.', { width: 505, align: 'justify' });
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
      doc.font('Helvetica').fontSize(9).text('Belum ada data nilai.', 45, doc.y + 4);
      doc.moveDown();
    }

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(10).text(`Rata-rata kumulatif: ${averageNilai(nilaiList).toFixed(2)}`, { align: 'right' });
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

    const [siswa, semester, nilaiList, kehadiranAll, catatan] = await Promise.all([
      prisma.user.findUnique({
        where: { id: siswaId },
        include: { profile: true },
      }),
      prisma.semester.findUnique({
        where: { id: semesterId },
        include: { tahun_ajaran: true },
      }),
      prisma.nilai.findMany({
        where: { siswa_id: siswaId, semester_id: semesterId },
        include: { mata_pelajaran: true },
        orderBy: { mata_pelajaran: { nama: 'asc' } },
      }),
      prisma.kehadiran.findMany({ where: { siswa_id: siswaId, semester_id: semesterId } }),
      prisma.catatanAkademik.findUnique({
        where: { siswa_id_semester_id: { siswa_id: siswaId, semester_id: semesterId } },
      }),
    ]);

    if (!siswa || !semester) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    const { rombelSiswa } = await getStudentContext(siswaId, semester);

    return res.status(200).json({
      message: 'Preview rapor berhasil',
      data: {
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

module.exports = { generateRapor, generateTranskrip, previewRapor };
