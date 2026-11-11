// ── Jalankan sync Dapodik sekarang (tanpa nunggu cron pagi) ──
//
// Cron Vercel di plan Hobby cuma boleh harian (09:00 WIB), jadi sync yang
// diantrekan dari frontend baru dikerjakan besok pagi. Skrip ini mengangkat
// SEMUA job yang antre sekarang juga, pakai worker yang sama persis --
// hasilnya identik dengan yang cron lakukan.
//
// Pemakaian:
//   node src/scripts/sync-jalankan.js            # proses semua job antre
//   node src/scripts/sync-jalankan.js --status   # lihat job yang antre saja

// .env.local dulu, baru .env (pola sama dengan skrip lain).
require("dotenv").config({ path: ".env.local" });
require("dotenv").config();
const prisma = require("../config/prisma");
const { langkahUtama } = require("./sync-worker");

(async () => {
  const antre = await prisma.sync_log.findMany({
    where: { status: "berjalan" },
    orderBy: { waktu_mulai: "asc" },
  });

  if (!antre.length) {
    console.log("Tidak ada sync yang antre. Semua sudah diproses.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Job antre: ${antre.length}`);
  for (const j of antre) {
    console.log(`  - ${j.sync_id.slice(0, 8)} (${j.tipe}, dibuat ${j.waktu_mulai.toISOString().slice(11, 16)} UTC)`);
  }
  console.log();

  // Angkat penjaga umur-minimum: job yang sudah lama menunggu boleh langsung
  // diproses tanpa jeda 20 detik.
  for (const j of antre) {
    const umur = Date.now() - j.waktu_mulai.getTime();
    if (umur < 20 * 1000) {
      await prisma.sync_log.update({
        where: { sync_id: j.sync_id },
        data: { waktu_mulai: new Date(Date.now() - 21 * 1000) },
      });
    }
  }

  const MULAI = Date.now();
  let langkah = 0;
  while (Date.now() - MULAI < 10 * 60 * 1000) {
    const r = await langkahUtama();
    langkah++;
    if (r.kerja === false) break;
    if (r.hasil) console.log(`[${langkah}] ${r.sync_id.slice(0, 8)}: ${r.hasil}`);
  }

  console.log();
  const sisa = await prisma.sync_log.count({ where: { status: "berjalan" } });
  const selesai = await prisma.sync_log.findMany({
    where: { status: { in: ["berhasil", "gagal"] }, waktu_selesai: { gte: new Date(MULAI) } },
    orderBy: { waktu_selesai: "desc" },
  });
  for (const s of selesai) {
    console.log(`${s.sync_id.slice(0, 8)}: ${s.status.toUpperCase()} | ${s.total_data} data | +${s.data_baru} baru, ${s.data_diperbarui} update, ${s.data_gagal} gagal`);
  }
  console.log(`\nSelesai dalam ${((Date.now() - MULAI) / 1000).toFixed(1)}s. Sisa antre: ${sisa}`);

  await prisma.$disconnect();
})().catch((e) => {
  console.error("Gagal:", e.message);
  process.exit(1);
});
