const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const axios = require("axios");

const adminAuth = authMiddleware(["Admin"]);

// POST /api/sync/dapodik
router.post("/", adminAuth, async (req, res) => {
  try {
    const npsn = req.body.npsn || process.env.DAPODIK_NPSN;
    const tipe = req.body.tipe || "peserta_didik";
    const baseUrl = req.body.ngrok_url || process.env.DAPODIK_NGROK_URL;
    if (!npsn || !baseUrl) {
      return res.status(400).json(errorResponse("npsn dan URL Dapodik wajib diisi", "VALIDATION_ERROR"));
    }
    if (!baseUrl) {
      return res.status(400).json(errorResponse("URL Dapodik belum dikonfigurasi", "DAPODIK_CONFIG_MISSING"));
    }

    // Buat log sinkronisasi
    const syncLog = await prisma.sync_log.create({
      data: {
        sekolah_id: req.user.sekolah_id,
        tipe: tipe || "peserta_didik",
        dieksekusi_oleh: req.user.pengguna_id,
      },
    });

    // Panggil endpoint Dapodik
    const token = process.env.DAPODIK_TOKEN;
    try {
      const response = await axios.get(`${baseUrl}/WebService/getPesertaDidik`, {
        params: { npsn },
        headers: {
          Authorization: `Bearer ${token}`,
          "ngrok-skip-browser-warning": "true",
        },
        timeout: 45000,
      });

      const dataDapodik = response.data;
      if (!dataDapodik.rows || !Array.isArray(dataDapodik.rows)) {
        throw new Error("Format response Dapodik tidak valid");
      }

      // Proses & simpan data
      let baru = 0, update = 0, gagal = 0;

      for (const row of dataDapodik.rows) {
        try {
          const existing = await prisma.siswa.findUnique({
            where: { peserta_didik_id: row.peserta_didik_id },
          });

          const dataSiswa = {
            sekolah_id: req.user.sekolah_id,
            nisn: row.nisn,
            nipd: row.nipd || null,
            nama: row.nama,
            jenis_kelamin: row.jenis_kelamin,
            nik: row.nik || null,
            tempat_lahir: row.tempat_lahir || null,
            tanggal_lahir: row.tanggal_lahir ? new Date(row.tanggal_lahir) : null,
            agama_id_str: row.agama_id_str || null,
            alamat_jalan: row.alamat_jalan || null,
            rt: row.rt || null,
            rw: row.rw || null,
            nama_ayah: row.nama_ayah || null,
            nama_ibu: row.nama_ibu || null,
            nama_rombel: row.nama_rombel || null,
            tingkat_pendidikan_id: row.tingkat_pendidikan_id || null,
            nomor_telepon_seluler: row.nomor_telepon_seluler || null,
            is_active: true,
            sync_id: syncLog.sync_id,
          };

          if (existing) {
            await prisma.siswa.update({
              where: { peserta_didik_id: row.peserta_didik_id },
              data: dataSiswa,
            });
            update++;
          } else {
            await prisma.siswa.create({
              data: { peserta_didik_id: row.peserta_didik_id, ...dataSiswa },
            });
            baru++;
          }
        } catch (err) {
          gagal++;
          console.error("Gagal proses siswa:", row.nama, err.message);
        }
      }

      // Update status sync
      await prisma.sync_log.update({
        where: { sync_id: syncLog.sync_id },
        data: {
          status: "berhasil",
          total_data: dataDapodik.rows.length,
          data_baru: baru,
          data_diperbarui: update,
          data_gagal: gagal,
          waktu_selesai: new Date(),
        },
      });

      res.json(dapodikResponse({
        sync_id: syncLog.sync_id,
        status: "berhasil",
        total_data: dataDapodik.rows.length,
        data_baru: baru,
        data_diperbarui: update,
        data_gagal: gagal,
        waktu_mulai: syncLog.waktu_mulai,
        waktu_selesai: new Date(),
      }, { idField: "sync_id", limit: 1 }));

    } catch (dapodikErr) {
      // Gagal konek Dapodik
      await prisma.sync_log.update({
        where: { sync_id: syncLog.sync_id },
        data: {
          status: "gagal",
          log_error: dapodikErr.message,
          waktu_selesai: new Date(),
        },
      });

      return res.status(502).json(errorResponse(
        "Gagal terhubung ke Dapodik. Pastikan ngrok berjalan dan token valid.",
        "DAPODIK_CONNECTION_ERROR", 502
      ));
    }
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json(errorResponse("Sinkronisasi gagal diproses", "SYNC_FAILED", 500));
  }
});

// GET /api/sync/dapodik/status/:id
router.get("/status/:id", adminAuth, async (req, res) => {
  try {
    const log = await prisma.sync_log.findUnique({ where: { sync_id: req.params.id } });
    if (!log) return res.status(404).json(errorResponse("Sync tidak ditemukan", "NOT_FOUND", 404));
    res.json(dapodikResponse(log, { idField: "sync_id", limit: 1 }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal cek status", "INTERNAL_ERROR", 500));
  }
});

// GET /api/sync/dapodik/history
router.get("/history", adminAuth, async (req, res) => {
  try {
    const logs = await prisma.sync_log.findMany({
      where: { sekolah_id: req.user.sekolah_id },
      orderBy: { waktu_mulai: "desc" },
      take: 20,
    });
    res.json(dapodikResponse(logs, { idField: "sync_id" }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal ambil riwayat sync", "INTERNAL_ERROR", 500));
  }
});

module.exports = router;