const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    await prisma.user.update({
      where: { email: 'admin@siakad.sch.id' },
      data: {
        profile: {
          upsert: {
            create: { nik: '123' },
            update: { nik: '123' }
          }
        }
      }
    });
    console.log('success');
  } catch(e) {
    console.log('Error:', e.message);
  }
  await prisma.$disconnect();
}

run();
