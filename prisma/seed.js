// prisma/seed.js
// ═══════════════════════════════════════════════
// SIAKAD SMAN 1 Cikalong — Comprehensive Database Seeder
// Targets: Supabase PostgreSQL via Prisma ORM
// ═══════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');

// ─── HELPERS ────────────────────────────────────
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return +(Math.random() * (max - min) + min).toFixed(1);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function calcNilaiAkhir(t, uh, uts, uas, kea, keh) {
  return +(t * 0.2 + uh * 0.2 + uts * 0.2 + uas * 0.2 + kea * 0.1 + keh * 0.1).toFixed(2);
}
function predikat(na) {
  if (na >= 90) return 'A';
  if (na >= 80) return 'B';
  if (na >= 70) return 'C';
  if (na >= 60) return 'D';
  return 'E';
}

// ─── INDONESIAN NAME GENERATOR ──────────────────
const NAMA_DEPAN_L = [
  'Ahmad', 'Budi', 'Cahyo', 'Dimas', 'Eko', 'Fajar', 'Galih', 'Hendra',
  'Irfan', 'Joko', 'Kevin', 'Lukman', 'Muhammad', 'Naufal', 'Oki',
  'Putra', 'Rafi', 'Satria', 'Taufik', 'Umar', 'Vino', 'Wahyu',
  'Yoga', 'Zainal', 'Arif', 'Bayu', 'Dani', 'Faisal', 'Gilang', 'Hafiz',
  'Ilham', 'Jafar', 'Krisna', 'Lutfi', 'Malik', 'Nanda', 'Oscar',
  'Prasetyo', 'Ridho', 'Surya', 'Teguh', 'Udin', 'Rizky', 'Andi',
  'Dwi', 'Firman', 'Gunawan', 'Helmi', 'Ivan', 'Julian',
];
const NAMA_DEPAN_P = [
  'Aisyah', 'Bunga', 'Citra', 'Dewi', 'Eka', 'Fitri', 'Gita', 'Hani',
  'Indah', 'Jasmine', 'Kartika', 'Lestari', 'Maya', 'Nisa', 'Oktavia',
  'Putri', 'Rina', 'Sari', 'Tika', 'Umi', 'Vina', 'Wulan',
  'Yuni', 'Zahra', 'Amelia', 'Bella', 'Dina', 'Elsa', 'Fara', 'Gina',
  'Intan', 'Juli', 'Kirana', 'Laras', 'Melati', 'Nadya', 'Olga',
  'Puspita', 'Ratna', 'Sinta', 'Tiara', 'Utami', 'Riska', 'Ayu',
  'Diah', 'Fitriani', 'Handayani', 'Irma', 'Jihan', 'Keisha',
];
const NAMA_BELAKANG = [
  'Pratama', 'Kusuma', 'Wijaya', 'Saputra', 'Hidayat', 'Nugroho', 'Ramadhan',
  'Susanto', 'Wibowo', 'Setiawan', 'Hartono', 'Permana', 'Suryadi', 'Laksana',
  'Purnomo', 'Utomo', 'Cahyono', 'Firmansyah', 'Prasetya', 'Kurniawan',
  'Santoso', 'Hermawan', 'Budiman', 'Sulistyo', 'Rahmawati', 'Anggraini',
  'Handayani', 'Puspitasari', 'Lestari', 'Wahyuni',
];

function generateStudentName(index) {
  const isFemale = index % 2 === 0;
  const firstNames = isFemale ? NAMA_DEPAN_P : NAMA_DEPAN_L;
  const first = firstNames[index % firstNames.length];
  const last = NAMA_BELAKANG[index % NAMA_BELAKANG.length];
  return { nama: `${first} ${last}`, jk: isFemale ? 'P' : 'L' };
}

