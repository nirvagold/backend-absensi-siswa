const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");

const auth = authMiddleware();

// GET /api/dashboard/ringkasan
router.get("/ringkasan", auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const besok = new Date(today);
    besok.setDate(besok.getDate() + 1);

    const where = { tanggal: { gte: today, lt: besok }, sekolah_id: req.user.sekolah_id };

    const kelasFilter = req.user.peran_id_str === "Guru" && req.user.nama_rombel
      ? { nama_rombel: req.user.nama_rombel } : {};

    const [total_siswa, absensi] = await Promise.all([
      prisma.siswa.count({ where: { sekolah_id: req.user.sekolah_id, is_active: true, ...kelasFilter } }),
      prisma.absensi.findMany({
        where: {
          ...where,
          ...(kelasFilter.nama_rombel ? { siswa: { nama_rombel: kelasFilter.nama_rombel } } : {}),
        },
      }),
    ]);

    const hadir = absensi.filter((a) => a.status === "Hadir").length;
    const terlambat = absensi.filter((a) => a.status === "Terlambat").length;
    const izin = absensi.filter((a) => a.status === "Izin").length;
    const sakit = absensi.filter((a) => a.status === "Sakit").length;
    const tidak_hadir = absensi.filter((a) => a.status === "Tidak Hadir").length;

    const data = {
      tanggal: today.toISOString().split("T")[0],
      total_siswa,
      hadir,
      terlambat,
      izin,
      sakit,
      tidak_hadir,
      persentase_hadir: total_siswa > 0 ? +((hadir / total_siswa) * 100).toFixed(2) : 0,
    };

    res.json(dapodikResponse(data, { idField: "tanggal", limit: 1 }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal ambil dashboard", "INTERNAL_ERROR", 500));
  }
});

// GET /api/dashboard/siswa-bermasalah
router.get("/siswa-bermasalah", auth, async (req, res) => {
  try {
    const siswa = await prisma.siswa.findMany({
      where: { sekolah_id: req.user.sekolah_id, is_active: true },
      select: { peserta_didik_id: true, nama: true, nama_rombel: true },
    });

    const result = [];
    for (const s of siswa) {
      const totalAbsen = await prisma.absensi.count({
        where: { peserta_didik_id: s.peserta_didik_id, status: "Tidak Hadir" },
      });
      if (totalAbsen >= 3) {
        result.push({
          peserta_didik_id: s.peserta_didik_id,
          nama: s.nama,
          nama_rombel: s.nama_rombel,
          total_alfa: totalAbsen,
        });
      }
    }

    res.json(dapodikResponse(result, { idField: "peserta_didik_id" }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal ambil data", "INTERNAL_ERROR", 500));
  }
});

// GET /api/dashboard/tren
router.get("/tren", auth, async (req, res) => {
  try {
    const now = new Date();
    const data = [];

    for (let i = 6; i >= 0; i--) {
      const tgl = new Date(now);
      tgl.setDate(tgl.getDate() - i);
      tgl.setHours(0, 0, 0, 0);
      const besok = new Date(tgl);
      besok.setDate(besok.getDate() + 1);

      const total = await prisma.siswa.count({ where: { sekolah_id: req.user.sekolah_id, is_active: true } });
      const hadirCount = await prisma.absensi.count({
        where: { sekolah_id: req.user.sekolah_id, tanggal: { gte: tgl, lt: besok }, status: { not: "Tidak Hadir" } },
      });

      data.push({
        tanggal: tgl.toISOString().split("T")[0],
        hadir: hadirCount,
        persentase: total > 0 ? +((hadirCount / total) * 100).toFixed(1) : 0,
      });
    }

    res.json(dapodikResponse(data, { idField: "tanggal" }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal ambil tren", "INTERNAL_ERROR", 500));
  }
});

module.exports = router;