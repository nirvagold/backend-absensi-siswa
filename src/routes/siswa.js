const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");

const auth = authMiddleware();

// GET /api/siswa
router.get("/", auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const kelas = req.query.kelas || "";

    const where = { is_active: true };
    if (search) {
      where.OR = [
        { nama: { contains: search, mode: "insensitive" } },
        { nisn: { contains: search } },
        { nipd: { contains: search } },
      ];
    }
    if (kelas) where.nama_rombel = kelas;

    const [total, siswa] = await Promise.all([
      prisma.siswa.count({ where }),
      prisma.siswa.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nama: "asc" },
      }),
    ]);

    res.json({
      ...dapodikResponse(siswa, { idField: "peserta_didik_id", limit }),
      results: total,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Siswa list error:", err);
    res.status(500).json(errorResponse("Gagal mengambil data siswa", "INTERNAL_ERROR", 500));
  }
});

// GET /api/siswa/:id
router.get("/:id", auth, async (req, res) => {
  try {
    const siswa = await prisma.siswa.findUnique({ where: { peserta_didik_id: req.params.id } });
    if (!siswa) {
      return res.status(404).json(errorResponse("Siswa tidak ditemukan", "STUDENT_NOT_FOUND", 404));
    }
    res.json(dapodikResponse(siswa, { idField: "peserta_didik_id", limit: 1 }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal mengambil data siswa", "INTERNAL_ERROR", 500));
  }
});

// POST /api/siswa
router.post("/", auth, async (req, res) => {
  try {
    const { nisn, nama, jenis_kelamin, ...rest } = req.body;
    if (!nisn || !nama || !jenis_kelamin) {
      return res.status(400).json(errorResponse("nisn, nama, jenis_kelamin wajib diisi", "VALIDATION_ERROR"));
    }

    const existing = await prisma.siswa.findUnique({ where: { nisn } });
    if (existing) {
      return res.status(409).json(errorResponse("NISN sudah terdaftar", "SISWA_ALREADY_EXISTS", 409));
    }

    const siswa = await prisma.siswa.create({
      data: {
        peserta_didik_id: req.body.peserta_didik_id || undefined,
        sekolah_id: req.user.sekolah_id,
        nisn,
        nama,
        jenis_kelamin,
        ...rest,
      },
    });

    res.status(201).json(dapodikResponse(siswa, { idField: "peserta_didik_id", limit: 1 }));
  } catch (err) {
    console.error("Siswa create error:", err);
    res.status(500).json(errorResponse("Gagal menambah siswa", "INTERNAL_ERROR", 500));
  }
});

module.exports = router;