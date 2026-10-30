// Utilitas waktu: semua hitungan hari/jam bisnis pakai WIB (UTC+7),
// supaya hasilnya sama di server mana pun (Vercel jalan di UTC, lokal di WIB).
//
// Konvensi kolom `tanggal`: disimpan sebagai tengah malam UTC dari tanggal
// kalender WIB. Contoh: tanggal WIB 13 Okt 2026 -> disimpan "2026-10-13 00:00:00".
// Jadi komponen tanggal dari nilai tersimpan = tanggal WIB.

const OFFSET_WIB_MENIT = 7 * 60;

// Geser instan ke "jam dinding WIB", tapi dibaca lewat getter UTC.
function geserKeWIB(date) {
  return new Date(date.getTime() + OFFSET_WIB_MENIT * 60 * 1000);
}

// Menit sejak 00:00 WIB (untuk bandingkan dengan batas jam masuk).
function menitWIB(date) {
  const w = geserKeWIB(date);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

// "YYYY-MM-DD" menurut WIB.
function tanggalStrWIB(date) {
  return geserKeWIB(date).toISOString().slice(0, 10);
}

// "HH:MM" menurut WIB.
function jamStrWIB(date) {
  const w = geserKeWIB(date);
  return String(w.getUTCHours()).padStart(2, "0") + ":" + String(w.getUTCMinutes()).padStart(2, "0");
}

// Nilai `tanggal` yang disimpan untuk instan tertentu (tengah malam UTC dari tanggal WIB-nya).
function awalHariWIB(date) {
  const w = geserKeWIB(date);
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()));
}

// Awal hari WIB digeser n hari (n negatif = mundur).
function awalHariWIBOffset(date, n) {
  return new Date(awalHariWIB(date).getTime() + n * 24 * 60 * 60 * 1000);
}

// Rentang satu hari WIB untuk query: { awal (>=), akhir (<) }.
function rentangHariWIB(date) {
  const awal = awalHariWIB(date);
  return { awal, akhir: new Date(awal.getTime() + 24 * 60 * 60 * 1000) };
}

// Hari ke berapa (0=Minggu .. 6=Sabtu) menurut kalender WIB.
// `tanggal` disimpan sebagai tengah malam UTC dari tanggal WIB, jadi getUTCDay()
// langsung memberi hari yang benar -- jangan pakai getDay() (ikut zona server).
function hariKeWIB(date) {
  return date.getUTCDay();
}

// Sabtu/Minggu = libur, tidak ada kegiatan belajar.
// Dipakai cron alpha, grafik tren, dan skrip isi-absensi biar ketiganya
// sepakat: hari libur tidak punya catatan absensi sama sekali.
function akhirPekanWIB(date) {
  const h = hariKeWIB(date);
  return h === 0 || h === 6;
}

// Parse "YYYY-MM-DD" dari query jadi nilai `tanggal` tersimpan. Invalid -> null.
function dariTanggalStr(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str || ""))) return null;
  const d = new Date(str + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

// Nilai DateTime untuk jam WIB tertentu pada hari `tanggal` (nilai kolom tanggal).
// Contoh: menit 480 (08:00 WIB) -> tanggal + 1 jam (08:00 - 07:00 offset).
// Dipakai buat nulis waktu_absen baris alpha otomatis, biar jamnya masuk akal
// (jam alpha), bukan 00:00.
function waktuDariJamWIB(tanggal, menit) {
  return new Date(tanggal.getTime() + (menit - OFFSET_WIB_MENIT) * 60 * 1000);
}

module.exports = {
  OFFSET_WIB_MENIT,
  menitWIB,
  tanggalStrWIB,
  jamStrWIB,
  awalHariWIB,
  awalHariWIBOffset,
  rentangHariWIB,
  hariKeWIB,
  akhirPekanWIB,
  dariTanggalStr,
  waktuDariJamWIB,
};