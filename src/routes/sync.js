const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const axios = require("axios");
const bcrypt = require("bcryptjs");

const adminAuth = authMiddleware(["Admin"]);

async function panggilDapodik(baseUrl, endpoint, params, token) {
  const resp = await axios.get(`${baseUrl}/WebService/${endpoint}`, {
    params,
    headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "true" },
    timeout: 45000,
  });
  if (!resp.data.rows) throw new Error("Format response Dapodik tidak valid");
  return resp.data.rows;
}

async function syncPesertaDidik(rows, sekolahId, syncId) {
  let baru = 0, update = 0, gagal = 0;
  for (const row of rows) {
    try {
      const data = {
        sekolah_id: sekolahId,
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
        sync_id: syncId,
      };

      const ada = await prisma.siswa.findUnique({ where: { peserta_didik_id: row.peserta_didik_id } });
      if (ada) {
        await prisma.siswa.update({ where: { peserta_didik_id: row.peserta_didik_id }, data });
        update++;
      } else {
        await prisma.siswa.create({ data: { peserta_didik_id: row.peserta_didik_id, ...data } });
        baru++;
      }
    } catch (err) {
      gagal++;
    }
  }
  return { baru, update, gagal, total: rows.length };
}

async function syncPengguna(rows, sekolahId, syncId) {
  let baru = 0, update = 0, gagal = 0;
  const hash = await bcrypt.hash("dapodik123", 12);

  for (const row of rows) {
    try {
      const peran = row.peran_id_str;
      if (!["PTK", "Wali Kelas", "Kepala Sekolah"].includes(peran)) continue;

      let role = "Guru";
      if (peran === "Kepala Sekolah") role = "Kepala Sekolah";

      const ada = await prisma.users.findUnique({ where: { username: row.username } });
      if (!ada) {
        await prisma.users.create({
          data: {
            sekolah_id: sekolahId,
            username: row.username,
            password_hash: hash,
            nama: row.nama,
            peran_id_str: role,
            ptk_id: row.ptk_id || null,
          },
        });
        baru++;
      }
    } catch (err) {
      gagal++;
    }
  }
  return { baru, update, gagal, total: rows.length };
}

async function syncRombel(rows) {
  let cocok = 0;
  let gagal = 0;

  for (const row of rows) {
    try {
      if (!row.ptk_id || !row.nama) continue;

      // Cari user berdasarkan ptk_id
      const user = await prisma.users.findFirst({ where: { ptk_id: row.ptk_id } });
      if (user && user.peran_id_str === "Guru") {
        await prisma.users.update({
          where: { pengguna_id: user.pengguna_id },
          data: { nama_rombel: row.nama },
        });
        cocok++;
      }
    } catch (err) {
      gagal++;
    }
  }
  return { cocok, gagal };
}

// POST /api/sync/dapodik
router.post("/", adminAuth, async (req, res) => {
  try {
    const npsn = req.body.npsn || process.env.DAPODIK_NPSN;
    const baseUrl = req.body.ngrok_url || process.env.DAPODIK_NGROK_URL;
    const token = req.body.token || process.env.DAPODIK_TOKEN;
    const tipe = req.body.tipe || "peserta_didik";

    if (!npsn || !baseUrl || !token) {
      return res.status(400).json(errorResponse("npsn, URL, dan token Dapodik wajib diisi", "VALIDATION_ERROR"));
    }

    const syncLog = await prisma.sync_log.create({
      data: { sekolah_id: req.user.sekolah_id, dieksekusi_oleh: req.user.pengguna_id },
    });

    if (tipe === "peserta_didik" || tipe === "all") {
      const rows = await panggilDapodik(baseUrl, "getPesertaDidik", { npsn }, token);
      const hasil = await syncPesertaDidik(rows, req.user.sekolah_id, syncLog.sync_id);
      await prisma.sync_log.update({
        where: { sync_id: syncLog.sync_id },
        data: { total_data: hasil.total, data_baru: hasil.baru, data_diperbarui: hasil.update, data_gagal: hasil.gagal },
      });
    }

    if (tipe === "pengguna" || tipe === "all") {
      const rows = await panggilDapodik(baseUrl, "getPengguna", { npsn }, token);
      const hasil = await syncPengguna(rows, req.user.sekolah_id, syncLog.sync_id);
    }

    if (tipe === "rombongan_belajar" || tipe === "all") {
      const rows = await panggilDapodik(baseUrl, "getRombonganBelajar", { npsn }, token);
      const hasil = await syncRombel(rows);
    }

    await prisma.sync_log.update({
      where: { sync_id: syncLog.sync_id },
      data: { status: "berhasil", waktu_selesai: new Date() },
    });

    res.json(dapodikResponse({
      sync_id: syncLog.sync_id,
      status: "berhasil",
      waktu_mulai: syncLog.waktu_mulai,
      waktu_selesai: new Date(),
    }, { idField: "sync_id", limit: 1 }));

  } catch (err) {
    console.error("Sync error:", err.message);
    res.status(500).json(errorResponse("Sinkronisasi gagal", "SYNC_FAILED", 500));
  }
});

router.get("/status/:id", adminAuth, async (req, res) => {
  const log = await prisma.sync_log.findUnique({ where: { sync_id: req.params.id } });
  if (!log) return res.status(404).json(errorResponse("Sync tidak ditemukan", "NOT_FOUND", 404));
  res.json(dapodikResponse(log, { idField: "sync_id", limit: 1 }));
});

router.get("/history", adminAuth, async (req, res) => {
  const logs = await prisma.sync_log.findMany({
    where: { sekolah_id: req.user.sekolah_id },
    orderBy: { waktu_mulai: "desc" }, take: 20,
  });
  res.json(dapodikResponse(logs, { idField: "sync_id" }));
});

module.exports = router;