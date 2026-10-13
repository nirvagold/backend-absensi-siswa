"use strict";
// Helper buat nyaring data dari Dapodik.
// Dipakai sync biar bisa tarik sebagian aja (mis. satu kelas) waktu testing,
// jadi ga selalu 301 siswa sekaligus.

// Normalisasi input filter jadi daftar huruf besar.
// "KELAS 1A" / "kelas 1a,kelas 1b" / ["KELAS 1A"] -> ["KELAS 1A", "KELAS 1B"]
function normalisasiFilter(nilai) {
  if (!nilai) return [];
  const daftar = Array.isArray(nilai) ? nilai : String(nilai).split(",");
  return daftar.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
}

// Saring baris peserta didik menurut kelas dan/atau tingkat.
// Dua-duanya kosong = ambil semua (perilaku lama).
function saringPesertaDidik(rows, filterKelas = [], filterTingkat = []) {
  if (!filterKelas.length && !filterTingkat.length) return rows;
  return rows.filter((row) => {
    const kelas = String(row.nama_rombel || "").trim().toUpperCase();
    const tingkat = String(row.tingkat_pendidikan_id || "").trim();
    if (filterKelas.length && !filterKelas.includes(kelas)) return false;
    if (filterTingkat.length && !filterTingkat.includes(tingkat)) return false;
    return true;
  });
}

// Rekap jumlah siswa per kelas. Dipakai buat nunjukin kelas apa aja yang
// tersedia di Dapodik sebelum menarik datanya.
function rekapPerKelas(rows) {
  const map = new Map();
  for (const row of rows) {
    const kelas = row.nama_rombel || "(tanpa kelas)";
    map.set(kelas, (map.get(kelas) || 0) + 1);
  }
  return [...map.entries()]
    .map(([nama_rombel, jumlah]) => ({ nama_rombel, jumlah }))
    .sort((a, b) => a.nama_rombel.localeCompare(b.nama_rombel));
}

module.exports = { normalisasiFilter, saringPesertaDidik, rekapPerKelas };
