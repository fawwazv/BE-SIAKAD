// prisma.config.ts
import { defineConfig } from '@prisma/config';
import { config } from 'dotenv';

// Baris ini SANGAT KRUSIAL agar sistem bisa membaca file .env
config();

export default defineConfig({
  migrations: {
    seed: 'node ./prisma/seed.js',
  },
  datasource: {
    // Sekarang sistem pasti bisa menemukan URL dari Supabase
    url: process.env.DATABASE_URL as string,
  },
});