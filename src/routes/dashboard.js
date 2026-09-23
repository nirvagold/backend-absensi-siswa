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

    const [total_siswa, absensi] = await Promise.all([
      prisma.siswa.count({ where: { sekolah_id: req.user.sekolah_id, is_active: true } }),
      prisma.absensi.findMany({ where }),
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

module.exports = router;