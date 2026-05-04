-- Allow teachers to create multiple journal/attendance sessions on the same day
-- as long as the meeting number is different.

ALTER TABLE "JurnalMengajar" DROP CONSTRAINT IF EXISTS "JurnalMengajar_jadwal_id_tanggal_key";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JurnalMengajar_jadwal_id_pertemuan_ke_key'
  ) THEN
    ALTER TABLE "JurnalMengajar" ADD CONSTRAINT "JurnalMengajar_jadwal_id_pertemuan_ke_key" UNIQUE ("jadwal_id", "pertemuan_ke");
  END IF;
END $$;

ALTER TABLE "Kehadiran" DROP CONSTRAINT IF EXISTS "Kehadiran_siswa_id_jadwal_id_tanggal_key";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Kehadiran_siswa_id_jadwal_id_pertemuan_ke_key'
  ) THEN
    ALTER TABLE "Kehadiran" ADD CONSTRAINT "Kehadiran_siswa_id_jadwal_id_pertemuan_ke_key" UNIQUE ("siswa_id", "jadwal_id", "pertemuan_ke");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SesiAbsensi_jadwal_id_pertemuan_ke_idx" ON "SesiAbsensi"("jadwal_id", "pertemuan_ke");
