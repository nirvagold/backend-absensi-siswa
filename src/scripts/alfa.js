// ── Alfa otomatis ──
// Aturan: siswa yang BELUM melakukan scan/absen pada suatu tanggal,
// setelah lewat batas jam masuk (ABSEN_BATAS_MASUK, default jam 9), dianggap Alfa.
//
// Implementasi: status di-set "Tidak Hadir" + keterangan "Alfa" di DB (nyata),
// mengikuti keputusan: Alfa = Tidak Hadir + keterangan Alfa.
// Idempoten: siswa yang sudah punya catatan absen hari itu TIDAK di-overwrite.
//
// "Nanti bisa di edit" = catatan Alfa bisa diubah jadi Izin/Sakit lewat
// endpoint update absensi (ubah kolom keterangan pada record yang sama).

const prisma = require("../config/prisma");
const { rentangHariWIB, waktuDariJamWIB } = require("../utils/waktu");
const { getBatasAlfa } = require("../config/absensi");

// Ambil semua sekolah (dipakai cron & scheduler)
async function ambilSekolah() {
  return prisma.sekolah.findMany({ select: { sekolah_id: true } });
}

// Jam alfa otomatis dalam menit sejak 00:00 WIB.
// Sumbernya env ABSEN_BATAS_ALFA (default 08:00 = 480), dijaga di config/absensi.js
// biar satu tempat sama aturan jam yang lain.
function batasMasukMenit() {
  return getBatasAlfa();
}

// Tandai semua siswa aktif (belum absen) milik sebuah sekolah pada tanggal
// `tgl` sebagai "Tidak Hadir" + keterangan "Alfa".
// Return: { sekolah_id, sekolah_nama, total_siswa, ditandai, sudah_absen }
async function tandaiAlfaSekolah(sekolahId, tgl) {
  const sekolah = await prisma.sekolah.findUnique({
    where: { sekolah_id: sekolahId },
    select: { npsn: true, nama: true },
  });

  const today = new Date(tgl);
  const { awal: awalHari, akhir: akhirHari } = rentangHariWIB(today);

  const siswaList = await prisma.siswa.findMany({
    where: { sekolah_id: sekolahId, is_active: true },
    select: { peserta_didik_id: true },
  });

  const existing = await prisma.absensi.findMany({
    where: { sekolah_id: sekolahId, tanggal: { gte: awalHari, lt: akhirHari } },
    select: { peserta_didik_id: true },
  });
  const existingIds = new Set(existing.map((e) => e.peserta_didik_id));

  const belumAbsen = siswaList.filter((s) => !existingIds.has(s.peserta_didik_id));

  // Kolom absensi.petugas_id NOT NULL; cari user admin sekolah sebagai "petugas sistem".
  // (Alfa dibuat otomatis tanpa operator manusia, jadi pakai admin sekolah.)
  const petugasSistem = await prisma.users.findFirst({
    where: { sekolah_id: sekolahId, peran_id_str: "Admin", is_active: true },
    select: { pengguna_id: true },
  });
  const petugasId = petugasSistem?.pengguna_id;
  if (!petugasId) {
    console.error("[alfa] Tidak ada user Admin untuk sekolah", sekolahId, "- alfa dibatalkan utk sekolah ini");
    return {
      sekolah_id: sekolahId,
      sekolah_nama: sekolah?.nama || sekolah?.npsn || null,
      total_siswa: siswaList.length,
      sudah_absen: existing.length,
      ditandai: 0,
      alfa_dibatalkan: true,
    };
  }

  let ditandai = 0;
  for (const s of belumAbsen) {
    try {
      await prisma.absensi.create({
        data: {
          peserta_didik_id: s.peserta_didik_id,
          sekolah_id: sekolahId,
          tanggal: awalHari,
          // Jam alfa (default 08:00 WIB), bukan tengah malam -- biar di riwayat
          // jamnya masuk akal dan konsisten sama jam WIB yang lain.
          waktu_absen: waktuDariJamWIB(awalHari, batasMasukMenit()),
          status: "Tidak Hadir",
          keterangan: "Alfa",
          metode: "sistem",
          petugas_id: petugasId,
        },
      });
      ditandai++;
    } catch (e) {
      if (e.code === "P2002") continue; // data race, sudah ada baris lain — lewati
      console.error("Gagal tandai alfa siswa", s.peserta_didik_id, e.message);
    }
  }

  return {
    sekolah_id: sekolahId,
    sekolah_nama: sekolah?.nama || sekolah?.npsn || null,
    total_siswa: siswaList.length,
    sudah_absen: existing.length,
    ditandai,
  };
}

// Jalankan untuk semua sekolah pada tanggal `tgl` (default hari ini).
// Return agregat.
async function tandaiAlfaSemuaSekolah(tgl = new Date()) {
  const sekolahList = await ambilSekolah();
  const hasil = [];
  for (const sk of sekolahList) {
    hasil.push(await tandaiAlfaSekolah(sk.sekolah_id, tgl));
  }
  const totalDitandai = hasil.reduce((a, b) => a + b.ditandai, 0);
  return { hasil, total_sekolah: hasil.length, total_ditandai_alfa: totalDitandai };
}

module.exports = {
  ambilSekolah,
  tandaiAlfaSekolah,
  tandaiAlfaSemuaSekolah,
  batasMasukMenit,
};