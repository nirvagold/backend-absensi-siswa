// Cron hooks (dipicu Vercel Cron atau scheduler lain).
// Endpoint ini tidak ber-role JWT biasa karena dipanggil oleh server cron,
// jadi dijaga oleh CRON_SECRET.
//
// Vercel Cron otomatis mengirim header: `Authorization: Bearer $CRON_SECRET`
// (lihat https://vercel.com/docs/cron-jobs — kalau env var CRON_SECRET diset).
// Untuk testing manual, header `x-cron-secret` juga diterima.

const router = require("express").Router();
const { tandaiAlphaSemuaSekolah } = require("../scripts/alpha");
const { langkahUtama } = require("../scripts/sync-worker");
const { errorResponse } = require("../utils/response");

function cekSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;

  // Kalau CRON_SECRET belum diset, jangan pernah buka endpoint ini.
  if (!secret) {
    return res.status(503).json({ success: false, message: "CRON_SECRET belum diset", error_code: "CRON_UNCONFIGURED" });
  }

  // Terima dua bentuk header:
  //  - Authorization: Bearer <secret>  (format resmi Vercel Cron)
  //  - x-cron-secret: <secret>         (buat testing manual)
  const authHeader = req.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const custom = req.get("x-cron-secret");
  const given = bearer || custom;

  if (!given || given !== secret) {
    return res.status(401).json({ success: false, message: "Secret tidak valid", error_code: "CRON_UNAUTHORIZED" });
  }
  next();
}

// GET /api/cron/alpha?tanggal=YYYY-MM-DD
// Tandai semua siswa yang belum scan pada tanggal tsb (default hari ini)
// menjadi "Tidak Hadir" + keterangan "Alpha".
// Idempoten: siswa yang sudah bersabsen hari itu tidak di-overwrite.
router.get("/alpha", cekSecret, async (req, res) => {
  try {
    const tgl = req.query.tanggal ? new Date(req.query.tanggal) : new Date();
    const hasil = await tandaiAlphaSemuaSekolah(tgl);
    res.json({ success: true, data: hasil });
  } catch (err) {
    console.error("Cron alpha error:", err);
    res.status(500).json(errorResponse("Gagal menjalankan cron alpha", "INTERNAL_ERROR", 500));
  }
});

// GET /api/cron/sync — worker sinkronisasi Dapodik.
// Dipanggil Vercel Cron tiap 1 menit (lihat vercel.json). Satu invokasi =
// SATU kelas diproses, jadi selalu jauh di bawah batas maxDuration 10s.
// Frontend tidak perlu tahu endpoint ini: progres dia pantau lewat
// GET /api/sync/dapodik/status/:id yang membaca sync_log.
router.get("/sync", cekSecret, async (req, res) => {
  try {
    const hasil = await langkahUtama();
    res.json({ success: true, data: hasil });
  } catch (err) {
    console.error("Cron sync error:", err.message);
    res.status(500).json(errorResponse("Worker sync gagal", "SYNC_FAILED", 500));
  }
});

module.exports = router;