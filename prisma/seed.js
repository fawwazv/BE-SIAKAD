// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Memulai proses seeding...');

  // 1. Buat Semua Role sesuai dokumen SRS
  const roles = ['Administrator', 'Kurikulum', 'Wali Kelas', 'Guru Mapel', 'Siswa'];
  
  for (const roleName of roles) {
    // upsert: update atau insert (kalau belum ada, buat baru. Kalau sudah ada, biarkan)
    await prisma.role.upsert({
      where: { nama_role: roleName },
      update: {},
      create: { nama_role: roleName },
    });
  }
  console.log('✅ Data Role berhasil dibuat!');

  // 2. Ambil ID dari Role Administrator
  const adminRole = await prisma.role.findUnique({
    where: { nama_role: 'Administrator' },
  });

  // 3. Buat Akun Super Admin Pertama
  const passwordPlain = 'AdminSiakad123!';
  const hashedPassword = await bcrypt.hash(passwordPlain, 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@sman1cikalong.sch.id' },
    update: {},
    create: {
      email: 'admin@sman1cikalong.sch.id',
      password_hash: hashedPassword,
      role_id: adminRole.id,
      status_aktif: true,
    },
  });

  console.log('✅ Akun Admin pertama berhasil dibuat!');
  console.log('-----------------------------------');
  console.log('Email    :', admin.email);
  console.log('Password :', passwordPlain);
  console.log('-----------------------------------');
}

main()
  .catch((e) => {
    console.error('Error saat seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });