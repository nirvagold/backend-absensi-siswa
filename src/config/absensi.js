// Konfigurasi aturan absensi (batas jam) yang bisa diatur via env.
// Dipakai untuk POINT #3: pembagian jam penghitungan terlambat.
//
// Semua perbandingan jam pakai WIB (UTC+7) lewat utils/waktu, bukan jam server,
// supaya hasilnya sama di Vercel (UTC) maupun lokal (WIB).

const { menitWIB } = require("../utils/waktu");

// Format env: "HH:MM" (24 jam). Kalau kosong/invalid, dianggap tidak aktif.

function parseJam(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const menit = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  if (Number.isNaN(menit)) return null;
  return menit; // dalam menit sejak 00:00
}

// Nilai dari env, di-baca sekali setiap request (biar bisa diubah tanpa restart).
function getBatasMasuk() {
  return parseJam(process.env.ABSEN_BATAS_MASUK);
}

function getBatasSesi() {
  return parseJam(process.env.ABSEN_BATAS_SESI);
}

// Ubah jam Date jadi menit sejak 00:00 WIB.
function menitDariTanggal(t) {
  return menitWIB(t);
}

// Tentukan status dari waktu absen, berdasar batas jam.
// Scan/absen yang berhasil = siswa memang hadir di sekolah, jadi paling jauh
// hanya dianggap "Terlambat" -- tidak pernah otomatis "Tidak Hadir"
// (status "Tidak Hadir" ditentukan manual oleh guru/admin).
//  - sebelum/tepat batas masuk  -> "Hadir"
//  - setelah batas masuk        -> "Terlambat"
// Kalau batas masuk tidak diset (null) -> kembalikan null (pakai default "Hadir").
function statusDariJam(date) {
  const batasMasuk = getBatasMasuk();
  const menit = menitDariTanggal(date);

  if (batasMasuk !== null && menit > batasMasuk) {
    return "Terlambat";
  }
  return null; // belum lewat batas -> pakai status default
}

// Apakah waktu absen sudah melewati batas sesi/terakhir (buat info saja,
// misal buat nandain "lewat jam masuk" di response).
function lewatBatasSesi(date) {
  const batasSesi = getBatasSesi();
  if (batasSesi === null) return false;
  return menitDariTanggal(date) > batasSesi;
}

module.exports = {
  parseJam,
  getBatasMasuk,
  getBatasSesi,
  menitDariTanggal,
  statusDariJam,
};