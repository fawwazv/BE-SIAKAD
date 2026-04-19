// src/controllers/raporController.js
// ═══════════════════════════════════════════════
// E-RAPOR PDF GENERATION CONTROLLER (FR-05.3)
// Compiles grades + attendance + catatan into PDF
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const PDFDocument = require('pdfkit');

/**
 * GET /api/rapor/:siswaId/:semesterId
 * Generate e-Rapor PDF for a student in a specific semester
 */
const generateRapor = async (req, res) => {
  try {
    const { siswaId, semesterId } = req.params;

    // 1. Get student info
    const siswa = await prisma.user.findUnique({
      where: { id: siswaId },
      include: { profile: true, role: true },
    });

    if (!siswa) {
      return res.status(404).json({ message: 'Siswa tidak ditemukan' });
    }

    // 2. Get semester info
    const semester = await prisma.semester.findUnique({
      where: { id: semesterId },
      include: { tahun_ajaran: true },
    });

    if (!semester) {
      return res.status(404).json({ message: 'Semester tidak ditemukan' });
    }

    // 3. Get grades
    const nilaiList = await prisma.nilai.findMany({
      where: { siswa_id: siswaId, semester_id: semesterId },
      include: { mata_pelajaran: true },
      orderBy: { mata_pelajaran: { nama: 'asc' } },
    });

    // 4. Get attendance stats
    const kehadiranAll = await prisma.kehadiran.findMany({
      where: { siswa_id: siswaId },
    });

    const totalHadir = kehadiranAll.filter((k) => k.status === 'HADIR').length;
    const totalSakit = kehadiranAll.filter((k) => k.status === 'SAKIT').length;
    const totalIzin = kehadiranAll.filter((k) => k.status === 'IZIN').length;
    const totalAlpa = kehadiranAll.filter((k) => k.status === 'ALPA').length;

    // 5. Get catatan akademik
    const catatan = await prisma.catatanAkademik.findUnique({
      where: { siswa_id_semester_id: { siswa_id: siswaId, semester_id: semesterId } },
      include: { wali_kelas: { select: { nama_lengkap: true } } },
    });

    // 6. Get rombel info (kelas)
    const rombelSiswa = await prisma.rombelSiswa.findFirst({
      where: { siswa_id: siswaId },
      include: {
        rombel: {
          include: {
            master_kelas: true,
            wali_kelas: { select: { nama_lengkap: true } },
          },
        },
      },
    });

    // ── Generate PDF ────────────────────────────────
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=rapor_${siswa.nama_lengkap.replace(/\s+/g, '_')}_${semester.nama}.pdf`
    );

    doc.pipe(res);

    // Header
    doc.fontSize(16).font('Helvetica-Bold').text('LAPORAN HASIL BELAJAR PESERTA DIDIK', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('SMAN 1 Cikalong', { align: 'center' });
    doc.moveDown();

    // Line separator
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Student Info
    doc.fontSize(10).font('Helvetica-Bold').text('DATA SISWA', { underline: true });
    doc.moveDown(0.5);
    doc.font('Helvetica');

    const infoTable = [
      ['Nama Lengkap', siswa.nama_lengkap],
      ['NISN', siswa.nomor_induk || '-'],
      ['Kelas', rombelSiswa?.rombel?.master_kelas?.nama || '-'],
      ['Semester', semester.nama],
      ['Tahun Ajaran', semester.tahun_ajaran.kode],
      ['Wali Kelas', rombelSiswa?.rombel?.wali_kelas?.nama_lengkap || '-'],
    ];

    infoTable.forEach(([label, value]) => {
      doc.text(`${label.padEnd(20)}: ${value}`);
    });

    doc.moveDown();

    // Grades Table
    doc.font('Helvetica-Bold').text('NILAI AKADEMIK', { underline: true });
    doc.moveDown(0.5);

    // Table header
    const colX = [50, 55, 280, 340, 400, 460, 510];
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('No', colX[0], doc.y, { width: 25 });
    const headerY = doc.y - 12;
    doc.text('Mata Pelajaran', colX[1], headerY, { width: 220 });
    doc.text('KKM', colX[2], headerY, { width: 50 });
    doc.text('Nilai', colX[3], headerY, { width: 50 });
    doc.text('Pred.', colX[4], headerY, { width: 50 });
    doc.text('Ket.', colX[5], headerY, { width: 40 });
    doc.moveDown(0.5);

    // Line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();

    doc.font('Helvetica').fontSize(9);
    nilaiList.forEach((n, i) => {
      const y = doc.y + 3;
      const lulus = n.nilai_akhir >= n.mata_pelajaran.kkm;
      doc.text(`${i + 1}`, colX[0], y, { width: 25 });
      doc.text(n.mata_pelajaran.nama, colX[1], y, { width: 220 });
      doc.text(`${n.mata_pelajaran.kkm}`, colX[2], y, { width: 50 });
      doc.text(`${Math.round(n.nilai_akhir)}`, colX[3], y, { width: 50 });
      doc.text(n.predikat, colX[4], y, { width: 50 });
      doc.text(lulus ? 'Tuntas' : 'Belum', colX[5], y, { width: 50 });
      doc.moveDown(0.3);
    });

    if (nilaiList.length === 0) {
      doc.text('Belum ada data nilai', colX[0]);
    }

    // Line
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    // Attendance Summary
    doc.font('Helvetica-Bold').fontSize(10).text('KEHADIRAN', { underline: true });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9);
    doc.text(`Hadir: ${totalHadir}    Sakit: ${totalSakit}    Izin: ${totalIzin}    Alpa: ${totalAlpa}`);
    doc.moveDown();

    // Catatan Akademik
    doc.font('Helvetica-Bold').fontSize(10).text('CATATAN WALI KELAS', { underline: true });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9);
    doc.text(catatan?.catatan || 'Tidak ada catatan', { width: 495 });
    doc.moveDown(2);

    // Signature
    const signY = doc.y;
    doc.fontSize(9);
    doc.text('Mengetahui,', 50, signY);
    doc.text(`Cikalong, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, 350, signY);
    doc.moveDown(0.3);
    doc.text('Kepala Sekolah', 50);
    doc.text('Wali Kelas', 350, doc.y - 12);
    doc.moveDown(3);
    doc.text('_______________________', 50);
    doc.text(rombelSiswa?.rombel?.wali_kelas?.nama_lengkap || '_______________________', 350, doc.y - 12);

    doc.end();
  } catch (error) {
    console.error('Generate Rapor Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
    }
  }
};

/**
 * GET /api/rapor/preview/:siswaId/:semesterId
 * Get rapor data as JSON (for frontend preview)
 */
const previewRapor = async (req, res) => {
  try {
    const { siswaId, semesterId } = req.params;

    const [siswa, semester, nilaiList, kehadiranAll, catatan, rombelSiswa] = await Promise.all([
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
      prisma.kehadiran.findMany({ where: { siswa_id: siswaId } }),
      prisma.catatanAkademik.findUnique({
        where: { siswa_id_semester_id: { siswa_id: siswaId, semester_id: semesterId } },
      }),
      prisma.rombelSiswa.findFirst({
        where: { siswa_id: siswaId },
        include: {
          rombel: {
            include: {
              master_kelas: true,
              wali_kelas: { select: { nama_lengkap: true } },
            },
          },
        },
      }),
    ]);

    if (!siswa || !semester) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

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
          nilaiAkhir: Math.round(n.nilai_akhir),
          predikat: n.predikat,
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

module.exports = { generateRapor, previewRapor };
