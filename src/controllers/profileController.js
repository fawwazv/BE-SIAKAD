// src/controllers/profileController.js
// ═══════════════════════════════════════════════
// USER PROFILE CONTROLLER
// ═══════════════════════════════════════════════

const prisma = require('../config/prisma');

/**
 * GET /api/profile
 * Get current user's profile
 */
const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { role: true, profile: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    return res.status(200).json({
      message: 'Profil berhasil diambil',
      data: {
        id: user.profile?.id || '',
        userId: user.id,
        nomorInduk: user.nomor_induk || '',
        namaLengkap: user.nama_lengkap,
        jenisKelamin: user.profile?.jenis_kelamin || '',
        tanggalLahir: user.profile?.tanggal_lahir || '',
        tempatLahir: user.profile?.tempat_lahir || '',
        agama: user.profile?.agama || '',
        nik: user.profile?.nik || '',
        namaIbuKandung: user.profile?.nama_ibu_kandung || '',
        statusPerkawinan: user.profile?.status_perkawinan || '',
        provinsi: user.profile?.provinsi || '',
        kotaKabupaten: user.profile?.kota_kabupaten || '',
        kecamatan: user.profile?.kecamatan || '',
        kelurahan: user.profile?.kelurahan || '',
        detailAlamat: user.profile?.detail_alamat || '',
        rt: user.profile?.rt || '',
        rw: user.profile?.rw || '',
        kodePos: user.profile?.kode_pos || '',
        avatarUrl: user.avatar_url || '',
        email: user.email,
        role: user.role.nama_role,
      },
    });
  } catch (error) {
    console.error('Profile Get Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

/**
 * PUT /api/profile
 * Update current user's profile
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      namaLengkap, nomorInduk,
      jenisKelamin, tanggalLahir, tempatLahir, agama,
      nik, namaIbuKandung, statusPerkawinan,
      provinsi, kotaKabupaten, kecamatan, kelurahan,
      detailAlamat, rt, rw, kodePos,
    } = req.body;

    // Update User table
    if (namaLengkap || nomorInduk !== undefined) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(namaLengkap && { nama_lengkap: namaLengkap }),
          ...(nomorInduk !== undefined && { nomor_induk: nomorInduk }),
        },
      });
    }

    // Upsert Profile
    await prisma.userProfile.upsert({
      where: { user_id: userId },
      update: {
        ...(jenisKelamin && { jenis_kelamin: jenisKelamin }),
        ...(tanggalLahir && { tanggal_lahir: tanggalLahir }),
        ...(tempatLahir && { tempat_lahir: tempatLahir }),
        ...(agama && { agama }),
        ...(nik !== undefined && { nik }),
        ...(namaIbuKandung !== undefined && { nama_ibu_kandung: namaIbuKandung }),
        ...(statusPerkawinan !== undefined && { status_perkawinan: statusPerkawinan }),
        ...(provinsi && { provinsi }),
        ...(kotaKabupaten && { kota_kabupaten: kotaKabupaten }),
        ...(kecamatan && { kecamatan }),
        ...(kelurahan && { kelurahan }),
        ...(detailAlamat && { detail_alamat: detailAlamat }),
        ...(rt !== undefined && { rt }),
        ...(rw !== undefined && { rw }),
        ...(kodePos !== undefined && { kode_pos: kodePos }),
      },
      create: {
        user_id: userId,
        jenis_kelamin: jenisKelamin || null,
        tanggal_lahir: tanggalLahir || null,
        tempat_lahir: tempatLahir || null,
        agama: agama || null,
        nik: nik || null,
        nama_ibu_kandung: namaIbuKandung || null,
        status_perkawinan: statusPerkawinan || null,
        provinsi: provinsi || null,
        kota_kabupaten: kotaKabupaten || null,
        kecamatan: kecamatan || null,
        kelurahan: kelurahan || null,
        detail_alamat: detailAlamat || null,
        rt: rt || null,
        rw: rw || null,
        kode_pos: kodePos || null,
      },
    });

    return res.status(200).json({ message: 'Profil berhasil diperbarui' });
  } catch (error) {
    console.error('Profile Update Error:', error);
    return res.status(500).json({ message: 'Terjadi kesalahan internal pada server' });
  }
};

module.exports = { getProfile, updateProfile };
