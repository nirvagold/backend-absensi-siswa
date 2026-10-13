// Setelan aplikasi per sekolah (tabel `pengaturan`, key-value).
//
// POINT #1: kirim WA otomatis setelah absen atau manual oleh admin.
// Pilihannya disimpan di DB (kunci `wa_kirim_otomatis`) supaya admin bisa
// ganti sendiri dari UI tanpa deploy ulang. Env WA_KIRIM_OTOMATIS tetap
// dipakai sebagai nilai awal (fallback) kalau barisnya belum ada.

const prisma = require("./prisma");

const KUNCI = {
  WA_OTOMATIS: "wa_kirim_otomatis",
};

// Baca satu setelan. Return null kalau belum diisi.
async function ambilSetelan(sekolahId, kunci) {
  if (!sekolahId) return null;
  const row = await prisma.pengaturan.findUnique({
    where: { sekolah_id_kunci: { sekolah_id: sekolahId, kunci } },
    select: { nilai: true },
  });
  return row?.nilai ?? null;
}

// Tulis (upsert) satu setelan.
async function simpanSetelan(sekolahId, kunci, nilai) {
  return prisma.pengaturan.upsert({
    where: { sekolah_id_kunci: { sekolah_id: sekolahId, kunci } },
    create: { sekolah_id: sekolahId, kunci, nilai: String(nilai) },
    update: { nilai: String(nilai) },
  });
}

// Ambil beberapa setelan sekaligus -> objek { kunci: nilai }.
async function ambilBanyak(sekolahId, daftarKunci) {
  if (!sekolahId || daftarKunci.length === 0) return {};
  const rows = await prisma.pengaturan.findMany({
    where: { sekolah_id: sekolahId, kunci: { in: daftarKunci } },
    select: { kunci: true, nilai: true },
  });
  return Object.fromEntries(rows.map((r) => [r.kunci, r.nilai]));
}

// "true"/"false" -> boolean. Terima juga 1/0/ya/tidak.
function keBoolean(nilai, fallback = false) {
  if (nilai === null || nilai === undefined || nilai === "") return fallback;
  const v = String(nilai).toLowerCase().trim();
  if (["true", "1", "ya", "yes", "on"].includes(v)) return true;
  if (["false", "0", "tidak", "no", "off"].includes(v)) return false;
  return fallback;
}

module.exports = { KUNCI, ambilSetelan, simpanSetelan, ambilBanyak, keBoolean };
