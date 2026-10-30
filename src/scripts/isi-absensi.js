// ── Isi absensi harian (buat data demo/presentasi) ──
// Bikin catatan absensi satu hari penuh untuk semua siswa aktif, biar dashboard,
// grafik tren, dan riwayat selalu ada isinya tanpa harus scan QR satu-satu.
//
// Aman dijalankan berulang: siswa yang di hari itu sudah punya catatan TIDAK
// ditimpa (kecuali baris "Alpha" bawaan cron yang boleh dihitung ulang).
//
// Pemakaian:
//   node src/scripts/isi-absensi.js                       # lihat rencana hari ini (aman)
//   node src/scripts/isi-absensi.js --ya                  # isi hari ini
//   node src/scripts/isi-absensi.js --tanggal=2026-10-14 --ya
//   node src/scripts/isi-absensi.js --dari=2026-10-13 --sampai=2026-10-21 --ya
//   node src/scripts/isi-absensi.js --ya --timpa           # tulis ulang termasuk data manual
//   node src/scripts/isi-absensi.js --ya --ikut-libur      # ikut isi Sabtu/Minggu juga
//   node src/scripts/isi-absensi.js --ya --sekolah=<uuid>  # pilih sekolah lain
//
// Sabtu & Minggu LIBUR: dilewati otomatis, karena sekolah tutup dan hari libur
// memang tidak punya catatan absensi. Pakai --ikut-libur kalau memang butuh.
//
// Aturan yang dipakai (disamain sama alur scan & cron alpha asli):
//   Hadir      metode "scan"   jam 06:00-06:59  keterangan null
//   Terlambat  metode "scan"   jam 07:00-07:59  keterangan null
//   Alpha      metode "sistem" jam 08:00 tepat  keterangan "Alpha"   (petugas: Admin)
//   Izin/Sakit metode "manual" jam 06:00-07:59  keterangan "Izin"/"Sakit"
// Status tidak hadir selalu disimpan sebagai status "Tidak Hadir" + keterangan,
// bukan lagi "Izin"/"Sakit" di kolom status.
//
// Petugas: scan & manual dicatat oleh guru pemilik rombel kelas itu (kalau ada),
// sisanya jatuh ke Admin. Alpha selalu oleh Admin, sama seperti cron.
//
// Angka acaknya TIDAK benar-benar random: di-hash dari id siswa + tanggal, jadi
// jalanin ulang di hari yang sama hasilnya sama persis (enak buat screenshot).

// .env.local dulu (file yang dipakai buat jalanin lokal), baru .env.
// dotenv ga nimpah variabel yang sudah ada, jadi urutan ini aman.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const prisma = require("../config/prisma");
const { awalHariWIB, tanggalStrWIB, dariTanggalStr, waktuDariJamWIB, akhirPekanWIB } = require("../utils/waktu");

// ── Argumen ──
function ambilArg(nama) {
  const arg = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return arg ? arg.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : null;
}

const EKSEKUSI = process.argv.includes("--ya");
const TIMPA = process.argv.includes("--timpa");
const IKUT_LIBUR = process.argv.includes("--ikut-libur");
const SEKOLAH_ID = ambilArg("sekolah");
const TANGGAL = ambilArg("tanggal");
const DARI = ambilArg("dari") || TANGGAL;
// --dari tanpa --sampai = cuma hari itu (bukan 400 hari ke depan).
const SAMPAI = ambilArg("sampai") || DARI;

// ── Aturan jam (menit sejak 00:00 WIB) ──
// 06:00-06:59 Hadir, 07:00-07:59 Terlambat, 08:00 tepat Alpha/auto-tutup.
// Batasnya absolut, bukan relatif, biar ga ada absensi jam 05:xx atau 09:xx.
const BATAS_HADIR = 360; // 06:00
const BATAS_TERLAMBAT = 420; // 07:00
const BATAS_TUTUP = 480; // 08:00

