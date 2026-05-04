// src/controllers/importController.js
// ═══════════════════════════════════════════════
// CSV / EXCEL IMPORT CONTROLLER
// Bulk user import for Siswa & Guru (FR-02.3)
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { generateTemporaryPassword, hashPassword } = require('../utils/authSecurity');

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
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

function valueOf(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && `${row[key]}`.trim() !== '') {
      return `${row[key]}`.trim();
    }
  }
  return '';
}

function normalizeRoleName(value) {
  const raw = `${value || 'Siswa'}`.trim();
  const lower = raw.toLowerCase();
  if (lower === 'guru mata pelajaran' || lower === 'guru' || lower === 'guru mapel') return 'Guru Mapel';
  if (lower === 'wali kelas') return 'Wali Kelas';
  if (lower === 'kurikulum') return 'Kurikulum';
  if (lower === 'administrator' || lower === 'admin') return 'Administrator';
  return raw || 'Siswa';
}

function normalizeGender(value) {
  const raw = `${value || ''}`.trim().toLowerCase();
  if (!raw) return null;
  if (['p', 'perempuan', 'female'].includes(raw)) return 'P';
  if (['l', 'laki-laki', 'laki laki', 'male'].includes(raw)) return 'L';
  return value;
}

function buildProfile(row) {
  return {
    jenis_kelamin: normalizeGender(valueOf(row, ['jenis_kelamin', 'Jenis Kelamin', 'gender'])),
    tanggal_lahir: valueOf(row, ['tanggal_lahir', 'Tanggal Lahir', 'tanggalLahir']) || null,
    tempat_lahir: valueOf(row, ['tempat_lahir', 'Tempat Lahir', 'tempatLahir']) || null,
    agama: valueOf(row, ['agama', 'Agama']) || null,
    nik: valueOf(row, ['nik', 'NIK']) || null,
    nama_ibu_kandung: valueOf(row, ['nama_ibu_kandung', 'Nama Ibu Kandung', 'ibu']) || null,
    status_perkawinan: valueOf(row, ['status_perkawinan', 'Status Perkawinan']) || null,
    provinsi: valueOf(row, ['provinsi', 'Provinsi']) || null,
    kota_kabupaten: valueOf(row, ['kota_kabupaten', 'Kota/Kabupaten', 'kota']) || null,
    kecamatan: valueOf(row, ['kecamatan', 'Kecamatan']) || null,
    kelurahan: valueOf(row, ['kelurahan', 'Kelurahan']) || null,
    detail_alamat: valueOf(row, ['detail_alamat', 'Alamat', 'alamat']) || null,
    rt: valueOf(row, ['rt', 'RT']) || null,
    rw: valueOf(row, ['rw', 'RW']) || null,
    kode_pos: valueOf(row, ['kode_pos', 'Kode Pos', 'kodePos']) || null,
  };
}

function isActiveStatus(value) {
  const raw = `${value || 'Aktif'}`.trim().toLowerCase();
  return !['tidak aktif', 'nonaktif', 'inactive', 'false', '0'].includes(raw);
}

