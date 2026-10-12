const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const { statusDariJam, cekJamOperasional, jamBuka, jamTutup } = require("../config/absensi");
const { rentangHariWIB, jamStrWIB, tanggalStrWIB, dariTanggalStr } = require("../utils/waktu");
const { kirimWA, buatPesanAbsen, catatLog, waOtomatis } = require("./notifikasi");

const auth = authMiddleware();
const guruAuth = authMiddleware(["Admin", "Guru"]);

// POST /api/absensi/scan
router.post("/scan", guruAuth, async (req, res) => {
  try {
    const { kode, sesi_id } = req.body;
    if (!kode) {
      return res.status(400).json(errorResponse("Kode QR wajib diisi", "VALIDATION_ERROR"));
    }

    // Cari siswa langsung pake peserta_didik_id
    const siswa = await prisma.siswa.findUnique({
      where: { peserta_didik_id: kode },
    });

    if (!siswa) {
      return res.status(404).json(errorResponse("QR Code tidak dikenali. Siswa tidak ditemukan", "STUDENT_NOT_FOUND", 404));
    }

    // POINT #5: absen di luar jam sekolah tidak valid -> tolak.
    // Batasnya diatur ABSEN_JAM_MULAI / ABSEN_JAM_SELESAI (default 06:00 - 12:00 WIB).
    const wallTime = new Date(); // waktu scan sebenarnya
    const jamOp = cekJamOperasional(wallTime);
    if (!jamOp.valid) {
      return res.status(400).json({
        success: false,
        message: `Absen ditolak: ${jamOp.alasan}. Jam absen dibuka ${jamBuka()} - ${jamTutup()} WIB`,
        error_code: "OUTSIDE_ABSEN_HOURS",
        data: { waktu_scan: wallTime.toISOString(), jam_wib: jamStrWIB(wallTime) },
      });
    }

    // Cek udah absen belum hari ini (pakai batas hari WIB, bukan jam server)
    const { awal: today, akhir: besok } = rentangHariWIB(wallTime);

    const existing = await prisma.absensi.findFirst({
      where: {
        peserta_didik_id: siswa.peserta_didik_id,
        tanggal: { gte: today, lt: besok },
      },
    });

    // Alfa otomatis (metode "sistem" + keterangan "Alfa") BUKAN catatan manual --
    // kalau siswa ternyata datang dan scan, catatan itu ditimpa jadi "Terlambat".
    // Catatan hasil scan / input manual tetap tidak bisa ditimpa (poin di bawah).
    const alfaOtomatis =
      existing && existing.metode === "sistem" && existing.keterangan === "Alfa";

    if (existing && !alfaOtomatis) {
      return res.status(409).json({
        success: false,
        message: `Siswa sudah absen hari ini pukul ${jamStrWIB(existing.waktu_absen)} WIB`,
        error_code: "ALREADY_ABSENT",
        data: { waktu: existing.waktu_absen, status: existing.status },
      });
    }

    // Catat absensi. Status dihitung dari waktu scan vs batas jam (POINT #3).
    // Scan selalu berarti siswa hadir, paling jauh dianggap "Terlambat".
    const statusScan = statusDariJam(wallTime) || "Hadir";

    const absen = alfaOtomatis
      ? await prisma.absensi.update({
          where: { absensi_id: existing.absensi_id },
          data: {
            waktu_absen: wallTime,
            status: statusScan,
            metode: "scan",
            keterangan: null, // buang keterangan "Alfa"
            sesi_id: sesi_id || null,
            petugas_id: req.user.pengguna_id,
          },
        })
      : await prisma.absensi.create({
          data: {
            peserta_didik_id: siswa.peserta_didik_id,
            sekolah_id: siswa.sekolah_id,
            tanggal: today,
            waktu_absen: wallTime,
            status: statusScan,
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
      tanggal: tanggalStrWIB(today),
      waktu_absen: absen.waktu_absen.toISOString(),
      status: absen.status,
    };
    if (alfaOtomatis) hasil.diubah_dari_alfa = true;

    // Kirim WA otomatis hanya jika setting menyalakan (POINT #1),
    // dan hanya untuk status kehadiran yang butuh info ortu (Hadir/Terlambat).
    if (waOtomatis() && siswa.nomor_telepon_seluler && ["Hadir", "Terlambat"].includes(absen.status)) {
      const pesan = buatPesanAbsen(siswa, absen);
      kirimWA(siswa.nomor_telepon_seluler, pesan)
        .then(async (resWA) => {
          await catatLog(absen.absensi_id, siswa.nomor_telepon_seluler, `Absen: ${siswa.nama} - ${absen.status}`, resWA);
        })
        .catch(() => {});
    }

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

    // POINT #4: kalau status "Tidak Hadir", wajib pilih keterangan Izin/Sakit/Alfa.
    const keteranganIzinSakitAlfa = ["Izin", "Sakit", "Alfa"];
    if (status === "Tidak Hadir") {
      if (!keterangan || !keteranganIzinSakitAlfa.includes(keterangan)) {
        return res.status(400).json(errorResponse("Status 'Tidak Hadir' wajib diberi keterangan Izin, Sakit, atau Alfa", "VALIDATION_ERROR"));
      }
    }

    // Validasi siswa ada
    const siswaAda = await prisma.siswa.findUnique({ where: { peserta_didik_id } });
    if (!siswaAda) {
      return res.status(404).json(errorResponse("Siswa tidak ditemukan", "STUDENT_NOT_FOUND", 404));
    }

    const { awal: today, akhir: besok } = rentangHariWIB(new Date());

    // Cek dulu udah absen apa belum
    const existing = await prisma.absensi.findFirst({
      where: { peserta_didik_id, tanggal: { gte: today, lt: besok } },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Siswa sudah absen hari ini dengan status ${existing.status}`,
        error_code: "ALREADY_ABSENT",
        data: { waktu: existing.waktu_absen, status: existing.status },
      });
    }

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

    // Kirim WA otomatis ke ortu (POINT #1) HANYA untuk status kehadiran
    // (Hadir/Terlambat). Izin/Sakit/Tidak Hadir/Alfa tidak auto-kirim --
    // admin bisa kirim manual lewat POST /api/notifikasi/kirim/:absensi_id.
    if (waOtomatis() && siswaAda.nomor_telepon_seluler && ["Hadir", "Terlambat"].includes(status)) {
      const siswaPayload = { nama: siswaAda.nama };
      const absenPayload = {
        ...absen,
        status: status === "Tidak Hadir" ? `${status} (${keterangan})` : status,
      };
      const pesan = buatPesanAbsen(siswaPayload, absenPayload);
      kirimWA(siswaAda.nomor_telepon_seluler, pesan)
        .then(async (resWA) => {
          await catatLog(absen.absensi_id, siswaAda.nomor_telepon_seluler, `Absen: ${siswaAda.nama} - ${status}${keterangan ? ` (${keterangan})` : ""}`, resWA);
        })
        .catch(() => {});
    }

    res.json(dapodikResponse(absen, { idField: "absensi_id", limit: 1 }));
  } catch (err) {
    console.error("Manual absen error:", err);
    res.status(500).json(errorResponse("Gagal mencatat absensi", "INTERNAL_ERROR", 500));
  }
});

// GET /api/absensi/hari-ini
router.get("/hari-ini", auth, async (req, res) => {
  try {
    const { awal: today, akhir: besok } = rentangHariWIB(new Date());

    let whereAbsen = { tanggal: { gte: today, lt: besok } };
    if (req.user.peran_id_str === "Guru" && req.user.nama_rombel) {
      const kelasGuru = req.user.nama_rombel.split(", ").filter(Boolean);
      whereAbsen.siswa = { nama_rombel: kelasGuru.length > 1 ? { in: kelasGuru } : kelasGuru[0] };
    }

    const absensi = await prisma.absensi.findMany({
      where: whereAbsen,
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
      keterangan: a.keterangan,
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
    // tanggal_mulai & tanggal_selesai: "YYYY-MM-DD" WIB (inklusif dua-duanya)
    if (req.query.tanggal_mulai || req.query.tanggal_selesai) {
      const mulai = dariTanggalStr(req.query.tanggal_mulai);
      const selesai = dariTanggalStr(req.query.tanggal_selesai);
      if (mulai) where.tanggal = { gte: mulai };
      if (selesai && selesai !== null) {
        const akhir = new Date(selesai.getTime() + 24 * 60 * 60 * 1000);
        where.tanggal = { ...where.tanggal, lt: akhir };
      }
    }
    if (req.query.kelas) where.siswa = { nama_rombel: req.query.kelas };
    if (req.query.status) where.status = req.query.status;
    // Filter keterangan (Izin/Sakit/Alfa) — dipakai buat misahin "Tidak Hadir"
    if (req.query.keterangan) where.keterangan = req.query.keterangan;
    // Search nama / NISN (gabung pakai AND biar ga nabrak filter siswa di atas)
    const search = (req.query.search || "").trim();
    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          siswa: {
            OR: [
              { nama: { contains: search, mode: "insensitive" } },
              { nisn: { contains: search } },
            ],
          },
        },
      ];
    }

    const [total, absensi, perStatus, perKeterangan] = await Promise.all([
      prisma.absensi.count({ where }),
      prisma.absensi.findMany({
        where,
        skip,
        take: limit,
        include: { siswa: { select: { nama: true, nisn: true, nama_rombel: true } } },
        orderBy: { tanggal: "desc" },
      }),
      prisma.absensi.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.absensi.groupBy({
        by: ["keterangan"],
        where: { ...where, status: "Tidak Hadir" },
        _count: { _all: true },
      }),
    ]);

    const rows = absensi.map((a) => ({
      absensi_id: a.absensi_id,
      peserta_didik_id: a.peserta_didik_id,
      nisn: a.siswa.nisn,
      nama: a.siswa.nama,
      nama_rombel: a.siswa.nama_rombel,
      tanggal: tanggalStrWIB(a.tanggal),
      waktu_absen: a.waktu_absen.toISOString(),
      status: a.status,
      keterangan: a.keterangan,
      metode: a.metode,
    }));

    // Ringkasan dihitung dari SELURUH hasil filter (bukan cuma 1 halaman),
    // biar angkanya konsisten walau data lebih dari `limit`.
    const hitung = (s) => perStatus.find((p) => p.status === s)?._count._all || 0;
    const ket = (k) => perKeterangan.find((p) => p.keterangan === k)?._count._all || 0;

    const ringkasan = {
      total_siswa: total,
      hadir: hitung("Hadir"),
      terlambat: hitung("Terlambat"),
      izin: hitung("Izin") + ket("Izin"),
      sakit: hitung("Sakit") + ket("Sakit"),
      tidak_hadir: hitung("Tidak Hadir"),
      alfa: ket("Alfa"),
    };

    res.json({
      ...dapodikResponse(rows, { idField: "absensi_id", limit }),
      results: total,
      ringkasan,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json(errorResponse("Gagal mengambil riwayat absensi", "INTERNAL_ERROR", 500));
  }
});

// PUT /api/absensi/:id — ubah status/keterangan absensi.
// Dipakai untuk "edit alfa jadi izin/sakit" (POINT: alfa bisa diedit).
router.put("/:id", guruAuth, async (req, res) => {
  try {
    const { status, keterangan } = req.body;

    const absen = await prisma.absensi.findUnique({ where: { absensi_id: req.params.id } });
    if (!absen) {
      return res.status(404).json(errorResponse("Absensi tidak ditemukan", "NOT_FOUND", 404));
    }

    // Kalau status diberikan, validasi.
    if (status) {
      const validStatus = ["Hadir", "Terlambat", "Izin", "Sakit", "Tidak Hadir"];
      if (!validStatus.includes(status)) {
        return res.status(400).json(errorResponse("Status tidak valid", "VALIDATION_ERROR"));
      }

      // Sama seperti manual: "Tidak Hadir" wajib keterangan Izin/Sakit/Alfa.
      if (status === "Tidak Hadir") {
        if (!keterangan || !["Izin", "Sakit", "Alfa"].includes(keterangan)) {
          return res.status(400).json(errorResponse("Status 'Tidak Hadir' wajib diberi keterangan Izin, Sakit, atau Alfa", "VALIDATION_ERROR"));
        }
      }
    }

    const updated = await prisma.absensi.update({
      where: { absensi_id: req.params.id },
      data: {
        ...(status !== undefined && status !== null ? { status } : {}),
        ...(keterangan !== undefined ? { keterangan: keterangan || null } : {}),
      },
    });

    res.json(dapodikResponse(updated, { idField: "absensi_id", limit: 1 }));
  } catch (err) {
    console.error("Update absensi error:", err);
    res.status(500).json(errorResponse("Gagal memperbarui absensi", "INTERNAL_ERROR", 500));
  }
});

// GET /api/absensi/siswa/:id
router.get("/siswa/:id", auth, async (req, res) => {
  try {
    const absensi = await prisma.absensi.findMany({
      where: { peserta_didik_id: req.params.id },
      orderBy: { tanggal: "desc" },
      take: 30,
    });

    res.json(dapodikResponse(absensi, { idField: "absensi_id" }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal mengambil riwayat", "INTERNAL_ERROR", 500));
  }
});

// DELETE /api/absensi/:id — hapus riwayat absensi
router.delete("/:id", auth, async (req, res) => {
  try {
    const absen = await prisma.absensi.findUnique({ where: { absensi_id: req.params.id } });
    if (!absen) {
      return res.status(404).json(errorResponse("Absensi tidak ditemukan", "NOT_FOUND", 404));
    }

    // Hanya admin yang bisa hapus
    if (req.user.peran_id_str !== "Admin") {
      return res.status(403).json(errorResponse("Hanya admin yang bisa menghapus absensi", "FORBIDDEN_ACCESS", 403));
    }

    // Hapus notifikasi log terkait dulu
    await prisma.notifikasi_log.deleteMany({ where: { absensi_id: req.params.id } });
    await prisma.absensi.delete({ where: { absensi_id: req.params.id } });

    res.json({ success: true, message: "Absensi berhasil dihapus" });
  } catch (err) {
    console.error("Hapus absensi error:", err);
    res.status(500).json(errorResponse("Gagal menghapus absensi", "INTERNAL_ERROR", 500));
  }
});

module.exports = router;