// Ukuran potongan buat delete/create. Neon suka putus kalau koneksinya nganggur
// kelamaan, jadi jangan satu transaksi besar.
const POTONG = 60;
const POTONG_HAPUS = 200;

// Sebaran jenis ketidakhadiran. Totalnya ~9% dari siswa per hari, angka yang
// wajar buat sekolah dasar dan bikin persentase kehadiran berkisar 90-92%.
const RASIO = { izin: 0.033, sakit: 0.026, alpha: 0.026 };

// ── Acak yang bisa diulang ──
// FNV-1a: hash sederhana yang hasilnya sama tiap kali dijalankan.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Pengali dari hash -> pecahan 0..1. Dipakai buat nentuin "siswa ini izin atau ga".
function pecahan(s) {
  return (hash(s) % 100000) / 100000;
}

// Sebar waktu absen di dalam band-nya. Tanpa ini semua siswa punya jam yang sama
// dan kelihatan palsu; urutannya diambil dari hash id supaya ga rame di detik
// yang sama tapi tetap deterministik per tanggal.
function sebarWaktu(id, tanggalStr, lo, hi) {
  const span = hi - lo;
  const langkah = hash(`${id}:${tanggalStr}`) % Math.max(1, span);
  const detik = hash(`d:${id}:${tanggalStr}`) % 60;
  return { menit: lo + langkah, detik };
}

// Daftar hari dari string tanggal (YYYY-MM-DD), inklusif dua ujungnya.
function daftarHari(dari, sampai) {
  const awal = dariTanggalStr(dari);
  if (!awal) return null;
  const hari = [];
  let t = awal;
  for (let i = 0; i < 400; i++) {
    hari.push(t);
    if (sampai && tanggalStrWIB(t) >= sampai) break;
    t = new Date(t.getTime() + 24 * 60 * 60 * 1000);
  }
  return sampai ? hari.filter((h) => tanggalStrWIB(h) <= sampai) : hari;
}

// Guru pemilik rombel -> dipakai sebagai petugas_id baris scan/manual.
function petaPetugas(users, admin) {
  const peta = new Map();
  for (const u of users) {
    if (!u.nama_rombel) continue;
    for (const kelas of u.nama_rombel.split(",").map((s) => s.trim())) {
      if (!kelas) continue;
      if (!peta.has(kelas)) peta.set(kelas, u.pengguna_id);
    }
  }
  return { peta, admin };
}

// Tentukan baris absensi buat satu siswa di satu hari.
function tentukanBaris(siswa, tglStr) {
  const acak = pecahan(`status:${siswa.peserta_didik_id}:${tglStr}`);
  const p = petugasCache.peta.get(siswa.nama_rombel) || petugasCache.admin;

  // Urutan cek: hadir dulu (mayoritas), baru izin, sakit, lalu sisanya alpha.
  // Dihitung kumulatif biar total tidak hadir = izin + sakit + alpha.
  if (acak < RASIO.izin) {
    const { menit, detik } = sebarWaktu(siswa.peserta_didik_id, tglStr, BATAS_HADIR, BATAS_TERLAMBAT - 1);
    return {
      status: "Tidak Hadir",
      keterangan: "Izin",
      metode: "manual",
      petugas_id: p,
      menit,
      detik,
    };
  }
  if (acak < RASIO.izin + RASIO.sakit) {
    const { menit, detik } = sebarWaktu(siswa.peserta_didik_id, tglStr, BATAS_HADIR, BATAS_TERLAMBAT - 1);
    return {
      status: "Tidak Hadir",
      keterangan: "Sakit",
      metode: "manual",
      petugas_id: p,
      menit,
      detik,
    };
  }
  if (acak < RASIO.izin + RASIO.sakit + RASIO.alpha) {
    return {
      status: "Tidak Hadir",
      keterangan: "Alpha",
      metode: "sistem",
      petugas_id: petugasCache.admin,
      menit: BATAS_TUTUP,
      detik: 0,
    };
  }

  // Sisanya hadir. ~6% dari yang hadir telat masuk.
  const telat = pecahan(`telat:${siswa.peserta_didik_id}:${tglStr}`) < 0.065;
  const { menit, detik } = telat
    ? sebarWaktu(siswa.peserta_didik_id, tglStr, BATAS_TERLAMBAT, BATAS_TUTUP - 1)
    : sebarWaktu(siswa.peserta_didik_id, tglStr, BATAS_HADIR, BATAS_TERLAMBAT - 1);

  return {
    status: telat ? "Terlambat" : "Hadir",
    keterangan: null,
    metode: "scan",
    petugas_id: p,
    menit,
    detik,
  };
}