function csvEscape(value) {
  const str = value === undefined || value === null ? '' : `${value}`;
  const normalized = str.replace(/\r?\n/g, ' ');
  const escaped = normalized.replace(/"/g, '""');
  return /[",;]/.test(escaped) ? `"${escaped}"` : escaped;
}

function userToExportRow(user) {
  const p = user.profile || {};
  return {
    nama_lengkap: user.nama_lengkap || '',
    email: user.email || '',
    nomor_induk: user.nomor_induk || '',
    role: user.role?.nama_role || '',
    status: user.status_aktif ? 'Aktif' : 'Tidak Aktif',
    jenis_kelamin: p.jenis_kelamin || '',
    tanggal_lahir: p.tanggal_lahir || '',
    tempat_lahir: p.tempat_lahir || '',
    agama: p.agama || '',
    nik: p.nik || '',
    nama_ibu_kandung: p.nama_ibu_kandung || '',
    status_perkawinan: p.status_perkawinan || '',
    provinsi: p.provinsi || '',
    kota_kabupaten: p.kota_kabupaten || '',
    kecamatan: p.kecamatan || '',
    kelurahan: p.kelurahan || '',
    detail_alamat: p.detail_alamat || '',
    rt: p.rt || '',
    rw: p.rw || '',
    kode_pos: p.kode_pos || '',
  };
}

/**
 * POST /api/import/users
 * Bulk import users from CSV/Excel
 * 
 * Expected columns: nama_lengkap, email, username, nomor_induk, role, password (optional)
 * If password is not provided, a random temporary password is returned once.
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
    const results = { success: 0, failed: 0, errors: [], temporaryCredentials: [] };

    // Get all roles
    const roles = await prisma.role.findMany();
    const roleMap = {};
    roles.forEach((r) => (roleMap[r.nama_role] = r.id));

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // +2 for header + 0-index

      try {
        // Normalize column names (handle various casing/naming)
        const namaLengkap = valueOf(row, ['nama_lengkap', 'nama', 'name', 'Nama']);
        const email = valueOf(row, ['email', 'Email']);
        const username = valueOf(row, ['username', 'Username', 'user_name']);
        const nomorInduk = valueOf(row, ['nomor_induk', 'nisn', 'nip', 'NISN', 'NIP']);
        const roleName = normalizeRoleName(valueOf(row, ['role', 'Role', 'peran']) || 'Siswa');
        const password = valueOf(row, ['password', 'Password']);
        const status = valueOf(row, ['status', 'Status', 'status_aktif']);

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
        const existing = prisma.user.findFirst
          ? await prisma.user.findFirst({
              where: {
                OR: [
                  { email: { equals: email, mode: 'insensitive' } },
                  ...(username ? [{ username: { equals: username, mode: 'insensitive' } }] : []),
                  ...(nomorInduk ? [{ nomor_induk: nomorInduk }] : []),
                ],
              },
            })
          : await prisma.user.findUnique({ where: { email } });
        if (existing) {
          results.failed++;
          results.errors.push(`Baris ${rowNum}: Email, username, atau nomor induk sudah terdaftar`);
          continue;
        }

        const plainPassword = password || generateTemporaryPassword();
        const hashedPw = await hashPassword(plainPassword);
        const profileData = buildProfile(row);

        await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email,
              username: username || null,
              password_hash: hashedPw,
              nama_lengkap: namaLengkap,
              nomor_induk: nomorInduk || null,
              role_id: roleId,
              status_aktif: isActiveStatus(status),
              force_password_change: true,
            },
          });

          await tx.userProfile.create({
            data: {
              user_id: user.id,
              ...profileData,
            },
          });
        });

        results.success++;
        if (!password) {
          results.temporaryCredentials.push({
            row: rowNum,
            name: namaLengkap,
            email,
            username: username || '',
            nomorInduk: nomorInduk || '',
            password: plainPassword,
          });
        }
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
  const csvContent = 'nama_lengkap,email,username,nomor_induk,role,password,status,jenis_kelamin,tanggal_lahir,tempat_lahir,agama,nik,nama_ibu_kandung,status_perkawinan,provinsi,kota_kabupaten,kecamatan,kelurahan,detail_alamat,rt,rw,kode_pos\nAhmad Siswa,ahmad@siakad.sch.id,ahmad.siswa,0012345678,Siswa,,Aktif,L,2008-01-15,Cianjur,Islam,3203011501080001,Siti Aminah,Belum Menikah,Jawa Barat,Kab. Cianjur,Cikalong,Sukamaju,Jl. Raya Cikalong,001,002,43291\nBudi Guru,budi@siakad.sch.id,budi.guru,198501152010011001,Guru Mapel,,Aktif,L,1985-01-15,Cianjur,Islam,3203011501850001,,Menikah,Jawa Barat,Kab. Cianjur,Cikalong,Sukamaju,Jl. Pendidikan,003,004,43291';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=template_import_users.csv');
  return res.send(csvContent);
};

/**
 * GET /api/import/users/export?format=csv|xlsx
 * Export users and profile data.
 */
const exportUsers = async (req, res) => {
  try {
    const format = `${req.query.format || 'csv'}`.toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
    const role = req.query.role ? `${req.query.role}` : '';

    const where = {};
    if (role) {
      where.role = { nama_role: normalizeRoleName(role) };
    }

    const users = await prisma.user.findMany({
      where,
      include: { role: true, profile: true },
      orderBy: { nama_lengkap: 'asc' },
    });
    const rows = users.map(userToExportRow);
    const fileDate = new Date().toISOString().slice(0, 10);

    if (format === 'xlsx') {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pengguna');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=export_pengguna_${fileDate}.xlsx`);
      return res.send(buffer);
    }

    const headers = [
      'nama_lengkap',
      'email',
      'nomor_induk',
      'role',
      'status',
      'jenis_kelamin',
      'tanggal_lahir',
      'tempat_lahir',
      'agama',
      'nik',
      'nama_ibu_kandung',
      'status_perkawinan',
      'provinsi',
      'kota_kabupaten',
      'kecamatan',
      'kelurahan',
      'detail_alamat',
      'rt',
      'rw',
      'kode_pos',
    ];
    const csvRows = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=export_pengguna_${fileDate}.csv`);
    return res.send(`\ufeff${csvRows.join('\n')}`);
  } catch (error) {
    console.error('Export Users Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { uploadImport, importUsers, getTemplate, exportUsers };
