const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const crypto = require("crypto");

const auth = authMiddleware();
const guruAuth = authMiddleware(["Admin", "Guru"]);

// md5 hash
function md5(s) {
  return crypto.createHash("md5").update(String(s)).digest("hex");
}

// POST /api/absensi/scan
router.post("/scan", guruAuth, async (req, res) => {
  try {
    const { kode, sesi_id } = req.body;
    if (!kode) {
      return res.status(400).json(errorResponse("Kode QR wajib diisi", "VALIDATION_ERROR"));
    }

    // Cari siswa berdasarkan md5(nisn)
    const semuaSiswa = await prisma.siswa.findMany({ where: { is_active: true } });
    const siswa = semuaSiswa.find((s) => md5(s.nisn) === kode);

    if (!siswa) {
      return res.status(404).json(errorResponse("QR Code tidak dikenali. Siswa tidak ditemukan", "STUDENT_NOT_FOUND", 404));
    }

    // Cek udah absen belum hari ini
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const besok = new Date(today);
    besok.setDate(besok.getDate() + 1);

    const existing = await prisma.absensi.findFirst({
      where: {
        peserta_didik_id: siswa.peserta_didik_id,
        tanggal: { gte: today, lt: besok },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Siswa sudah absen hari ini pukul ${existing.waktu_absen.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
        error_code: "ALREADY_ABSENT",
        data: { waktu: existing.waktu_absen, status: existing.status },
      });
    }

    // Catat absensi
    const absen = await prisma.absensi.create({
      data: {
        peserta_didik_id: siswa.peserta_didik_id,
        sekolah_id: siswa.sekolah_id,
        tanggal: today,
        status: "Hadir",
        metode: "scan",
        sesi_id: sesi_id || null,
        petugas_id: req.user.pengguna_id,
      },
    });

    const hasil = {
      absensi_id: absen.absensi_id,
      peserta_didik_id: siswa.peserta_didik_id,
      nisn: siswa.nisn,
      nama: siswa.nama,
      nama_rombel: siswa.nama_rombel,
      tanggal: today.toISOString().split("T")[0],
      waktu_absen: absen.waktu_absen.toISOString(),
      status: "Hadir",
      metode: "scan",
    };

    res.json(dapodikResponse(hasil, { idField: "absensi_id", limit: 1 }));
  } catch (err) {
    console.error("Scan error:", err);
    res.status(500).json(errorResponse("Terjadi kesalahan pada server", "INTERNAL_ERROR", 500));
  }
});

// POST /api/absensi/manual
router.post("/manual", guruAuth, async (req, res) => {
  try {
    const { peserta_didik_id, status, keterangan } = req.body;
    if (!peserta_didik_id || !status) {
      return res.status(400).json(errorResponse("peserta_didik_id dan status wajib diisi", "VALIDATION_ERROR"));
    }

    const validStatus = ["Hadir", "Terlambat", "Izin", "Sakit", "Tidak Hadir"];
    if (!validStatus.includes(status)) {
      return res.status(400).json(errorResponse("Status tidak valid", "VALIDATION_ERROR"));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const absen = await prisma.absensi.create({
      data: {
        peserta_didik_id,
        sekolah_id: req.user.sekolah_id,
        tanggal: today,
        waktu_absen: new Date(),
        status,
        metode: "manual",
        keterangan: keterangan || null,
        petugas_id: req.user.pengguna_id,
      },
    });

    res.json(dapodikResponse(absen, { idField: "absensi_id", limit: 1 }));
  } catch (err) {
    console.error("Manual absen error:", err);
    res.status(500).json(errorResponse("Gagal mencatat absensi", "INTERNAL_ERROR", 500));
  }
});

// GET /api/absensi/hari-ini
router.get("/hari-ini", auth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const besok = new Date(today);
    besok.setDate(besok.getDate() + 1);

    const absensi = await prisma.absensi.findMany({
      where: { tanggal: { gte: today, lt: besok } },
      include: { siswa: { select: { nama: true, nisn: true, nama_rombel: true } } },
      orderBy: { waktu_absen: "asc" },
    });

    const rows = absensi.map((a) => ({
      absensi_id: a.absensi_id,
      peserta_didik_id: a.peserta_didik_id,
      nisn: a.siswa.nisn,
      nama: a.siswa.nama,
      nama_rombel: a.siswa.nama_rombel,
      waktu_absen: a.waktu_absen.toISOString(),
      status: a.status,
      metode: a.metode,
    }));

    res.json(dapodikResponse(rows, { idField: "absensi_id" }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal mengambil absensi", "INTERNAL_ERROR", 500));
  }
});

// GET /api/absensi
router.get("/", auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.tanggal_mulai) where.tanggal = { gte: new Date(req.query.tanggal_mulai) };
    if (req.query.tanggal_selesai) where.tanggal = { ...where.tanggal, lte: new Date(req.query.tanggal_selesai) };
    if (req.query.kelas) where.siswa = { nama_rombel: req.query.kelas };
    if (req.query.status) where.status = req.query.status;

    const [total, absensi] = await Promise.all([
      prisma.absensi.count({ where }),
      prisma.absensi.findMany({
        where,
        skip,
        take: limit,
        include: { siswa: { select: { nama: true, nisn: true, nama_rombel: true } } },
        orderBy: { tanggal: "desc" },
      }),
    ]);

    const rows = absensi.map((a) => ({
      absensi_id: a.absensi_id,
      peserta_didik_id: a.peserta_didik_id,
      nisn: a.siswa.nisn,
      nama: a.siswa.nama,
      nama_rombel: a.siswa.nama_rombel,
      tanggal: a.tanggal.toISOString().split("T")[0],
      waktu_absen: a.waktu_absen.toISOString(),
      status: a.status,
      metode: a.metode,
    }));

    res.json({
      ...dapodikResponse(rows, { idField: "absensi_id", limit }),
      results: total,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json(errorResponse("Gagal mengambil riwayat absensi", "INTERNAL_ERROR", 500));
  }
});

module.exports = router;