// Diisi di main(): guru per rombel + admin sebagai cadangan.
let petugasCache = { peta: new Map(), admin: null };

async function isiSatuHari(sekolah, siswaList, tanggal, eksekusi) {
  const tglStr = tanggalStrWIB(tanggal);

  const sudahAda = await prisma.absensi.findMany({
    where: { sekolah_id: sekolah.sekolah_id, tanggal },
    select: { absensi_id: true, peserta_didik_id: true, status: true, metode: true },
  });
  const adaMap = new Map(sudahAda.map((r) => [r.peserta_didik_id, r]));

  // Baris bawaan cron alpha boleh ditulis ulang: statusnya alpha otomatis.
  // Data manual (izin/sakit yang diisi guru) TIDAK diganggu kecuali --timpa.
  const bolehTimpa = (r) => TIMPA || (r.metode === "sistem" && r.status === "Tidak Hadir");

  const baru = [];
  let dilewati = 0;
  const diganti = [];

  for (const s of siswaList) {
    const lama = adaMap.get(s.peserta_didik_id);
    if (lama && !bolehTimpa(lama)) {
      dilewati++;
      continue;
    }
    if (lama) diganti.push(lama.absensi_id);

    const b = tentukanBaris(s, tglStr);
    baru.push({
      peserta_didik_id: s.peserta_didik_id,
      sekolah_id: sekolah.sekolah_id,
      tanggal,
      waktu_absen: waktuDariJamWIB(tanggal, b.menit + b.detik / 60),
      status: b.status,
      metode: b.metode,
      keterangan: b.keterangan,
      petugas_id: b.petugas_id,
    });
  }

  const hasil = {
    tglStr,
    total: siswaList.length,
    sudahAda: sudahAda.length,
    ditulis: 0,
    dilewati,
    diganti: diganti.length,
  };

  if (!eksekusi) {
    const hitung = {};
    for (const r of baru) {
      const k = r.keterangan ? `${r.status} (${r.keterangan})` : r.status;
      hitung[k] = (hitung[k] || 0) + 1;
    }
    hasil.rencana = hitung;
    return hasil;
  }

  // Hapus baris lama dulu. WAJIB sebelum insert: ada unique (peserta_didik_id, tanggal),
  // jadi bikin baris baru selagi yang lama masih ada bakal ditolak.
  let dihapus = 0;
  for (let i = 0; i < diganti.length; i += POTONG_HAPUS) {
    const potong = diganti.slice(i, i + POTONG_HAPUS);
    const r = await prisma.absensi.deleteMany({ where: { absensi_id: { in: potong } } });
    dihapus += r.count;
  }
  hasil.dihapus = dihapus;

  // Insert per potongan, biar ga kena batas waktu koneksi Neon.
  for (let i = 0; i < baru.length; i += POTONG) {
    const potong = baru.slice(i, i + POTONG);
    await prisma.$transaction(
      async (tx) => {
        for (const r of potong) await tx.absensi.create({ data: r });
      },
      { timeout: 60000 }
    );
    hasil.ditulis += potong.length;
  }

  return hasil;
}

