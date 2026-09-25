const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const axios = require("axios");

const adminAuth = authMiddleware(["Admin"]);

// Kirim WA via Fonnte
async function kirimWA(nomor, pesan) {
  try {
    const token = process.env.WA_ACCESS_TOKEN;
    const phoneId = process.env.WA_PHONE_NUMBER_ID;
    if (!token || !phoneId) return { status: "gagal", error: "WA token/phone ID belum diset" };

    const res = await axios.post(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      messaging_product: "whatsapp",
      to: nomor.replace(/^0/, "62").replace(/[^0-9]/g, ""),
      type: "text",
      text: { body: pesan },
    }, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    if (res.data?.messages?.[0]?.id) {
      return { status: "dikirim", wa_id: res.data.messages[0].id };
    }
    return { status: "gagal", error: JSON.stringify(res.data) };
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