// ── Data dummy buat testing ──
// Bersihkan data siswa + absensi, lalu (opsional) bikin beberapa siswa contoh.
// Berguna biar ga perlu narik 301 siswa tiap kali ngetes.
//
// Pemakaian:
//   node src/scripts/dummy.js                                  # lihat rencana doang (aman)
//   node src/scripts/dummy.js --ya                             # bersihkan + bikin 5 siswa dummy
//   node src/scripts/dummy.js --ya --bersih-saja               # cuma bersihkan
//   node src/scripts/dummy.js --ya --kelas="KELAS 1A"          # pilih kelas lain
//   node src/scripts/dummy.js --ya --telepon=628123456789      # isi nomor WA buat ngetes notif
//
// Yang DIHAPUS : absensi, notifikasi_log, sesi_absensi, siswa, sync_log
// Yang DIPERTAHANKAN : sekolah, users (admin/guru), pengaturan

// .env.local dulu (file yang dipakai buat jalanin lokal), baru .env.
// dotenv ga nimpah variabel yang sudah ada, jadi urutan ini aman.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const crypto = require("crypto");
const prisma = require("../config/prisma");

// Nama dummy: kata depannya persis seperti yang diminta, ditambah nama
// belakang biar kelihatan wajar di kartu dan di riwayat.
const SISWA_DUMMY = [
  { nama: "DEVIA ANGGRAINI", jenis_kelamin: "P", nisn: "3000000001", nipd: "2425030001" },
  { nama: "SEPTIAN RAMADHAN", jenis_kelamin: "L", nisn: "3000000002", nipd: "2425030002" },
  { nama: "AFRIZAL PRATAMA", jenis_kelamin: "L", nisn: "3000000003", nipd: "2425030003" },
  { nama: "ANIS KURNIAWATI", jenis_kelamin: "P", nisn: "3000000004", nipd: "2425030004" },
  { nama: "AIS PUTRI RAMADHANI", jenis_kelamin: "P", nisn: "3000000005", nipd: "2425030005" },
];

function ambilArg(nama) {
  const arg = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return arg ? arg.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : null;
}

const EKSEKUSI = process.argv.includes("--ya");
const BERSIH_SAJA = process.argv.includes("--bersih-saja");
const KELAS = ambilArg("kelas") || "KELAS 3A";
const TELEPON = ambilArg("telepon") || null;
const TINGKAT = KELAS.replace(/\D/g, "").charAt(0) || "3";

async function ringkasan() {
  const [sekolah, users, siswa, absensi, notif, sync, sesi] = await Promise.all([
    prisma.sekolah.count(),
    prisma.users.count(),
    prisma.siswa.count(),
    prisma.absensi.count(),
    prisma.notifikasi_log.count(),
    prisma.sync_log.count(),
    prisma.sesi_absensi.count(),
  ]);
  return { sekolah, users, siswa, absensi, notif, sync, sesi };
}

async function bersihkan() {
  // Urutan penting: anak dulu, induk belakangan (biar ga nabrak foreign key).
  const notif = await prisma.notifikasi_log.deleteMany({});
  const absensi = await prisma.absensi.deleteMany({});
  const sesi = await prisma.sesi_absensi.deleteMany({});
  const siswa = await prisma.siswa.deleteMany({});
  const sync = await prisma.sync_log.deleteMany({});
  return {
    notifikasi_log: notif.count,
    absensi: absensi.count,
    sesi_absensi: sesi.count,
    siswa: siswa.count,
    sync_log: sync.count,
  };
}

async function buatDummy(sekolahId) {
  const dibuat = [];
  for (const s of SISWA_DUMMY) {
    const siswa = await prisma.siswa.create({
      data: {
        peserta_didik_id: crypto.randomUUID(),
        sekolah_id: sekolahId,
        nisn: s.nisn,
        nipd: s.nipd,
        nama: s.nama,
        jenis_kelamin: s.jenis_kelamin,
        nama_rombel: KELAS,
        tingkat_pendidikan_id: TINGKAT,
        nomor_telepon_seluler: TELEPON,
      },
    });
    dibuat.push(siswa);
  }
  return dibuat;
}

async function main() {
  const sekolah = await prisma.sekolah.findFirst({ orderBy: { npsn: "asc" } });
  if (!sekolah) {
    console.error("Tidak ada data sekolah. Jalankan dulu: npm run db:seed");
    process.exit(1);
  }

  console.log("Sekolah :", sekolah.nama, `(${sekolah.npsn})`);
  console.log("Kelas   :", KELAS, `(tingkat ${TINGKAT})`);
  console.log();

  const sebelum = await ringkasan();
  console.log("── Isi database sekarang ──");
  console.table(sebelum);
  console.log();

  if (!EKSEKUSI) {
    console.log("MODE RENCANA (belum ada yang diubah).");
    console.log("Yang akan dihapus : absensi, notifikasi_log, sesi_absensi, siswa, sync_log");
    console.log("Yang dipertahankan: sekolah, users (admin/guru), pengaturan");
    console.log(
      BERSIH_SAJA
        ? "Lalu berhenti (--bersih-saja)."
        : `Lalu dibuat ${SISWA_DUMMY.length} siswa dummy di ${KELAS}.`
    );
    console.log();
    console.log("Jalankan ulang dengan --ya kalau sudah yakin.");
    return;
  }

  console.log("── Menghapus data lama ──");
  const terhapus = await bersihkan();
  console.table(terhapus);
  console.log();

  if (BERSIH_SAJA) {
    console.log("Selesai. Database sudah bersih.");
    return;
  }

  console.log("── Membuat siswa dummy ──");
  const dibuat = await buatDummy(sekolah.sekolah_id);
  console.table(dibuat.map((s) => ({ nama: s.nama, nisn: s.nisn, kelas: s.nama_rombel, id: s.peserta_didik_id })));
  console.log();

  // Samakan kelas guru dengan kelas dummy, biar akun guru bisa lihat datanya.
  const guru = await prisma.users.findFirst({
    where: { sekolah_id: sekolah.sekolah_id, peran_id_str: "Guru" },
  });
  if (guru && guru.nama_rombel !== KELAS) {
    await prisma.users.update({
      where: { pengguna_id: guru.pengguna_id },
      data: { nama_rombel: KELAS },
    });
    console.log(`Kelas akun guru "${guru.username}" diset ke ${KELAS}.`);
  }

  if (!TELEPON) {
    console.log("Nomor WA siswa dikosongkan. Isi pakai --telepon=62812xxx kalau mau ngetes notifikasi.");
  }

  console.log();
  const sesudah = await ringkasan();
  console.log("── Isi database sekarang ──");
  console.table(sesudah);
  console.log("\nSelesai.");
}

main()
  .catch((e) => {
    console.error("Gagal:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