// ─── MAIN SEED FUNCTION ────────────────────────
async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  console.log('🌱 SIAKAD SMAN 1 Cikalong — Comprehensive Seeder');
  console.log('══════════════════════════════════════════════════\n');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // ══════════════════════════════════════════════
  // 1. ROLES
  // ══════════════════════════════════════════════
  console.log('📋 1. Seeding Roles...');
  const roleNames = ['Administrator', 'Kurikulum', 'Guru Mapel', 'Wali Kelas', 'Siswa', 'Guest'];
  const roles = {};
  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { nama_role: name },
      update: {},
      create: { nama_role: name },
    });
    roles[name] = role;
  }
  console.log(`   ✅ ${Object.keys(roles).length} roles created\n`);

  // ══════════════════════════════════════════════
  // 2. USERS + PROFILES
  // ══════════════════════════════════════════════
  console.log('👤 2. Seeding Users + Profiles...');

  // Helper to create user + profile
  async function createUser(data) {
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: { nama_lengkap: data.nama_lengkap, nomor_induk: data.nomor_induk, role_id: data.role_id },
      create: {
        email: data.email,
        password_hash: hashedPassword,
        nama_lengkap: data.nama_lengkap,
        nomor_induk: data.nomor_induk,
        role_id: data.role_id,
        status_aktif: true,
      },
    });

    if (data.profile) {
      await prisma.userProfile.upsert({
        where: { user_id: user.id },
        update: data.profile,
        create: { user_id: user.id, ...data.profile },
      });
    }
    return user;
  }

  // ── 2a. Admin ──
  const admin = await createUser({
    email: 'admin@siakad.sch.id',
    nama_lengkap: 'Super Administrator',
    nomor_induk: 'ADM-001',
    role_id: roles['Administrator'].id,
    profile: {
      jenis_kelamin: 'L',
      tanggal_lahir: '1980-05-15',
      tempat_lahir: 'Cianjur',
      agama: 'Islam',
      nik: '3203151505800001',
      provinsi: 'Jawa Barat',
      kota_kabupaten: 'Kab. Cianjur',
      kecamatan: 'Cikalong',
      kelurahan: 'Cikalong Kulon',
      detail_alamat: 'Jl. Raya Cikalong No. 1',
      rt: '001', rw: '001', kode_pos: '43291',
    },
  });
  console.log(`   ✅ Admin: ${admin.email}`);

  // ── 2b. Kurikulum ──
  const kurikulum = await createUser({
    email: 'kurikulum@siakad.sch.id',
    nama_lengkap: 'Dra. Hj. Nuraeni, M.Pd',
    nomor_induk: '196805121992032001',
    role_id: roles['Kurikulum'].id,
    profile: {
      jenis_kelamin: 'P',
      tanggal_lahir: '1968-05-12',
      tempat_lahir: 'Bandung',
      agama: 'Islam',
      nik: '3273125205680001',
      status_perkawinan: 'Menikah',
      provinsi: 'Jawa Barat',
      kota_kabupaten: 'Kab. Cianjur',
      kecamatan: 'Cikalong',
      kelurahan: 'Cikalong Kulon',
      detail_alamat: 'Jl. Pendidikan No. 10',
      rt: '003', rw: '002', kode_pos: '43291',
    },
  });
  console.log(`   ✅ Kurikulum: ${kurikulum.email}`);

  // ── 2c. 10 Guru Mapel (non-wali kelas) ──
  const guruData = [
    { nama: 'Dr. Siti Nurhaliza, S.Pd, M.Si', nip: '197501152000012001', jk: 'P', lahir: '1975-01-15', tmpLahir: 'Bandung' },
    { nama: 'Budi Santoso, S.Pd, M.Pd',       nip: '198001102003011002', jk: 'L', lahir: '1980-01-10', tmpLahir: 'Sumedang' },
    { nama: 'Ahmad Hidayat, S.Pd',             nip: '198503222008011003', jk: 'L', lahir: '1985-03-22', tmpLahir: 'Garut' },
    { nama: 'Rina Kartika, S.Pd',              nip: '199001042010012004', jk: 'P', lahir: '1990-01-04', tmpLahir: 'Cianjur' },
    { nama: 'Prof. Dr. Ani Widiastuti, M.Hum', nip: '196908182000022005', jk: 'P', lahir: '1969-08-18', tmpLahir: 'Yogyakarta' },
    { nama: 'Drs. Hendra Gunawan, M.Pd',       nip: '197206152001011006', jk: 'L', lahir: '1972-06-15', tmpLahir: 'Tasikmalaya' },
    { nama: 'Ir. Subekti, M.Si',               nip: '197803102005011007', jk: 'L', lahir: '1978-03-10', tmpLahir: 'Surabaya' },
    { nama: 'Drs. Agus Mulyono',               nip: '196712082000011008', jk: 'L', lahir: '1967-12-08', tmpLahir: 'Cirebon' },
    { nama: 'Dra. Lina Marlina, S.Pd',         nip: '197504252002022009', jk: 'P', lahir: '1975-04-25', tmpLahir: 'Bogor' },
    { nama: 'H. Rahman Hakim, S.Ag, M.Pd.I',   nip: '198009172004011010', jk: 'L', lahir: '1980-09-17', tmpLahir: 'Ciamis' },
  ];

  const guruUsers = [];
  for (let i = 0; i < guruData.length; i++) {
    const g = guruData[i];
    const user = await createUser({
      email: `guru${i + 1}@siakad.sch.id`,
      nama_lengkap: g.nama,
      nomor_induk: g.nip,
      role_id: roles['Guru Mapel'].id,
      profile: {
        jenis_kelamin: g.jk,
        tanggal_lahir: g.lahir,
        tempat_lahir: g.tmpLahir,
        agama: 'Islam',
        nik: `320315${g.lahir.replace(/-/g, '').substring(2)}${String(i).padStart(4, '0')}`,
        status_perkawinan: 'Menikah',
        provinsi: 'Jawa Barat',
        kota_kabupaten: 'Kab. Cianjur',
        kecamatan: 'Cikalong',
        kelurahan: pick(['Cikalong Kulon', 'Cikalong Wetan', 'Mekargalih', 'Sukasari']),
        detail_alamat: `Jl. Guru Sejahtera No. ${i + 1}`,
        rt: `00${(i % 5) + 1}`, rw: `00${(i % 3) + 1}`, kode_pos: '43291',
      },
    });
    guruUsers.push(user);
    console.log(`   ✅ Guru ${i + 1}: ${g.nama}`);
  }

  // ── 2d. 1 Guru sekaligus Wali Kelas ──
  const waliKelas = await createUser({
    email: 'walikelas@siakad.sch.id',
    nama_lengkap: 'Siti Aminah, S.Pd, M.Pd',
    nomor_induk: '198703222011012011',
    role_id: roles['Wali Kelas'].id,
    profile: {
      jenis_kelamin: 'P',
      tanggal_lahir: '1987-03-22',
      tempat_lahir: 'Cianjur',
      agama: 'Islam',
      nik: '3203226203870001',
      status_perkawinan: 'Menikah',
      provinsi: 'Jawa Barat',
      kota_kabupaten: 'Kab. Cianjur',
      kecamatan: 'Cikalong',
      kelurahan: 'Cikalong Kulon',
      detail_alamat: 'Jl. Pendidikan No. 22',
      rt: '002', rw: '003', kode_pos: '43291',
    },
  });
  guruUsers.push(waliKelas); // index 10
  console.log(`   ✅ Wali Kelas: ${waliKelas.email}`);

  // ── 2e. 100 Siswa ──
  const siswaUsers = [];
  const kecamatanList = ['Cikalong', 'Pacet', 'Cipanas', 'Sukanagara', 'Campaka'];
  const kelurahanList = ['Cikalong Kulon', 'Mekargalih', 'Sukasari', 'Mekarjaya', 'Cisarua'];
  const agamaList = ['Islam', 'Islam', 'Islam', 'Islam', 'Kristen', 'Islam', 'Islam', 'Islam', 'Islam', 'Islam']; // 90% Islam

  for (let i = 0; i < 100; i++) {
    const { nama, jk } = generateStudentName(i);
    const nisn = `00${String(78901234 + i).padStart(8, '0')}`;
    const tahunLahir = rand(2007, 2010);
    const bulanLahir = String(rand(1, 12)).padStart(2, '0');
    const hariLahir = String(rand(1, 28)).padStart(2, '0');

    const user = await createUser({
      email: `siswa${String(i + 1).padStart(3, '0')}@siakad.sch.id`,
      nama_lengkap: nama,
      nomor_induk: nisn,
      role_id: roles['Siswa'].id,
      profile: {
        jenis_kelamin: jk,
        tanggal_lahir: `${tahunLahir}-${bulanLahir}-${hariLahir}`,
        tempat_lahir: pick(['Cianjur', 'Bandung', 'Bogor', 'Sukabumi', 'Garut']),
        agama: agamaList[i % agamaList.length],
        nik: `3203${jk === 'P' ? (40 + parseInt(hariLahir)) : hariLahir}${bulanLahir}${String(tahunLahir).substring(2)}${String(i).padStart(4, '0')}`,
        nama_ibu_kandung: `${pick(NAMA_DEPAN_P)} ${pick(NAMA_BELAKANG)}`,
        provinsi: 'Jawa Barat',
        kota_kabupaten: 'Kab. Cianjur',
        kecamatan: kecamatanList[i % kecamatanList.length],
        kelurahan: kelurahanList[i % kelurahanList.length],
        detail_alamat: `Kp. ${pick(['Babakan', 'Pasir', 'Leuwi', 'Neglasari', 'Ciherang'])} RT ${rand(1, 15)} RW ${rand(1, 8)} No. ${rand(1, 100)}`,
        rt: String(rand(1, 15)).padStart(3, '0'),
        rw: String(rand(1, 8)).padStart(3, '0'),
        kode_pos: `432${rand(80, 99)}`,
      },
    });
    siswaUsers.push(user);
  }
  console.log(`   ✅ 100 siswa created with profiles\n`);

  // ══════════════════════════════════════════════
  // 3. TAHUN AJARAN + SEMESTER
  // ══════════════════════════════════════════════
  console.log('📅 3. Seeding Tahun Ajaran + Semester...');

  const tahunAjaranData = [
    { kode: '2023/2024', deskripsi: 'Tahun Ajaran 2023/2024', is_active: false },
    { kode: '2024/2025', deskripsi: 'Tahun Ajaran 2024/2025', is_active: false },
    { kode: '2025/2026', deskripsi: 'Tahun Ajaran 2025/2026', is_active: true },
  ];

  const tahunAjaranMap = {};   // kode -> record
  const semesterMap = {};      // "kode|nama" -> record

  for (const ta of tahunAjaranData) {
    const record = await prisma.tahunAjaran.upsert({
      where: { kode: ta.kode },
      update: { is_active: ta.is_active },
      create: ta,
    });
    tahunAjaranMap[ta.kode] = record;
    console.log(`   ✅ TA: ${ta.kode} (${ta.is_active ? 'AKTIF' : 'non-aktif'})`);

    // 2 semesters per tahun ajaran
    for (const semNama of ['Semester Ganjil', 'Semester Genap']) {
      const isActive = ta.is_active && semNama === 'Semester Genap'; // April 2026 = Genap aktif
      const sem = await prisma.semester.upsert({
        where: { nama_tahun_ajaran_id: { nama: semNama, tahun_ajaran_id: record.id } },
        update: { is_active: isActive },
        create: { nama: semNama, tahun_ajaran_id: record.id, is_active: isActive },
      });
      semesterMap[`${ta.kode}|${semNama}`] = sem;
    }
  }
  console.log(`   ✅ 6 semesters created\n`);

  // ══════════════════════════════════════════════
  // 4. MATA PELAJARAN (12)
  // ══════════════════════════════════════════════
  console.log('📚 4. Seeding 12 Mata Pelajaran...');

  const mapelData = [
    { kode: 'MTK-W',  nama: 'Matematika Wajib',        kategori: 'Wajib',        kkm: 75, deskripsi: 'Matematika dasar untuk semua jurusan' },
    { kode: 'MTK-P',  nama: 'Matematika Peminatan',     kategori: 'Peminatan',    kkm: 78, deskripsi: 'Matematika lanjutan untuk MIPA' },
    { kode: 'FIS-01', nama: 'Fisika',                   kategori: 'Peminatan',    kkm: 75, deskripsi: 'Ilmu Fisika untuk jurusan MIPA' },
    { kode: 'KIM-01', nama: 'Kimia',                    kategori: 'Peminatan',    kkm: 75, deskripsi: 'Ilmu Kimia untuk jurusan MIPA' },
    { kode: 'BIO-01', nama: 'Biologi',                  kategori: 'Peminatan',    kkm: 75, deskripsi: 'Ilmu Biologi untuk jurusan MIPA' },
    { kode: 'BIN-01', nama: 'Bahasa Indonesia',          kategori: 'Wajib',        kkm: 78, deskripsi: 'Bahasa Indonesia Wajib' },
    { kode: 'BIG-01', nama: 'Bahasa Inggris',            kategori: 'Wajib',        kkm: 75, deskripsi: 'Bahasa Inggris Wajib' },
    { kode: 'SEJ-01', nama: 'Sejarah Indonesia',         kategori: 'Wajib',        kkm: 75, deskripsi: 'Sejarah Indonesia Wajib' },
    { kode: 'PKN-01', nama: 'Pendidikan Pancasila',      kategori: 'Wajib',        kkm: 78, deskripsi: 'Pendidikan Kewarganegaraan' },
    { kode: 'PAI-01', nama: 'Pendidikan Agama Islam',    kategori: 'Wajib',        kkm: 78, deskripsi: 'Pendidikan Agama Islam dan Budi Pekerti' },
    { kode: 'SUN-01', nama: 'Bahasa Sunda',              kategori: 'Muatan Lokal', kkm: 70, deskripsi: 'Bahasa daerah Sunda' },
    { kode: 'PJK-01', nama: 'PJOK',                      kategori: 'Wajib',        kkm: 75, deskripsi: 'Pendidikan Jasmani, Olahraga, dan Kesehatan' },
  ];

  const mapelMap = {}; // kode -> record
  for (const mp of mapelData) {
    const record = await prisma.mataPelajaran.upsert({
      where: { kode: mp.kode },
      update: {},
      create: mp,
    });
    mapelMap[mp.kode] = record;
    console.log(`   ✅ ${mp.kode}: ${mp.nama}`);
  }
  console.log('');

  // ══════════════════════════════════════════════
  // 5. RUANG KELAS (15 ruang + 2 lab + 1 lapangan)
  // ══════════════════════════════════════════════
  console.log('🏫 5. Seeding Ruang Kelas...');

  const ruangData = [];
  // 15 regular classrooms
  for (let i = 1; i <= 15; i++) {
    const gedung = i <= 5 ? 'Gedung A' : i <= 10 ? 'Gedung B' : 'Gedung C';
    const kode = `R-${String(i).padStart(3, '0')}`;
    ruangData.push({ kode, gedung, kapasitas: 36 });
  }
  // Labs & special rooms
  ruangData.push({ kode: 'LAB-FIS', gedung: 'Gedung D', kapasitas: 30 });
  ruangData.push({ kode: 'LAB-KIM', gedung: 'Gedung D', kapasitas: 30 });
  ruangData.push({ kode: 'LAP-OR',  gedung: 'Lapangan', kapasitas: 100 });

  const ruangMap = {};
  for (const r of ruangData) {
    const record = await prisma.ruangKelas.upsert({
      where: { kode: r.kode },
      update: {},
      create: r,
    });
    ruangMap[r.kode] = record;
  }
  console.log(`   ✅ ${ruangData.length} ruang kelas created\n`);

  // ══════════════════════════════════════════════
  // 6. MASTER KELAS (15 kelas: X-1..X-5, XI-1..XI-5, XII-1..XII-5)
  // ══════════════════════════════════════════════
  console.log('🏛️  6. Seeding Master Kelas...');

  const tingkatMap = { 'X': 'Kelas 10', 'XI': 'Kelas 11', 'XII': 'Kelas 12' };
  const kelasNames = [];
  for (const tingkat of ['X', 'XI', 'XII']) {
    for (let i = 1; i <= 5; i++) {
      kelasNames.push({ nama: `${tingkat}-${i}`, tingkat: tingkatMap[tingkat] });
    }
  }

  const masterKelasMap = {}; // nama -> record
  let ruangIdx = 0;
  for (const kelas of kelasNames) {
    const ruangKode = `R-${String(ruangIdx + 1).padStart(3, '0')}`;
    // Assign wali kelas to X-1 only (the dedicated wali kelas user)
    const waliId = kelas.nama === 'X-1' ? waliKelas.id : null;

    const record = await prisma.masterKelas.upsert({
      where: { nama_tingkat: { nama: kelas.nama, tingkat: kelas.tingkat } },
      update: { wali_kelas_id: waliId },
      create: {
        nama: kelas.nama,
        tingkat: kelas.tingkat,
        wali_kelas_id: waliId,
        ruang_kelas_id: ruangMap[ruangKode]?.id || null,
      },
    });
    masterKelasMap[kelas.nama] = record;
    ruangIdx++;
    console.log(`   ✅ ${kelas.nama} (${kelas.tingkat})${waliId ? ' — Wali: Siti Aminah' : ''}`);
  }
  console.log('');

  // ══════════════════════════════════════════════
  // 7. GURU-MAPEL MAPPINGS
  // ══════════════════════════════════════════════
  console.log('🔗 7. Seeding Guru-Mapel Pemetaan...');

  // guru index -> mapel kode(s)
  const guruMapelAssignments = [
    { guruIdx: 0,  mapelKode: 'MTK-W',  kelas: 'X-1, X-2, X-3, X-4, X-5, XI-1, XI-2', jam: 24 },
    { guruIdx: 1,  mapelKode: 'MTK-P',  kelas: 'XI-3, XI-4, XI-5, XII-1, XII-2, XII-3, XII-4, XII-5', jam: 24 },
    { guruIdx: 2,  mapelKode: 'FIS-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XI-1, XI-2, XII-1, XII-2', jam: 22 },
    { guruIdx: 3,  mapelKode: 'KIM-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XI-3, XI-4, XII-3, XII-4', jam: 22 },
    { guruIdx: 4,  mapelKode: 'BIO-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XI-4, XI-5, XII-4, XII-5', jam: 22 },
    { guruIdx: 5,  mapelKode: 'BIN-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XI-1, XI-2, XI-3, XI-4, XI-5', jam: 24 },
    { guruIdx: 6,  mapelKode: 'BIG-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XII-1, XII-2, XII-3, XII-4, XII-5', jam: 24 },
    { guruIdx: 7,  mapelKode: 'PKN-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XI-1, XI-2, XI-3, XI-4, XI-5, XII-1, XII-2, XII-3, XII-4, XII-5', jam: 28 },
    { guruIdx: 8,  mapelKode: 'SEJ-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XI-1, XI-2, XI-3, XI-4, XI-5, XII-1, XII-2, XII-3, XII-4, XII-5', jam: 28 },
    { guruIdx: 9,  mapelKode: 'PAI-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XI-1, XI-2, XI-3, XI-4, XI-5, XII-1, XII-2, XII-3, XII-4, XII-5', jam: 28 },
    { guruIdx: 10, mapelKode: 'SUN-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XI-1, XI-2, XI-3, XI-4, XI-5', jam: 20 },
    { guruIdx: 10, mapelKode: 'PJK-01', kelas: 'X-1, X-2, X-3, X-4, X-5, XII-1, XII-2, XII-3, XII-4, XII-5', jam: 20 },
  ];

  for (const gm of guruMapelAssignments) {
    const guru = guruUsers[gm.guruIdx];
    const mapel = mapelMap[gm.mapelKode];
    await prisma.guruMapel.upsert({
      where: { guru_id_mata_pelajaran_id: { guru_id: guru.id, mata_pelajaran_id: mapel.id } },
      update: { kelas_diampu: gm.kelas, jam_per_minggu: gm.jam },
      create: {
        guru_id: guru.id,
        mata_pelajaran_id: mapel.id,
        kelas_diampu: gm.kelas,
        jam_per_minggu: gm.jam,
      },
    });
    console.log(`   ✅ ${guru.nama_lengkap} → ${mapel.nama} (${gm.jam} jp/minggu)`);
  }
  console.log('');

  // ══════════════════════════════════════════════
  // 8. ROMBEL + ROMBEL SISWA (Distribute 100 siswa)
  // ══════════════════════════════════════════════
  console.log('🎒 8. Seeding Rombel + distribusi siswa...');

  // Student distribution plan:
  // Kelas XII (30 siswa, idx 0-29)  → enrolled since 2023/2024
  // Kelas XI  (35 siswa, idx 30-64) → enrolled since 2024/2025
  // Kelas X   (35 siswa, idx 65-99) → enrolled since 2025/2026
  const distribution = [
    // XII students (30) — have been in school 3 years
    { siswaRange: [0, 29],   currentTingkat: 'XII', history: [
      { ta: '2023/2024', tingkat: 'X' },
      { ta: '2024/2025', tingkat: 'XI' },
      { ta: '2025/2026', tingkat: 'XII' },
    ]},
    // XI students (35) — have been in school 2 years
    { siswaRange: [30, 64],  currentTingkat: 'XI', history: [
      { ta: '2024/2025', tingkat: 'X' },
      { ta: '2025/2026', tingkat: 'XI' },
    ]},
    // X students (35) — first year
    { siswaRange: [65, 99],  currentTingkat: 'X', history: [
      { ta: '2025/2026', tingkat: 'X' },
    ]},
  ];

  const rombelMap = {}; // "kelasNama|taKode" -> record

  for (const dist of distribution) {
    const studentCount = dist.siswaRange[1] - dist.siswaRange[0] + 1;
    const studentsInGroup = siswaUsers.slice(dist.siswaRange[0], dist.siswaRange[1] + 1);

    for (const histEntry of dist.history) {
      const ta = tahunAjaranMap[histEntry.ta];
      // Distribute across 5 classes of this tingkat
      for (let classNum = 1; classNum <= 5; classNum++) {
        const kelasNama = `${histEntry.tingkat}-${classNum}`;
        const mk = masterKelasMap[kelasNama];
        if (!mk) continue;

        // Create rombel
        const rombel = await prisma.rombel.upsert({
          where: { master_kelas_id_tahun_ajaran_id: { master_kelas_id: mk.id, tahun_ajaran_id: ta.id } },
          update: {},
          create: {
            master_kelas_id: mk.id,
            tahun_ajaran_id: ta.id,
            wali_kelas_id: kelasNama === 'X-1' ? waliKelas.id : null,
          },
        });
        rombelMap[`${kelasNama}|${histEntry.ta}`] = rombel;

        // Assign students to this class (only for current ta matching current kelas)
        if (histEntry.ta === dist.history[dist.history.length - 1].ta) {
          // This is the CURRENT year assignment
          const perClass = Math.floor(studentCount / 5);
          const extra = studentCount % 5;
          const startIdx = (classNum - 1) * perClass + Math.min(classNum - 1, extra);
          const count = perClass + (classNum <= extra ? 1 : 0);

          for (let s = startIdx; s < startIdx + count && s < studentsInGroup.length; s++) {
            const siswa = studentsInGroup[s];
            await prisma.rombelSiswa.upsert({
              where: { rombel_id_siswa_id: { rombel_id: rombel.id, siswa_id: siswa.id } },
              update: {},
              create: { rombel_id: rombel.id, siswa_id: siswa.id },
            });
          }
        }
      }
    }
  }
  console.log(`   ✅ Rombel created for all kelas × tahun ajaran`);
  console.log(`   ✅ 100 siswa distributed across kelas\n`);

  // ══════════════════════════════════════════════
  // 9. JADWAL PELAJARAN (untuk tahun aktif)
  // ══════════════════════════════════════════════
  console.log('📆 9. Seeding Jadwal Pelajaran...');

  const hariList = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  const slotTimes = [
    { mulai: '07:00', selesai: '07:45' },
    { mulai: '07:45', selesai: '08:30' },
    { mulai: '08:30', selesai: '09:15' },
    { mulai: '09:30', selesai: '10:15' },
    { mulai: '10:15', selesai: '11:00' },
    { mulai: '11:00', selesai: '11:45' },
    { mulai: '13:00', selesai: '13:45' },
    { mulai: '13:45', selesai: '14:30' },
  ];

  // Create jadwal for X-1 and X-2 as representative (full schedule)
  const jadwalRecords = [];
  const jadwalClasses = ['X-1', 'X-2'];
  const mapelKodes = Object.keys(mapelMap);

  for (const kelasNama of jadwalClasses) {
    const mk = masterKelasMap[kelasNama];
    if (!mk) continue;

    let slotCounter = 0;
    for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
      // 6 slots per day (skip 2 afternoon slots on Friday)
      const slotsToday = dayIdx === 4 ? 4 : 6;
      for (let s = 0; s < slotsToday; s++) {
        const mapelKode = mapelKodes[slotCounter % mapelKodes.length];
        const mapel = mapelMap[mapelKode];

        // Find a guru who teaches this mapel
        const assignment = guruMapelAssignments.find(a => a.mapelKode === mapelKode);
        const guruId = assignment ? guruUsers[assignment.guruIdx].id : guruUsers[0].id;

        // Pick a room
        let ruangId = null;
        if (mapelKode === 'FIS-01') ruangId = ruangMap['LAB-FIS']?.id;
        else if (mapelKode === 'KIM-01') ruangId = ruangMap['LAB-KIM']?.id;
        else if (mapelKode === 'PJK-01') ruangId = ruangMap['LAP-OR']?.id;
        else ruangId = mk.ruang_kelas_id;

        const jadwal = await prisma.jadwalPelajaran.create({
          data: {
            master_kelas_id: mk.id,
            mata_pelajaran_id: mapel.id,
            guru_id: guruId,
            ruang_kelas_id: ruangId,
            hari: hariList[dayIdx],
            jam_mulai: slotTimes[s].mulai,
            jam_selesai: slotTimes[s].selesai,
            slot_index: s,
          },
        });
        jadwalRecords.push(jadwal);
        slotCounter++;
      }
    }
  }
  console.log(`   ✅ ${jadwalRecords.length} jadwal entries created\n`);

  // ══════════════════════════════════════════════
  // 10. NILAI / RAPOR (for every student × every semester they attended)
  // ══════════════════════════════════════════════
  console.log('📊 10. Seeding Nilai (Rapor) — this may take a moment...');

  let nilaiCount = 0;
  const allMapelIds = Object.values(mapelMap).map(m => m.id);
  const allMapelKkm = {};
  for (const mp of mapelData) {
    allMapelKkm[mapelMap[mp.kode].id] = mp.kkm;
  }

  for (const dist of distribution) {
    const studentsInGroup = siswaUsers.slice(dist.siswaRange[0], dist.siswaRange[1] + 1);

    // Determine which semesters this group has attended
    const semesters = [];
    for (const histEntry of dist.history) {
      semesters.push(semesterMap[`${histEntry.ta}|Semester Ganjil`]);
      // For the current active year's Genap, still include (ongoing)
      semesters.push(semesterMap[`${histEntry.ta}|Semester Genap`]);
    }

    for (const siswa of studentsInGroup) {
      // Generate a "base ability" for this student (60-95)
      const baseAbility = rand(60, 95);

      for (const sem of semesters) {
        if (!sem) continue;

        for (const mapelId of allMapelIds) {
          const kkm = allMapelKkm[mapelId] || 75;
          // Randomize around base ability (+/- 10)
          const t   = Math.min(100, Math.max(30, baseAbility + rand(-10, 10)));
          const uh  = Math.min(100, Math.max(30, baseAbility + rand(-10, 10)));
          const uts = Math.min(100, Math.max(30, baseAbility + rand(-8, 8)));
          const uas = Math.min(100, Math.max(30, baseAbility + rand(-8, 8)));
          const kea = Math.min(100, Math.max(40, baseAbility + rand(-5, 15)));
          const keh = Math.min(100, Math.max(50, baseAbility + rand(-5, 20)));
          const na  = calcNilaiAkhir(t, uh, uts, uas, kea, keh);
          const p   = predikat(na);

          await prisma.nilai.upsert({
            where: {
              siswa_id_mata_pelajaran_id_semester_id: {
                siswa_id: siswa.id,
                mata_pelajaran_id: mapelId,
                semester_id: sem.id,
              },
            },
            update: {
              nilai_tugas: t, nilai_uh: uh, nilai_uts: uts, nilai_uas: uas,
              nilai_keaktifan: kea, nilai_kehadiran: keh,
              nilai_akhir: na, predikat: p,
            },
            create: {
              siswa_id: siswa.id,
              mata_pelajaran_id: mapelId,
              semester_id: sem.id,
              nilai_tugas: t, nilai_uh: uh, nilai_uts: uts, nilai_uas: uas,
              nilai_keaktifan: kea, nilai_kehadiran: keh,
              bobot_tugas: 20, bobot_uh: 20, bobot_uts: 20, bobot_uas: 20,
              bobot_keaktifan: 10, bobot_kehadiran: 10,
              nilai_akhir: na, predikat: p,
            },
          });
          nilaiCount++;
        }
      }
    }
    console.log(`   📝 ${dist.currentTingkat}: ${studentsInGroup.length} siswa × ${semesters.filter(Boolean).length} semester × 12 mapel`);
  }
  console.log(`   ✅ ${nilaiCount} nilai records created\n`);

  // ══════════════════════════════════════════════
  // 11. KEHADIRAN (sample attendance for current semester)
  // ══════════════════════════════════════════════
  console.log('📋 11. Seeding Kehadiran (sample)...');

  const statusList = ['HADIR', 'HADIR', 'HADIR', 'HADIR', 'HADIR', 'HADIR', 'HADIR', 'HADIR', 'SAKIT', 'IZIN', 'ALPA'];
  // Use some jadwal from X-1 and X-2
  const sampleJadwal = jadwalRecords.slice(0, 10);
  const sampleSiswa = siswaUsers.slice(65, 79); // 14 students from X-1 & X-2
  let kehadiranCount = 0;

  // Generate 8 weeks of attendance (Jan–Mar 2026)
  for (let week = 1; week <= 8; week++) {
    const baseDate = new Date(2026, 0, 6 + (week - 1) * 7); // Starting from Jan 6, 2026

    for (const jadwal of sampleJadwal) {
      const dayOffset = hariList.indexOf(jadwal.hari);
      if (dayOffset < 0) continue;

      const date = new Date(baseDate);
      date.setDate(date.getDate() + dayOffset);
      const tanggal = date.toISOString().split('T')[0];

      for (const siswa of sampleSiswa) {
        const status = pick(statusList);
        try {
          await prisma.kehadiran.upsert({
            where: {
              siswa_id_jadwal_id_tanggal: {
                siswa_id: siswa.id,
                jadwal_id: jadwal.id,
                tanggal,
              },
            },
            update: { status },
            create: {
              siswa_id: siswa.id,
              jadwal_id: jadwal.id,
              tanggal,
              status,
              pertemuan_ke: week,
              topik: `Materi Pertemuan ${week}`,
              keterangan: status !== 'HADIR' ? `Keterangan ${status.toLowerCase()} minggu ke-${week}` : null,
            },
          });
          kehadiranCount++;
        } catch (_) { /* skip duplicates */ }
      }
    }
  }
  console.log(`   ✅ ${kehadiranCount} kehadiran records created\n`);

  // ══════════════════════════════════════════════
  // 12. JURNAL MENGAJAR (sample)
  // ══════════════════════════════════════════════
  console.log('📓 12. Seeding Jurnal Mengajar...');
  let jurnalCount = 0;

  const topikMateri = [
    'Pengenalan Materi Semester Genap',
    'Pembahasan Soal Latihan',
    'Diskusi Kelompok dan Presentasi',
    'Praktikum dan Eksperimen',
    'Review Materi UTS',
    'Ujian Tengah Semester',
    'Analisis Hasil UTS',
    'Proyek Akhir Semester',
  ];

  for (let week = 1; week <= 8; week++) {
    const baseDate = new Date(2026, 0, 6 + (week - 1) * 7);

    // Only for a subset of jadwal to keep it manageable
    for (const jadwal of sampleJadwal.slice(0, 5)) {
      const dayOffset = hariList.indexOf(jadwal.hari);
      if (dayOffset < 0) continue;

      const date = new Date(baseDate);
      date.setDate(date.getDate() + dayOffset);
      const tanggal = date.toISOString().split('T')[0];

      try {
        await prisma.jurnalMengajar.upsert({
          where: { jadwal_id_tanggal: { jadwal_id: jadwal.id, tanggal } },
          update: {},
          create: {
            jadwal_id: jadwal.id,
            guru_id: jadwal.guru_id,
            tanggal,
            pertemuan_ke: week,
            judul_materi: topikMateri[week - 1] || `Materi Pertemuan ${week}`,
            deskripsi_kegiatan: `Kegiatan pembelajaran pertemuan ke-${week}. Siswa mengikuti pelajaran dengan baik. ${week > 4 ? 'Persiapan menuju UAS.' : 'Pendalaman materi dasar.'}`,
          },
        });
        jurnalCount++;
      } catch (_) { /* skip duplicates */ }
    }
  }
  console.log(`   ✅ ${jurnalCount} jurnal mengajar records created\n`);

  // ══════════════════════════════════════════════
  // 13. CATATAN AKADEMIK (sample from wali kelas)
  // ══════════════════════════════════════════════
  console.log('📝 13. Seeding Catatan Akademik...');

  const catatanTemplates = [
    'Siswa menunjukkan perkembangan yang baik dalam bidang akademik dan non-akademik.',
    'Perlu peningkatan dalam keaktifan di kelas dan pengumpulan tugas tepat waktu.',
    'Siswa memiliki potensi yang sangat baik. Pertahankan prestasi dan tingkatkan kedisiplinan.',
    'Kehadiran perlu ditingkatkan. Disarankan untuk lebih aktif dalam kegiatan sekolah.',
    'Siswa sangat aktif dan berprestasi. Direkomendasikan untuk mengikuti olimpiade.',
    'Rata-rata nilai cukup baik. Perlu bimbingan tambahan untuk mata pelajaran eksak.',
    'Perilaku dan sikap sangat baik. Potensi kepemimpinan terlihat dalam kegiatan OSIS.',
  ];

  const currentGanjil = semesterMap['2025/2026|Semester Ganjil'];
  let catatanCount = 0;

  if (currentGanjil) {
    // Catatan for X-1 students (wali kelas's class)
    const x1Students = siswaUsers.slice(65, 72); // ~7 siswa in X-1
    for (const siswa of x1Students) {
      try {
        await prisma.catatanAkademik.upsert({
          where: { siswa_id_semester_id: { siswa_id: siswa.id, semester_id: currentGanjil.id } },
          update: {},
          create: {
            siswa_id: siswa.id,
            semester_id: currentGanjil.id,
            wali_kelas_id: waliKelas.id,
            catatan: pick(catatanTemplates),
          },
        });
        catatanCount++;
      } catch (_) { /* skip */ }
    }
  }
  console.log(`   ✅ ${catatanCount} catatan akademik created\n`);

  // ══════════════════════════════════════════════
  // 14. KONTEN PUBLIK (CMS)
  // ══════════════════════════════════════════════
  console.log('📰 14. Seeding Konten Publik (CMS)...');

  const cmsItems = [
    {
      tipe: 'HERO',
      judul: 'Selamat Datang di SMAN 1 Cikalong',
      konten: 'Membentuk generasi unggul, berkarakter, dan berprestasi. Bersama kita wujudkan pendidikan berkualitas untuk masa depan bangsa.',
      gambar_url: '/placeholder/hero-school.jpg',
      urutan: 1,
    },
    {
      tipe: 'HERO',
      judul: 'Pendaftaran Peserta Didik Baru 2026/2027',
      konten: 'Segera daftarkan putra-putri Anda. Kuota terbatas!',
      gambar_url: '/placeholder/hero-ppdb.jpg',
      urutan: 2,
    },
    {
      tipe: 'BERITA',
      judul: 'Penerimaan Peserta Didik Baru 2026/2027 Dibuka',
      konten: 'SMAN 1 Cikalong membuka pendaftaran peserta didik baru untuk tahun ajaran 2026/2027. Pendaftaran online dibuka mulai 1 Mei 2026. Kuota terbatas 180 siswa.',
      gambar_url: '/placeholder/ppdb.jpg',
      urutan: 1,
    },
    {
      tipe: 'BERITA',
      judul: 'Ujian Akhir Semester Genap 2025/2026',
      konten: 'Ujian Akhir Semester Genap tahun ajaran 2025/2026 akan dilaksanakan pada tanggal 10-20 Juni 2026. Seluruh siswa diharapkan mempersiapkan diri dengan baik.',
      gambar_url: '/placeholder/ujian.jpg',
      urutan: 2,
    },
    {
      tipe: 'BERITA',
      judul: 'Peringatan Hari Pendidikan Nasional',
      konten: 'SMAN 1 Cikalong menggelar upacara dan aneka lomba dalam rangka Hari Pendidikan Nasional 2 Mei 2026.',
      gambar_url: '/placeholder/hardiknas.jpg',
      urutan: 3,
    },
    {
      tipe: 'PRESTASI',
      judul: 'Juara 1 Olimpiade Matematika Tingkat Provinsi',
      konten: 'Siswa kelas XII-1 berhasil meraih Juara 1 Olimpiade Matematika Tingkat Provinsi Jawa Barat tahun 2026. Selamat!',
      gambar_url: '/placeholder/prestasi-mtk.jpg',
      urutan: 1,
    },
    {
      tipe: 'PRESTASI',
      judul: 'Finalis Lomba Debat Bahasa Inggris Nasional',
      konten: 'Tim debat SMAN 1 Cikalong berhasil masuk final Lomba Debat Bahasa Inggris antar SMA se-Indonesia.',
      gambar_url: '/placeholder/prestasi-debat.jpg',
      urutan: 2,
    },
    {
      tipe: 'PRESTASI',
      judul: 'Juara 2 Olimpiade Sains Nasional — Fisika',
      konten: 'Siswa kelas XI-2 meraih perak pada ajang OSN bidang Fisika 2025.',
      gambar_url: '/placeholder/prestasi-fisika.jpg',
      urutan: 3,
    },
    {
      tipe: 'VIDEO',
      judul: 'Profil SMAN 1 Cikalong 2026',
      konten: 'Video profil sekolah yang menampilkan fasilitas, kegiatan, dan prestasi SMAN 1 Cikalong.',
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      urutan: 1,
    },
    {
      tipe: 'VIDEO',
      judul: 'Wisuda Angkatan 2025',
      konten: 'Dokumentasi acara wisuda dan pelepasan siswa angkatan 2025.',
      video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      urutan: 2,
    },
  ];

  // Clear old CMS and re-seed
  await prisma.kontenPublik.deleteMany({});
  await prisma.kontenPublik.createMany({ data: cmsItems });
  console.log(`   ✅ ${cmsItems.length} konten CMS created\n`);

  // ══════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════
  console.log('══════════════════════════════════════════════════');
  console.log('  🎉 SEEDING SELESAI!');
  console.log('══════════════════════════════════════════════════');
  console.log('');
  console.log('  📊 Data Summary:');
  console.log('  ├─ Roles:          6');
  console.log('  ├─ Admin:          1');
  console.log('  ├─ Kurikulum:      1');
  console.log('  ├─ Guru Mapel:     10');
  console.log('  ├─ Wali Kelas:     1 (also teaches)');
  console.log('  ├─ Siswa:          100 (with full profiles)');
  console.log('  ├─ Tahun Ajaran:   3 (2023/2024 → 2025/2026)');
  console.log('  ├─ Semester:       6');
  console.log('  ├─ Mata Pelajaran: 12');
  console.log('  ├─ Ruang Kelas:    18');
  console.log('  ├─ Master Kelas:   15 (X-1..X-5, XI-1..XI-5, XII-1..XII-5)');
  console.log('  ├─ Guru-Mapel:     13 mappings');
  console.log(`  ├─ Nilai (Rapor):  ${nilaiCount} records`);
  console.log(`  ├─ Kehadiran:      ${kehadiranCount} records`);
  console.log(`  ├─ Jurnal:         ${jurnalCount} records`);
  console.log(`  ├─ Catatan:        ${catatanCount} records`);
  console.log(`  └─ CMS:            ${cmsItems.length} konten`);
  console.log('');
  console.log('  🔑 Login Credentials (password: password123):');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │ admin@siakad.sch.id          → Administrator       │');
  console.log('  │ kurikulum@siakad.sch.id      → Kurikulum           │');
  console.log('  │ guru1@siakad.sch.id          → Guru Mapel          │');
  console.log('  │ guru2@siakad.sch.id          → Guru Mapel          │');
  console.log('  │ ...                          → (guru3-guru10)      │');
  console.log('  │ walikelas@siakad.sch.id      → Wali Kelas          │');
  console.log('  │ siswa001@siakad.sch.id       → Siswa               │');
  console.log('  │ siswa002@siakad.sch.id       → Siswa               │');
  console.log('  │ ...                          → (siswa003-siswa100) │');
  console.log('  └─────────────────────────────────────────────────────┘');
  console.log('');

  await prisma.$disconnect();
  await pool.end();
}

main()
  .catch((e) => {
    console.error('❌ Seed Error:', e);
    process.exit(1);
  });