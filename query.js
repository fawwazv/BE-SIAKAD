const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const roles = await prisma.role.findMany()
  console.log('All roles:', roles.map(r => `${r.id}: ${r.nama_role}`).join('\n'))
  
  const masterKelas = await prisma.masterKelas.findMany({ take: 3 })
  console.log('\nSample Master Kelas:', masterKelas.map(k => `${k.id.slice(0,8)}: ${k.nama}`).join('\n'))
  
  const ruang = await prisma.ruangKelas.findMany({ take: 3 })
  console.log('\nSample Ruang Kelas:', ruang.map(r => `${r.id.slice(0,8)}: ${r.kode} (cap: ${r.kapasitas})`).join('\n'))
  
  const guruMapel = await prisma.user.findMany({ 
    where: { role: { nama_role: { in: ['Guru Mapel', 'Wali Kelas', 'Guru'] } } },
    select: { id: true, nama_lengkap: true, role: { select: { nama_role: true } } }
  })
  console.log('\nGuru tersedia:', guruMapel.map(g => `${g.nama_lengkap} [${g.role.nama_role}]`).join('\n'))
  
  const activeTahun = await prisma.tahunAjaran.findFirst({ where: { is_active: true } })
  console.log('\nTahun Ajaran Aktif:', activeTahun?.kode ?? 'TIDAK ADA!')
}
main().finally(() => prisma.$disconnect())
