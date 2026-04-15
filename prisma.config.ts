// prisma.config.ts
import { defineConfig } from '@prisma/config';

export default defineConfig({
  // Kita ganti 'migrate' menjadi 'datasource' sesuai permintaan error Prisma
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
});