const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");

const adminAuth = authMiddleware(["Admin"]);

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

module.exports = router;