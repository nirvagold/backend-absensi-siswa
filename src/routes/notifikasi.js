const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const axios = require("axios");

const adminAuth = authMiddleware(["Admin"]);

// Kirim WA via Fonnte
async function kirimWA(nomor, pesan) {
  try {
    const token = process.env.FONNTE_TOKEN;
    if (!token) return { status: "gagal", error: "FONNTE_TOKEN belum diset" };

    const res = await axios.post("https://api.fonnte.com/send", {
      target: nomor,
      message: pesan,
      countryCode: "62",
    }, {
      headers: { Authorization: token },
      timeout: 10000,
    });

    if (res.data?.status) {
      return { status: "dikirim" };
    }
    return { status: "gagal", error: res.data?.reason || "Unknown" };
  } catch (err) {
    return { status: "gagal", error: err.message };
  }
}

// GET /api/notifikasi/log
router.get("/log", adminAuth, async (req, res) => {
  try {
    const logs = await prisma.notifikasi_log.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
    });
    res.json(dapodikResponse(logs, { idField: "notifikasi_id" }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal ambil log", "INTERNAL_ERROR", 500));
  }
});

// POST /api/notifikasi/test — kirim WA test
router.post("/test", adminAuth, async (req, res) => {
  try {
    const { nomor, pesan } = req.body;
    if (!nomor) return res.status(400).json(errorResponse("Nomor wajib diisi", "VALIDATION_ERROR"));

    const hasil = await kirimWA(nomor, pesan || "Test notifikasi dari Sistem Absensi QR");
    res.json({ success: true, data: hasil });
  } catch (err) {
    res.status(500).json(errorResponse("Gagal kirim WA", "INTERNAL_ERROR", 500));
  }
});

module.exports = { router, kirimWA };