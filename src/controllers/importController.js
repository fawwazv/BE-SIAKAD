// src/controllers/importController.js
// ═══════════════════════════════════════════════
// CSV / EXCEL IMPORT CONTROLLER
// Bulk user import for Siswa & Guru (FR-02.3)
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');

// Multer for import files
const IMPORT_DIR = path.join(__dirname, '../../uploads/imports');
if (!fs.existsSync(IMPORT_DIR)) {
  fs.mkdirSync(IMPORT_DIR, { recursive: true });
}

const importStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMPORT_DIR),
  filename: (req, file, cb) => {
    cb(null, `import-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const importFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  const allowedExts = ['.csv', '.xls', '.xlsx'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung. Gunakan CSV atau Excel (.xlsx, .xls).'), false);
  }
};

const uploadImport = multer({
  storage: importStorage,
  fileFilter: importFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/**
 * Parse CSV file to array of objects
 */
function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

/**
 * Parse Excel file to array of objects
 */
function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet);
}

/**
 * POST /api/import/users
 * Bulk import users from CSV/Excel
 * 
 * Expected columns: nama_lengkap, email, nomor_induk, role, password (optional)
 * If password is not provided, default is "password123"
 */
const importUsers = async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File tidak ditemukan' });
    }

    filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    // Parse file
    let records;
    if (ext === '.csv') {
      records = await parseCsv(filePath);
    } else {
      records = parseExcel(filePath);
    }

    if (!records || records.length === 0) {
      return res.status(400).json({ message: 'File kosong atau format tidak valid' });
    }

    // Validate and process
    const defaultPassword = await bcrypt.hash('password123', 10);
    const results = { success: 0, failed: 0, errors: [] };

    // Get all roles
    const roles = await prisma.role.findMany();
    const roleMap = {};
    roles.forEach((r) => (roleMap[r.nama_role] = r.id));

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // +2 for header + 0-index

      try {
        // Normalize column names (handle various casing/naming)
        const namaLengkap = row.nama_lengkap || row.nama || row.name || row.Nama;
        const email = row.email || row.Email;
        const nomorInduk = row.nomor_induk || row.nisn || row.nip || row.NISN || row.NIP;
        const roleName = row.role || row.Role || row.peran || 'Siswa';
        const password = row.password || row.Password;

        if (!namaLengkap || !email) {
          results.failed++;
          results.errors.push(`Baris ${rowNum}: nama_lengkap dan email wajib diisi`);
          continue;
        }

        // Check role exists
        const roleId = roleMap[roleName];
        if (!roleId) {
          results.failed++;
          results.errors.push(`Baris ${rowNum}: Role "${roleName}" tidak ditemukan`);
          continue;
        }

        // Check duplicate email
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          results.failed++;
          results.errors.push(`Baris ${rowNum}: Email "${email}" sudah terdaftar`);
          continue;
        }

        const hashedPw = password ? await bcrypt.hash(password, 10) : defaultPassword;

        await prisma.user.create({
          data: {
            email,
            password_hash: hashedPw,
            nama_lengkap: namaLengkap,
            nomor_induk: nomorInduk || null,
            role_id: roleId,
            status_aktif: true,
          },
        });

        results.success++;
      } catch (rowError) {
        results.failed++;
        results.errors.push(`Baris ${rowNum}: ${rowError.message}`);
      }
    }

    return res.status(200).json({
      message: `Import selesai: ${results.success} berhasil, ${results.failed} gagal`,
      data: results,
    });
  } catch (error) {
    console.error('Import Users Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  } finally {
    // Cleanup uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
};

/**
 * GET /api/import/template
 * Download CSV template for user import
 */
const getTemplate = (req, res) => {
  const csvContent = 'nama_lengkap,email,nomor_induk,role,password\nAhmad Siswa,ahmad@siakad.sch.id,0012345678,Siswa,password123\nBudi Guru,budi@siakad.sch.id,198501152010011001,Guru Mapel,password123';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=template_import_users.csv');
  return res.send(csvContent);
};

module.exports = { uploadImport, importUsers, getTemplate };
