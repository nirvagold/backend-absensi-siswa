const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const crypto = require("crypto");

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

// PUT /api/siswa/:id
router.put("/:id", auth, async (req, res) => {
  try {
    const { nisn, nama, jenis_kelamin, ...rest } = req.body;
    const existing = await prisma.siswa.findUnique({ where: { peserta_didik_id: req.params.id } });
    if (!existing) {
      return res.status(404).json(errorResponse("Siswa tidak ditemukan", "STUDENT_NOT_FOUND", 404));
    }

    if (nisn && nisn !== existing.nisn) {
      const nisnExists = await prisma.siswa.findUnique({ where: { nisn } });
      if (nisnExists) {
        return res.status(409).json(errorResponse("NISN sudah terdaftar", "SISWA_ALREADY_EXISTS", 409));
      }
    }

    const data = {};
    if (nisn) data.nisn = nisn;
    if (nama) data.nama = nama;
    if (jenis_kelamin) data.jenis_kelamin = jenis_kelamin;
    Object.assign(data, rest);

    const siswa = await prisma.siswa.update({
      where: { peserta_didik_id: req.params.id },
      data,
    });

    res.json(dapodikResponse(siswa, { idField: "peserta_didik_id", limit: 1 }));
  } catch (err) {
    console.error("Siswa update error:", err);
    res.status(500).json(errorResponse("Gagal mengupdate siswa", "INTERNAL_ERROR", 500));
  }
});

// DELETE /api/siswa/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const existing = await prisma.siswa.findUnique({ where: { peserta_didik_id: req.params.id } });
    if (!existing) {
      return res.status(404).json(errorResponse("Siswa tidak ditemukan", "STUDENT_NOT_FOUND", 404));
    }

    // Soft delete
    await prisma.siswa.update({
      where: { peserta_didik_id: req.params.id },
      data: { is_active: false },
    });

    res.json({ success: true, message: "Siswa berhasil dinonaktifkan" });
  } catch (err) {
    console.error("Siswa delete error:", err);
    res.status(500).json(errorResponse("Gagal menghapus siswa", "INTERNAL_ERROR", 500));
  }
});

// GET /api/siswa/export
router.get("/export", auth, async (req, res) => {
  try {
    const siswa = await prisma.siswa.findMany({
      where: { is_active: true, sekolah_id: req.user.sekolah_id },
      orderBy: { nama: "asc" },
    });

    const header = "peserta_didik_id,nisn,nipd,nama,jenis_kelamin,nama_rombel,tingkat_pendidikan_id,nomor_telepon_seluler";
    const rows = siswa.map(s =>
      `${s.peserta_didik_id},${s.nisn},${s.nipd||""},"${s.nama}",${s.jenis_kelamin},${s.nama_rombel||""},${s.tingkat_pendidikan_id||""},${s.nomor_telepon_seluler||""}`
    ).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=siswa.csv");
    res.send(header + "\n" + rows);
  } catch (err) {
    res.status(500).json(errorResponse("Gagal export data siswa", "INTERNAL_ERROR", 500));
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
        peserta_didik_id: req.body.peserta_didik_id || crypto.randomUUID(),
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