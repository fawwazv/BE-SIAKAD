CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "nama_role" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "auth_user_id" UUID,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nama_lengkap" TEXT NOT NULL DEFAULT '',
    "nomor_induk" TEXT,
    "role_id" INTEGER NOT NULL,
    "status_aktif" BOOLEAN NOT NULL DEFAULT true,
    "is_sso_allowed" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "force_password_change" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMP(3),
    "session_version" INTEGER NOT NULL DEFAULT 1,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "jenis_kelamin" TEXT,
    "tanggal_lahir" TEXT,
    "tempat_lahir" TEXT,
    "agama" TEXT,
    "nik" TEXT,
    "nama_ibu_kandung" TEXT,
    "status_perkawinan" TEXT,
    "provinsi" TEXT,
    "kota_kabupaten" TEXT,
    "kecamatan" TEXT,
    "kelurahan" TEXT,
    "detail_alamat" TEXT,
    "rt" TEXT,
    "rw" TEXT,
    "kode_pos" TEXT,
    "personal_email" TEXT,
    "personal_email_pending" TEXT,
    "personal_email_verified_at" TIMESTAMP(3),

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_email_otps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_email_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_auth_user_id" UUID,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_security_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_user_id" UUID,
    "academic_user_id" TEXT,
    "event" TEXT NOT NULL,
    "provider" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TahunAjaran" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TahunAjaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "tahun_ajaran_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuangKelas" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "gedung" TEXT NOT NULL,
    "kapasitas" INTEGER NOT NULL,

    CONSTRAINT "RuangKelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterKelas" (
    "id" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "tingkat" TEXT NOT NULL,
    "wali_kelas_id" TEXT,
    "ruang_kelas_id" TEXT,

    CONSTRAINT "MasterKelas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MataPelajaran" (
    "id" TEXT NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "kategori" TEXT NOT NULL,
    "kkm" INTEGER NOT NULL DEFAULT 75,
    "deskripsi" TEXT,

    CONSTRAINT "MataPelajaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuruMapel" (
    "id" TEXT NOT NULL,
    "guru_id" TEXT NOT NULL,
    "mata_pelajaran_id" TEXT NOT NULL,
    "kelas_diampu" TEXT NOT NULL,
    "jam_per_minggu" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuruMapel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rombel" (
    "id" TEXT NOT NULL,
    "master_kelas_id" TEXT NOT NULL,
    "tahun_ajaran_id" TEXT NOT NULL,
    "wali_kelas_id" TEXT,
    "ruang_kelas_id" TEXT,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Rombel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RombelSiswa" (
    "id" TEXT NOT NULL,
    "rombel_id" TEXT NOT NULL,
    "siswa_id" TEXT NOT NULL,
    "status_promosi" TEXT,

    CONSTRAINT "RombelSiswa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JadwalPelajaran" (
    "id" TEXT NOT NULL,
    "master_kelas_id" TEXT NOT NULL,
    "mata_pelajaran_id" TEXT NOT NULL,
    "guru_id" TEXT NOT NULL,
    "ruang_kelas_id" TEXT,
    "hari" TEXT NOT NULL,
    "jam_mulai" TEXT NOT NULL,
    "jam_selesai" TEXT NOT NULL,
    "slot_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JadwalPelajaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kehadiran" (
    "id" TEXT NOT NULL,
    "siswa_id" TEXT NOT NULL,
    "jadwal_id" TEXT NOT NULL,
    "tanggal" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "keterangan" TEXT,
    "pertemuan_ke" INTEGER,
    "topik" TEXT,
    "qr_token" TEXT,
    "semester_id" TEXT,

    CONSTRAINT "Kehadiran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nilai" (
    "id" TEXT NOT NULL,
    "siswa_id" TEXT NOT NULL,
    "mata_pelajaran_id" TEXT NOT NULL,
    "semester_id" TEXT NOT NULL,
    "nilai_tugas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nilai_uh" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nilai_uts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nilai_uas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nilai_keaktifan" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nilai_kehadiran" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bobot_tugas" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "bobot_uh" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "bobot_uts" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "bobot_uas" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "bobot_keaktifan" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "bobot_kehadiran" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "nilai_akhir" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "predikat" TEXT NOT NULL DEFAULT '-',

    CONSTRAINT "Nilai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KontenPublik" (
    "id" TEXT NOT NULL,
    "tipe" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "konten" TEXT,
    "gambar_url" TEXT,
    "video_url" TEXT,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KontenPublik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurnalMengajar" (
    "id" TEXT NOT NULL,
    "jadwal_id" TEXT NOT NULL,
    "guru_id" TEXT NOT NULL,
    "tanggal" TEXT NOT NULL,
    "pertemuan_ke" INTEGER NOT NULL,
    "judul_materi" TEXT NOT NULL,
    "deskripsi_kegiatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurnalMengajar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatatanAkademik" (
    "id" TEXT NOT NULL,
    "siswa_id" TEXT NOT NULL,
    "semester_id" TEXT NOT NULL,
    "wali_kelas_id" TEXT NOT NULL,
    "catatan" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatatanAkademik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesiAbsensi" (
    "id" TEXT NOT NULL,
    "jadwal_id" TEXT NOT NULL,
    "guru_id" TEXT NOT NULL,
    "tanggal" TEXT NOT NULL,
    "pertemuan_ke" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expired_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesiAbsensi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_nama_role_key" ON "Role"("nama_role");

-- CreateIndex
CREATE UNIQUE INDEX "User_auth_user_id_key" ON "User"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_user_id_key" ON "UserProfile"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_personal_email_key" ON "UserProfile"("personal_email");

-- CreateIndex
CREATE INDEX "user_email_otps_user_id_idx" ON "user_email_otps"("user_id");

-- CreateIndex
CREATE INDEX "user_email_otps_email_idx" ON "user_email_otps"("email");

-- CreateIndex
CREATE INDEX "user_email_otps_purpose_idx" ON "user_email_otps"("purpose");

-- CreateIndex
CREATE INDEX "user_email_otps_expires_at_idx" ON "user_email_otps"("expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_auth_user_id_idx" ON "audit_logs"("actor_auth_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "user_security_events_auth_user_id_idx" ON "user_security_events"("auth_user_id");

-- CreateIndex
CREATE INDEX "user_security_events_academic_user_id_idx" ON "user_security_events"("academic_user_id");

-- CreateIndex
CREATE INDEX "user_security_events_event_idx" ON "user_security_events"("event");

-- CreateIndex
CREATE INDEX "user_security_events_created_at_idx" ON "user_security_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "TahunAjaran_kode_key" ON "TahunAjaran"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_nama_tahun_ajaran_id_key" ON "Semester"("nama", "tahun_ajaran_id");

-- CreateIndex
CREATE UNIQUE INDEX "RuangKelas_kode_key" ON "RuangKelas"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "MasterKelas_nama_tingkat_key" ON "MasterKelas"("nama", "tingkat");

-- CreateIndex
CREATE UNIQUE INDEX "MataPelajaran_kode_key" ON "MataPelajaran"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "GuruMapel_guru_id_mata_pelajaran_id_key" ON "GuruMapel"("guru_id", "mata_pelajaran_id");

-- CreateIndex
CREATE UNIQUE INDEX "Rombel_master_kelas_id_tahun_ajaran_id_key" ON "Rombel"("master_kelas_id", "tahun_ajaran_id");

-- CreateIndex
CREATE UNIQUE INDEX "RombelSiswa_rombel_id_siswa_id_key" ON "RombelSiswa"("rombel_id", "siswa_id");

-- CreateIndex
CREATE UNIQUE INDEX "JadwalPelajaran_master_kelas_id_hari_slot_index_key" ON "JadwalPelajaran"("master_kelas_id", "hari", "slot_index");

-- CreateIndex
CREATE UNIQUE INDEX "Kehadiran_siswa_id_jadwal_id_pertemuan_ke_key" ON "Kehadiran"("siswa_id", "jadwal_id", "pertemuan_ke");

-- CreateIndex
CREATE UNIQUE INDEX "Nilai_siswa_id_mata_pelajaran_id_semester_id_key" ON "Nilai"("siswa_id", "mata_pelajaran_id", "semester_id");

-- CreateIndex
CREATE UNIQUE INDEX "JurnalMengajar_jadwal_id_pertemuan_ke_key" ON "JurnalMengajar"("jadwal_id", "pertemuan_ke");

-- CreateIndex
CREATE UNIQUE INDEX "CatatanAkademik_siswa_id_semester_id_key" ON "CatatanAkademik"("siswa_id", "semester_id");

-- CreateIndex
CREATE UNIQUE INDEX "SesiAbsensi_token_key" ON "SesiAbsensi"("token");

-- CreateIndex
CREATE INDEX "SesiAbsensi_token_idx" ON "SesiAbsensi"("token");

-- CreateIndex
CREATE INDEX "SesiAbsensi_jadwal_id_tanggal_idx" ON "SesiAbsensi"("jadwal_id", "tanggal");

-- CreateIndex
CREATE INDEX "SesiAbsensi_jadwal_id_pertemuan_ke_idx" ON "SesiAbsensi"("jadwal_id", "pertemuan_ke");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_email_otps" ADD CONSTRAINT "user_email_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_security_events" ADD CONSTRAINT "user_security_events_academic_user_id_fkey" FOREIGN KEY ("academic_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_tahun_ajaran_id_fkey" FOREIGN KEY ("tahun_ajaran_id") REFERENCES "TahunAjaran"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterKelas" ADD CONSTRAINT "MasterKelas_wali_kelas_id_fkey" FOREIGN KEY ("wali_kelas_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterKelas" ADD CONSTRAINT "MasterKelas_ruang_kelas_id_fkey" FOREIGN KEY ("ruang_kelas_id") REFERENCES "RuangKelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuruMapel" ADD CONSTRAINT "GuruMapel_guru_id_fkey" FOREIGN KEY ("guru_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuruMapel" ADD CONSTRAINT "GuruMapel_mata_pelajaran_id_fkey" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "MataPelajaran"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rombel" ADD CONSTRAINT "Rombel_master_kelas_id_fkey" FOREIGN KEY ("master_kelas_id") REFERENCES "MasterKelas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rombel" ADD CONSTRAINT "Rombel_tahun_ajaran_id_fkey" FOREIGN KEY ("tahun_ajaran_id") REFERENCES "TahunAjaran"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rombel" ADD CONSTRAINT "Rombel_wali_kelas_id_fkey" FOREIGN KEY ("wali_kelas_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rombel" ADD CONSTRAINT "Rombel_ruang_kelas_id_fkey" FOREIGN KEY ("ruang_kelas_id") REFERENCES "RuangKelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RombelSiswa" ADD CONSTRAINT "RombelSiswa_rombel_id_fkey" FOREIGN KEY ("rombel_id") REFERENCES "Rombel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RombelSiswa" ADD CONSTRAINT "RombelSiswa_siswa_id_fkey" FOREIGN KEY ("siswa_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JadwalPelajaran" ADD CONSTRAINT "JadwalPelajaran_master_kelas_id_fkey" FOREIGN KEY ("master_kelas_id") REFERENCES "MasterKelas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JadwalPelajaran" ADD CONSTRAINT "JadwalPelajaran_mata_pelajaran_id_fkey" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "MataPelajaran"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JadwalPelajaran" ADD CONSTRAINT "JadwalPelajaran_ruang_kelas_id_fkey" FOREIGN KEY ("ruang_kelas_id") REFERENCES "RuangKelas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JadwalPelajaran" ADD CONSTRAINT "JadwalPelajaran_guru_id_fkey" FOREIGN KEY ("guru_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kehadiran" ADD CONSTRAINT "Kehadiran_siswa_id_fkey" FOREIGN KEY ("siswa_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kehadiran" ADD CONSTRAINT "Kehadiran_jadwal_id_fkey" FOREIGN KEY ("jadwal_id") REFERENCES "JadwalPelajaran"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kehadiran" ADD CONSTRAINT "Kehadiran_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "Semester"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nilai" ADD CONSTRAINT "Nilai_siswa_id_fkey" FOREIGN KEY ("siswa_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nilai" ADD CONSTRAINT "Nilai_mata_pelajaran_id_fkey" FOREIGN KEY ("mata_pelajaran_id") REFERENCES "MataPelajaran"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nilai" ADD CONSTRAINT "Nilai_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JurnalMengajar" ADD CONSTRAINT "JurnalMengajar_jadwal_id_fkey" FOREIGN KEY ("jadwal_id") REFERENCES "JadwalPelajaran"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JurnalMengajar" ADD CONSTRAINT "JurnalMengajar_guru_id_fkey" FOREIGN KEY ("guru_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatatanAkademik" ADD CONSTRAINT "CatatanAkademik_siswa_id_fkey" FOREIGN KEY ("siswa_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatatanAkademik" ADD CONSTRAINT "CatatanAkademik_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatatanAkademik" ADD CONSTRAINT "CatatanAkademik_wali_kelas_id_fkey" FOREIGN KEY ("wali_kelas_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiAbsensi" ADD CONSTRAINT "SesiAbsensi_jadwal_id_fkey" FOREIGN KEY ("jadwal_id") REFERENCES "JadwalPelajaran"("id") ON DELETE CASCADE ON UPDATE CASCADE;