async function main() {
  const sekolah = SEKOLAH_ID
    ? await prisma.sekolah.findUnique({ where: { sekolah_id: SEKOLAH_ID } })
    : await prisma.sekolah.findFirst({ orderBy: { npsn: "asc" } });

  if (!sekolah) {
    console.error("Tidak ada data sekolah. Jalankan dulu: npm run db:seed");
    process.exit(1);
  }

  const users = await prisma.users.findMany({
    where: { sekolah_id: sekolah.sekolah_id, is_active: true },
    select: { pengguna_id: true, nama: true, peran_id_str: true, nama_rombel: true },
  });
  const admin = users.find((u) => u.peran_id_str === "Admin") || users[0];
  if (!admin) {
    console.error("Tidak ada user aktif buat jadi petugas absensi.");
    process.exit(1);
  }
  petugasCache = petaPetugas(users, admin.pengguna_id);

  const siswaList = await prisma.siswa.findMany({
    where: { sekolah_id: sekolah.sekolah_id, is_active: true },
    select: { peserta_didik_id: true, nama: true, nama_rombel: true },
    orderBy: [{ nama_rombel: "asc" }, { nama: "asc" }],
  });

  const sekarang = awalHariWIB(new Date());
  let hari;
  if (DARI) {
    hari = daftarHari(DARI, SAMPAI);
    if (!hari || !hari.length) {
      console.error(`Tanggal tidak valid: ${DARI}${SAMPAI ? ` s/d ${SAMPAI}` : ""}. Format: YYYY-MM-DD`);
      process.exit(1);
    }
  } else {
    hari = [sekarang];
  }

  // Sabtu/Minggu libur -- tidak ada kegiatan belajar, jadi tidak boleh ada
  // catatan absensi. Ini juga yang bikin grafik tren bersih tanpa batang nol.
  if (!IKUT_LIBUR) {
    const sebelum = hari.length;
    hari = hari.filter((h) => !akhirPekanWIB(h));
    const dilewatiLibur = sebelum - hari.length;
    if (dilewatiLibur > 0) {
      console.log(`Melewati ${dilewatiLibur} hari libur (Sabtu/Minggu). Pakai --ikut-libur kalau mau diisi.`);
      console.log();
    }
    if (!hari.length) {
      console.log("Semua tanggal yang diminta jatuh di Sabtu/Minggu. Tidak ada yang diisi.");
      return;
    }
  }

  console.log("Sekolah :", sekolah.nama, `(${sekolah.npsn})`);
  console.log("Siswa   :", siswaList.length, "aktif");
  console.log("Hari    :", hari.length, `(${tanggalStrWIB(hari[0])} s/d ${tanggalStrWIB(hari[hari.length - 1])})`);
  console.log("Mode    :", EKSEKUSI ? (TIMPA ? "TULIS ULANG SEMUA (--timpa)" : "TULIS, data lama dibiarkan") : "RENCANA (belum ada yang diubah)");
  console.log();

  const semua = [];
  for (const t of hari) {
    const r = await isiSatuHari(sekolah, siswaList, t, EKSEKUSI);
    semua.push(r);
  }

  console.log("── Ringkasan per hari ──");
  console.table(
    semua.map((r) => ({
      tanggal: r.tglStr,
      siswa: r.total,
      sudahAda: r.sudahAda,
      ditulis: r.ditulis,
      dihapus: r.dihapus ?? 0,
      dilewati: r.dilewati,
    }))
  );

  if (!EKSEKUSI) {
    console.log("── Rencana komposisi hari terakhir (contoh) ──");
    console.table(semua[semua.length - 1].rencana || {});
    console.log("Jalankan ulang dengan --ya kalau sudah yakin.");
    return;
  }

  const sesudah = await prisma.absensi.groupBy({
    by: ["tanggal"],
    where: { sekolah_id: sekolah.sekolah_id, tanggal: { in: hari } },
    _count: { absensi_id: true },
    orderBy: { tanggal: "asc" },
  });
  console.log("── Jumlah baris tersimpan ──");
  console.table(sesudah.map((r) => ({ tanggal: tanggalStrWIB(r.tanggal), baris: r._count.absensi_id })));
  console.log("\nSelesai.");
}

main()
  .catch((e) => {
    console.error("Gagal:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
