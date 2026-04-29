// prisma/seed_jadwal.js
// ═══════════════════════════════════════════════
// Seed Jadwal Pelajaran untuk SEMUA kelas
// Aturan: Istirahat 09:00-10:00 & 12:00-13:00, Pulang 16:00
// Constraint: @@unique([master_kelas_id, hari, slot_index])
// Anti double-booking: 1 guru tidak bisa mengajar 2 kelas di slot & hari yang sama
// ═══════════════════════════════════════════════
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Slot waktu valid (diluar jam istirahat, sebelum 16:00) ──
// Slot index bersifat GLOBAL per hari (sama untuk semua kelas)
const VALID_SLOTS = [
  { idx: 0, mulai: '07:00', selesai: '07:45' },
  { idx: 1, mulai: '07:45', selesai: '08:30' },
  // 08:30–09:00: sisa waktu sebelum istirahat (skip, tidak cukup 45 menit)
  // ISTIRAHAT 1: 09:00–10:00
  { idx: 2, mulai: '10:00', selesai: '10:45' },
  { idx: 3, mulai: '10:45', selesai: '11:30' },
  // 11:30–12:00: sisa waktu sebelum istirahat (skip)
  // ISTIRAHAT 2: 12:00–13:00
  { idx: 4, mulai: '13:00', selesai: '13:45' },
  { idx: 5, mulai: '13:45', selesai: '14:30' },
  { idx: 6, mulai: '14:30', selesai: '15:15' },
  { idx: 7, mulai: '15:15', selesai: '16:00' },
];

const HARI_LIST = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

async function main() {
  console.log('🌱 Seeding Jadwal Pelajaran untuk SEMUA kelas...');
  console.log('══════════════════════════════════════════════\n');

  // 1. Hapus jadwal lama
  const deleted = await prisma.jadwalPelajaran.deleteMany({});
  console.log(`   🗑️  ${deleted.count} jadwal lama dihapus.\n`);

  // 2. Ambil data master
  const masterKelas = await prisma.masterKelas.findMany({
    orderBy: { nama: 'asc' },
  });
  const guruMapelAll = await prisma.guruMapel.findMany({
    include: { guru: true, mata_pelajaran: true },
  });

  if (masterKelas.length === 0 || guruMapelAll.length === 0) {
    console.error('❌ Tidak ada data kelas atau pemetaan guru. Jalankan seed.js terlebih dahulu!');
    return;
  }

  console.log(`   📊 ${masterKelas.length} kelas ditemukan.`);
  console.log(`   📊 ${guruMapelAll.length} pemetaan guru-mapel ditemukan.\n`);

  // 3. Global teacher-busy tracker: teacherBusy[guruId][hari][slotIdx] = true
  const teacherBusy = {};

  function isTeacherBusy(guruId, hari, slotIdx) {
    return !!(teacherBusy[guruId]?.[hari]?.[slotIdx]);
  }
  function markTeacherBusy(guruId, hari, slotIdx) {
    if (!teacherBusy[guruId]) teacherBusy[guruId] = {};
    if (!teacherBusy[guruId][hari]) teacherBusy[guruId][hari] = {};
    teacherBusy[guruId][hari][slotIdx] = true;
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  const guruUsed = new Set(); // track guru yang berhasil dijadwalkan

  // 4. Loop setiap kelas
  for (const kelas of masterKelas) {
    // Cari pemetaan guru-mapel untuk kelas ini
    const assignments = guruMapelAll.filter(gm => {
      const classes = gm.kelas_diampu.split(',').map(c => c.trim());
      return classes.includes(kelas.nama);
    });

    if (assignments.length === 0) {
      console.log(`   ⚠️  ${kelas.nama}: tidak ada guru yang dipetakan. Dilewati.`);
      continue;
    }

    console.log(`   🏛️  ${kelas.nama} (${assignments.length} guru-mapel)...`);
    let kelasCreated = 0;
    let rotateIdx = 0; // rotate mapel per slot agar semua mapel terwakili

    for (const hari of HARI_LIST) {
      for (const slot of VALID_SLOTS) {
        // Cari guru yang tersedia di slot ini untuk kelas ini
        let assigned = false;

        for (let attempt = 0; attempt < assignments.length; attempt++) {
          const gm = assignments[(rotateIdx + attempt) % assignments.length];

          if (!isTeacherBusy(gm.guru_id, hari, slot.idx)) {
            // Guru tersedia → buat jadwal
            await prisma.jadwalPelajaran.create({
              data: {
                master_kelas_id:   kelas.id,
                mata_pelajaran_id: gm.mata_pelajaran_id,
                guru_id:           gm.guru_id,
                ruang_kelas_id:    kelas.ruang_kelas_id ?? null,
                hari:              hari,
                jam_mulai:         slot.mulai,
                jam_selesai:       slot.selesai,
                slot_index:        slot.idx,
              },
            });

            markTeacherBusy(gm.guru_id, hari, slot.idx);
            guruUsed.add(gm.guru_id);
            rotateIdx = (rotateIdx + attempt + 1) % assignments.length;
            assigned = true;
            kelasCreated++;
            totalCreated++;
            break;
          }
        }

        if (!assigned) {
          // Semua guru untuk kelas ini sibuk di slot ini
          // Fallback: ambil guru pertama (paksa double-booking jika perlu agar hari tetap terisi)
          const fallback = assignments[rotateIdx % assignments.length];
          // Cek apakah slot ini SUDAH diisi kelas lain oleh guru ini
          // Karena constraint @@unique adalah per kelas, kita bisa izinkan
          // (guru mengajar kelas berbeda; tidak ada unique constraint antar kelas)
          const guruAlreadyThere = guruMapelAll.find(g =>
            g.guru_id === fallback.guru_id &&
            isTeacherBusy(fallback.guru_id, hari, slot.idx)
          );

          if (guruAlreadyThere) {
            // Guru benar-benar sedang mengajar kelas lain — log saja, jangan force
            totalSkipped++;
          } else {
            // Harusnya tidak terjadi
            totalSkipped++;
          }
        }
      }
    }

    console.log(`         ✅ ${kelasCreated} slot dijadwalkan`);
  }

  // 5. Cek guru yang belum pernah dijadwalkan sama sekali
  console.log('\n══════════════════════════════════════════════');
  console.log(`✅ Total jadwal dibuat : ${totalCreated}`);
  console.log(`⚠️  Total slot dilewati: ${totalSkipped}`);

  const guruBelumDijadwal = guruMapelAll.filter(gm => !guruUsed.has(gm.guru_id));
  if (guruBelumDijadwal.length > 0) {
    console.log('\n⚠️  Guru berikut BELUM masuk jadwal (semua slot bentrok):');
    guruBelumDijadwal.forEach(gm => {
      console.log(`   - ${gm.guru.nama_lengkap} → ${gm.mata_pelajaran.nama}`);
    });
  } else {
    console.log('✅ Semua guru sudah masuk setidaknya 1 jadwal!');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
