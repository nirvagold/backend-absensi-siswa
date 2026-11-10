const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const { normalisasiFilter, rekapPerKelas } = require("../utils/dapodik");
const axios = require("axios");

const adminAuth = authMiddleware(["Admin"]);

async function panggilDapodik(baseUrl, endpoint, params, token) {
  const resp = await axios.get(`${baseUrl}/WebService/${endpoint}`, {
    params,
    headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "true" },
    timeout: 45000,
  });
  if (!resp.data.rows) throw new Error("Format response Dapodik tidak valid");
  return resp.data.rows;
}

// POST /api/sync/dapodik
// Body opsional:
//   kelas   : "KELAS 3A" atau "KELAS 3A,KELAS 3B" (array juga boleh)
//   tingkat : "3" atau ["1","2"] -- tingkat_pendidikan_id
// Kalau `kelas`/`tingkat` kosong, tarik semua (perilaku lama).
//
// Sejak background job: endpoint ini HANYA membuat sync_log "berjalan"
// berisi param_json (npsn/url/token/tipe/filter), langsung return < 1 detik.
// Pengerjaan sesungguhnya oleh worker cron per kelas (scripts/sync-worker.js)
// -- sync penuh butuh ±160 detik, mustahil di Vercel (maxDuration 10s).
router.post("/", adminAuth, async (req, res) => {
  try {
    const npsn = req.body.npsn || process.env.DAPODIK_NPSN;
    const baseUrl = req.body.ngrok_url || process.env.DAPODIK_NGROK_URL;
    const token = req.body.token || process.env.DAPODIK_TOKEN;
    const tipe = req.body.tipe || "all";

    if (!npsn || !baseUrl || !token) {
      return res.status(400).json(errorResponse("npsn, URL, dan token Dapodik wajib diisi", "VALIDATION_ERROR"));
    }

    const filterKelas = normalisasiFilter(req.body.kelas);
    const filterTingkat = normalisasiFilter(req.body.tingkat);
    const adaFilter = filterKelas.length > 0 || filterTingkat.length > 0;

    const syncLog = await prisma.sync_log.create({
      data: {
        sekolah_id: req.user.sekolah_id,
        dieksekusi_oleh: req.user.pengguna_id,
        tipe,
        tahap: "menunggu",
        param_json: JSON.stringify({ npsn, baseUrl, token, tipe, filterKelas, filterTingkat }),
      },
    });

    res.json(dapodikResponse({
      sync_id: syncLog.sync_id,
      status: "berjalan",
      tahap: "menunggu",
      filter_dipakai: adaFilter ? { kelas: filterKelas, tingkat: filterTingkat } : null,
      waktu_mulai: syncLog.waktu_mulai,
      pesan: "Sinkronisasi antre. Worker cron memproses per kelas; pantau lewat /status/:id.",
    }, { idField: "sync_id", limit: 1 }));
  } catch (err) {
    console.error("Sync error:", err.message);
    res.status(500).json(errorResponse("Sinkronisasi gagal", "SYNC_FAILED", 500));
  }
});

router.get("/status/:id", adminAuth, async (req, res) => {
  const log = await prisma.sync_log.findUnique({ where: { sync_id: req.params.id } });
  if (!log) return res.status(404).json(errorResponse("Sync tidak ditemukan", "NOT_FOUND", 404));
  res.json(dapodikResponse(log, { idField: "sync_id", limit: 1 }));
});

router.get("/history", adminAuth, async (req, res) => {
  const logs = await prisma.sync_log.findMany({
    where: { sekolah_id: req.user.sekolah_id },
    orderBy: { waktu_mulai: "desc" }, take: 20,
  });
  res.json(dapodikResponse(logs, { idField: "sync_id" }));
});

// GET /api/sync/kelas-dapodik
// Lihat dulu kelas apa aja yang ada di Dapodik beserta jumlah siswanya,
// sebelum narik datanya. Berguna biar ga salah nulis nama kelas.
// Query: ngrok_url, token (opsional, fallback ke env)
router.get("/kelas-dapodik", adminAuth, async (req, res) => {
  try {
    const npsn = req.query.npsn || process.env.DAPODIK_NPSN;
    const baseUrl = req.query.ngrok_url || process.env.DAPODIK_NGROK_URL;
    const token = req.query.token || process.env.DAPODIK_TOKEN;

    if (!npsn || !baseUrl || !token) {
      return res.status(400).json(errorResponse("npsn, URL, dan token Dapodik wajib diisi", "VALIDATION_ERROR"));
    }

    const rows = await panggilDapodik(baseUrl, "getPesertaDidik", { npsn }, token);
    const perKelas = rekapPerKelas(rows);

    // Bandingkan sama yang sudah ada di DB, biar kelihatan bedanya.
    const diDb = await prisma.siswa.groupBy({
      by: ["nama_rombel"],
      where: { sekolah_id: req.user.sekolah_id, is_active: true },
      _count: { _all: true },
    });
    const petaDb = new Map(diDb.map((r) => [r.nama_rombel, r._count._all]));

    res.json(dapodikResponse(
      perKelas.map((k) => ({
        nama_rombel: k.nama_rombel,
        jumlah_dapodik: k.jumlah,
        jumlah_di_db: petaDb.get(k.nama_rombel) ?? 0,
      })),
      { idField: "nama_rombel" }
    ));
  } catch (err) {
    console.error("Gagal ambil daftar kelas Dapodik:", err.message);
    res.status(500).json(errorResponse("Gagal ambil daftar kelas dari Dapodik", "SYNC_FAILED", 500));
  }
});

module.exports = router;
