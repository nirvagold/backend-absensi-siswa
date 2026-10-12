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

// ── Jam operasional absen (POINT #5) ──
// Scan/absen di luar jam sekolah dianggap TIDAK VALID.
// Batasnya bisa lewat env:
//   ABSEN_JAM_MULAI (default "06:00") -- absen sebelum jam ini ditolak
//   ABSEN_JAM_SELESAI (default "12:00") -- absen setelah jam ini ditolak
// Set ABSEN_JAM_MULAI="00:00" & ABSEN_JAM_SELESAI="23:59" buat mematikan fitur ini.
// Return { valid: bool, alasan: string|null }.
function cekJamOperasional(date) {
  // Pakai || bukan ?? : env kosong ("") harus jatuh ke default, bukan mematikan cek.
  const mulai = parseJam(process.env.ABSEN_JAM_MULAI || "06:00");
  const selesai = parseJam(process.env.ABSEN_JAM_SELESAI || "12:00");
  const menit = menitDariTanggal(date);

  if (mulai !== null && menit < mulai) {
    return { valid: false, alasan: "sebelum jam absen dibuka" };
  }
  if (selesai !== null && menit > selesai) {
    return { valid: false, alasan: "sudah lewat jam absen" };
  }
  return { valid: true, alasan: null };
}

// String "HH:MM" jam buka/tutup absen (buat pesan error). Fallback ke default
// kalau env kosong/invalid, biar pesan tetap informatif.
function menitKeJam(menit) {
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return String(j).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function jamBuka() {
  return menitKeJam(parseJam(process.env.ABSEN_JAM_MULAI || "06:00") ?? 6 * 60);
}

function jamTutup() {
  return menitKeJam(parseJam(process.env.ABSEN_JAM_SELESAI || "12:00") ?? 12 * 60);
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
  cekJamOperasional,
  jamBuka,
  jamTutup,
  menitDariTanggal,
  statusDariJam,
};