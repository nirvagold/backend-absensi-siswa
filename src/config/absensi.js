// Konfigurasi aturan jam absensi. Semua nilai bisa diatur lewat env.
//
// ── Pembagian jam (WIB) ──
//   06:00 - 07:00  scan masuk  -> status "Hadir"
//   07:00 - 08:00  scan masuk  -> status "Terlambat"
//   08:00 dst.     jam absen tutup; siswa yang belum absen dihitung
//                  "Tidak Hadir" + keterangan "Alpha" (alpha otomatis)
//
// Jamnya diatur lewat env:
//   ABSEN_JAM_MULAI   (default "06:00") -- sebelum ini scan ditolak
//   ABSEN_BATAS_MASUK (default "07:00") -- batas Hadir vs Terlambat
//   ABSEN_JAM_SELESAI (default "08:00") -- setelah ini scan ditolak
//   ABSEN_BATAS_ALPHA  (default "08:00") -- jam alpha otomatis jalan
//
// Semua perbandingan jam pakai WIB (UTC+7) lewat utils/waktu, bukan jam server,
// supaya hasilnya sama di Vercel (UTC) maupun lokal (WIB).

const { menitWIB } = require("../utils/waktu");

// Nilai default (WIB). Dipakai kalau env kosong / formatnya salah.
const DEFAULT_JAM = {
  mulai: "06:00",
  batasMasuk: "07:00",
  selesai: "08:00",
  batasAlpha: "08:00",
};

// Status & keterangan yang diterima API.
const STATUS_VALID = ["Hadir", "Terlambat", "Izin", "Sakit", "Tidak Hadir"];
const KETERANGAN_VALID = ["Izin", "Sakit", "Alpha"];
// Status lama yang masih diterima (data & frontend versi sebelumnya).
const STATUS_LEGACY = ["Izin", "Sakit"];

// Format env: "HH:MM" (24 jam). Kalau kosong/invalid, kembalikan null.
function parseJam(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const menit = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  if (Number.isNaN(menit)) return null;
  return menit; // dalam menit sejak 00:00
}

// Baca env, jatuh ke default kalau kosong/invalid.
function menitEnv(namaEnv, defaultJam) {
  return parseJam(process.env[namaEnv]) ?? parseJam(defaultJam);
}

// ── Batas-batas jam (dalam menit sejak 00:00 WIB) ──
// Dibaca tiap request biar bisa diubah tanpa restart.

function getJamMulai() {
  return menitEnv("ABSEN_JAM_MULAI", DEFAULT_JAM.mulai);
}

function getJamSelesai() {
  return menitEnv("ABSEN_JAM_SELESAI", DEFAULT_JAM.selesai);
}

// Batas Hadir -> Terlambat.
function getBatasMasuk() {
  return menitEnv("ABSEN_BATAS_MASUK", DEFAULT_JAM.batasMasuk);
}

// Jam alpha otomatis (siswa yang belum scan dianggap tidak hadir).
function getBatasAlpha() {
  return menitEnv("ABSEN_BATAS_ALPHA", DEFAULT_JAM.batasAlpha);
}

// Lama dipakai cron/scheduler lama; sekarang ikut jam alpha.
function getBatasSesi() {
  return parseJam(process.env.ABSEN_BATAS_SESI);
}

// "HH:MM" dari menit sejak 00:00. Buat pesan error / dokumentasi.
function menitKeJam(menit) {
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return String(j).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function jamBuka() {
  return menitKeJam(getJamMulai() ?? parseJam(DEFAULT_JAM.mulai));
}

function jamTutup() {
  return menitKeJam(getJamSelesai() ?? parseJam(DEFAULT_JAM.selesai));
}

function jamBatasMasuk() {
  return menitKeJam(getBatasMasuk() ?? parseJam(DEFAULT_JAM.batasMasuk));
}

function jamBatasAlpha() {
  return menitKeJam(getBatasAlpha() ?? parseJam(DEFAULT_JAM.batasAlpha));
}

// Ubah jam Date jadi menit sejak 00:00 WIB.
function menitDariTanggal(t) {
  return menitWIB(t);
}

// ── Jam operasional absen ──
// Scan di luar jam sekolah dianggap TIDAK VALID -> ditolak.
// Return { valid: bool, alasan: string|null }.
function cekJamOperasional(date) {
  const mulai = getJamMulai();
  const selesai = getJamSelesai();
  const menit = menitDariTanggal(date);

  if (mulai !== null && menit < mulai) {
    return { valid: false, alasan: "sebelum jam absen dibuka" };
  }
  // Tepat di jam tutup sudah dianggap lewat (jam 08:00 -> alpha, bukan terlambat).
  if (selesai !== null && menit >= selesai) {
    return { valid: false, alasan: "sudah lewat jam absen" };
  }
  return { valid: true, alasan: null };
}

// Tentukan status dari waktu scan berdasar batas jam masuk:
//  - sebelum batas masuk       -> null (pakai default "Hadir")
//  - tepat/setelah batas masuk -> "Terlambat"
// Scan/absen yang berhasil = siswa memang hadir di sekolah, jadi paling jauh
// hanya "Terlambat" -- tidak pernah otomatis "Tidak Hadir".
function statusDariJam(date) {
  const batasMasuk = getBatasMasuk();
  const menit = menitDariTanggal(date);

  if (batasMasuk !== null && menit >= batasMasuk) {
    return "Terlambat";
  }
  return null; // belum lewat batas -> pakai status default
}

// Apakah waktu absen sudah melewati batas sesi/terakhir (buat info saja).
function lewatBatasSesi(date) {
  const batasSesi = getBatasSesi();
  if (batasSesi === null) return false;
  return menitDariTanggal(date) > batasSesi;
}

// Terima "Alpha" dari ejaan apa pun: "alpha", "ALPHA", "Alpha".
// Kembalikan null kalau bukan Izin/Sakit/Alpha.
function normalkanKeterangan(value) {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  const ketemu = KETERANGAN_VALID.find((k) => k.toLowerCase() === v.toLowerCase());
  return ketemu || null;
}

// "Tidak Hadir" + "Alpha" -> "Tidak Hadir (Alpha)". Dipakai buat label di riwayat.
function labelStatus(status, keterangan) {
  if (!status) return null;
  if (status === "Tidak Hadir" && keterangan) return `${status} (${keterangan})`;
  return status;
}

module.exports = {
  DEFAULT_JAM,
  STATUS_VALID,
  KETERANGAN_VALID,
  STATUS_LEGACY,
  parseJam,
  getJamMulai,
  getJamSelesai,
  getBatasMasuk,
  getBatasAlpha,
  getBatasSesi,
  cekJamOperasional,
  jamBuka,
  jamTutup,
  jamBatasMasuk,
  jamBatasAlpha,
  menitKeJam,
  menitDariTanggal,
  statusDariJam,
  lewatBatasSesi,
  normalkanKeterangan,
  labelStatus,
};
