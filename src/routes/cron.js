// Cron hooks (dipicu Vercel Cron atau scheduler lain).
// Endpoint ini tidak ber-role JWT biasa karena dipanggil oleh server cron,
// jadi dijaga oleh CRON_SECRET.
//
// Vercel Cron otomatis mengirim header: `Authorization: Bearer $CRON_SECRET`
// (lihat https://vercel.com/docs/cron-jobs — kalau env var CRON_SECRET diset).
// Untuk testing manual, header `x-cron-secret` juga diterima.

const router = require("express").Router();
const { tandaiAlphaSemuaSekolah } = require("../scripts/alpha");
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

module.exports = router;