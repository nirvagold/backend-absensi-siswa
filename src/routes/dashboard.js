const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const { rentangHariWIB, awalHariWIBOffset, tanggalStrWIB } = require("../utils/waktu");
const { STATUS_HADIR } = require("../config/absensi");

const auth = authMiddleware();

// GET /api/dashboard/ringkasan
router.get("/ringkasan", auth, async (req, res) => {
  try {
    const { awal: today, akhir: besok } = rentangHariWIB(new Date());

    const where = { tanggal: { gte: today, lt: besok }, sekolah_id: req.user.sekolah_id };

    const kelasFilter = req.user.peran_id_str === "Guru" && req.user.nama_rombel
      ? req.user.nama_rombel.split(", ").length > 1
        ? { nama_rombel: { in: req.user.nama_rombel.split(", ") } }
        : { nama_rombel: req.user.nama_rombel }
      : {};

    const whereAbsenKelas = kelasFilter.nama_rombel
      ? { siswa: { nama_rombel: kelasFilter.nama_rombel } }
      : {};

    const [total_siswa, absensi] = await Promise.all([
      prisma.siswa.count({ where: { sekolah_id: req.user.sekolah_id, is_active: true, ...kelasFilter } }),
      prisma.absensi.findMany({
        where: {
          ...where,
          ...whereAbsenKelas,
        },
      }),
    ]);

    const hadir = absensi.filter((a) => a.status === "Hadir").length;
    const terlambat = absensi.filter((a) => a.status === "Terlambat").length;
    // Izin/Sakit: hitung dua bentuk -- status lama ("Izin"/"Sakit") DAN
    // bentuk baru ("Tidak Hadir" + keterangan). Biar data lama & baru kebaca.
    const izin =
      absensi.filter((a) => a.status === "Izin").length +
      absensi.filter((a) => a.status === "Tidak Hadir" && a.keterangan === "Izin").length;
    const sakit =
      absensi.filter((a) => a.status === "Sakit").length +
      absensi.filter((a) => a.status === "Tidak Hadir" && a.keterangan === "Sakit").length;
    const alpha = absensi.filter((a) => a.status === "Tidak Hadir" && a.keterangan === "Alpha").length;

    // Semua alasan ketidakhadiran (izin + sakit + alpha) -- angka "tidak hadir" yang
    // dipakai di kartu dashboard, biar konsisten sama ringkasan riwayat.
    const total_tidak_hadir = izin + sakit + alpha;
    // Siswa yang sudah tercatat hadir/terlambat hari ini.
    // Ini juga angka "hadir" buat grafik tren & tabel per kelas: yang dihitung
    // adalah siswa yang benar-benar hadir di sekolah (Hadir + Terlambat),
    // sama seperti `status: { not: "Tidak Hadir" }` di dua endpoint itu.
    const sudah_absen = hadir + terlambat;
    // Siswa yang belum punya catatan apa pun (belum scan, belum ditandai alpha).
    const belum_absen = Math.max(0, total_siswa - sudah_absen - total_tidak_hadir);

    const data = {
      tanggal: tanggalStrWIB(today),
      total_siswa,
      hadir,
      terlambat,
      izin,
      sakit,
      alpha,
      // alias lama: klien yang sudah telanjur baca `alfa` tetap jalan.
      alfa: alpha,
      // `tidak_hadir` = baris berstatus "Tidak Hadir" (izin/sakit/alpha bentuk baru),
      // artinya sama persis dengan `tidak_hadir` di ringkasan riwayat & filter status.
      tidak_hadir: absensi.filter((a) => a.status === "Tidak Hadir").length,
      // POINT #5: rincian buat kartu dashboard — berapa hadir, berapa tidak hadir.
      // `total_tidak_hadir` = SEMUA alasan ketidakhadiran (izin + sakit + alpha),
      // termasuk data lama yang statusnya masih "Izin"/"Sakit".
      total_tidak_hadir,
      sudah_absen,
      belum_absen,
      // "hadir" yang dipakai buat hitungan persentase = Hadir + Terlambat.
      // Terlambat tetap siswa yang hadir di sekolah, jadi tidak dikurangi dari
      // persentase kehadiran (dulu dikurangi, makanya angkanya beda sama grafik).
      hadir_hitung: sudah_absen,
      // Konsisten sama `persentase` di /tren & /per-kelas: (Hadir + Terlambat) / total.
      persentase_hadir: total_siswa > 0 ? +((sudah_absen / total_siswa) * 100).toFixed(1) : 0,
      persentase_tidak_hadir: total_siswa > 0 ? +((total_tidak_hadir / total_siswa) * 100).toFixed(1) : 0,
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
          total_alpha: totalAbsen,
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
      const { awal: tgl, akhir: besok } = rentangHariWIB(awalHariWIBOffset(now, -i));

      const total = await prisma.siswa.count({ where: { sekolah_id: req.user.sekolah_id, is_active: true } });
      // "Hadir" di grafik = siswa yang hadir di sekolah: Hadir + Terlambat.
      // Ditulis eksplisit (bukan `not: "Tidak Hadir"`) supaya baris lama yang
      // statusnya masih "Izin"/"Sakit" tidak ikut kehitung hadir.
      const hadirCount = await prisma.absensi.count({
        where: {
          sekolah_id: req.user.sekolah_id,
          tanggal: { gte: tgl, lt: besok },
          status: { in: STATUS_HADIR },
        },
      });

      data.push({
        tanggal: tanggalStrWIB(tgl),
        hadir: hadirCount,
        persentase: total > 0 ? +((hadirCount / total) * 100).toFixed(1) : 0,
      });
    }

    res.json(dapodikResponse(data, { idField: "tanggal" }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal ambil tren", "INTERNAL_ERROR", 500));
  }
});

// GET /api/dashboard/per-kelas
router.get("/per-kelas", auth, async (req, res) => {
  try {
    const { awal: today, akhir: besok } = rentangHariWIB(new Date());
    const kelasList = await prisma.siswa.groupBy({
      by: ["nama_rombel"],
      where: { sekolah_id: req.user.sekolah_id, is_active: true, nama_rombel: { not: null } },
      _count: { peserta_didik_id: true },
      orderBy: { nama_rombel: "asc" },
    });

    const rows = [];
    for (const k of kelasList) {
      const hadirCount = await prisma.absensi.count({
        where: {
          tanggal: { gte: today, lt: besok },
          status: { in: STATUS_HADIR },
          siswa: { nama_rombel: k.nama_rombel },
        },
      });

      rows.push({
        nama_rombel: k.nama_rombel,
        total_siswa: k._count.peserta_didik_id,
        hadir: hadirCount,
        persentase: k._count.peserta_didik_id > 0
          ? +((hadirCount / k._count.peserta_didik_id) * 100).toFixed(1)
          : 0,
      });
    }

    res.json(dapodikResponse(rows, { idField: "nama_rombel" }));
  } catch (err) {
    console.error("per-kelas error:", err);
    res.status(500).json(errorResponse("Gagal ambil per-kelas", "INTERNAL_ERROR", 500));
  }
});

module.exports = router;