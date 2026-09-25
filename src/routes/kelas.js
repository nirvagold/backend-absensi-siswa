const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");

const auth = authMiddleware();

// GET /api/kelas
router.get("/", auth, async (req, res) => {
  try {
    const result = await prisma.siswa.groupBy({
      by: ["nama_rombel"],
      where: { sekolah_id: req.user.sekolah_id, is_active: true, nama_rombel: { not: null } },
      _count: { peserta_didik_id: true },
      orderBy: { nama_rombel: "asc" },
    });

    const rows = result.map((r) => ({
      nama_rombel: r.nama_rombel,
      total_siswa: r._count.peserta_didik_id,
    }));

    res.json(dapodikResponse(rows, { idField: "nama_rombel" }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal ambil daftar kelas", "INTERNAL_ERROR", 500));
  }
});

module.exports = router;