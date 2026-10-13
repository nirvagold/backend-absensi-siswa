const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const { normalisasiFilter, saringPesertaDidik, rekapPerKelas } = require("../utils/dapodik");
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
  const daftarGagal = [];

  for (const row of rows) {
    try {
      // NISN wajib & unik di DB, tapi Dapodik kadang mengirim null
      // (mis. siswa baru yang NISN-nya belum terbit).
      // Dipakai NIPD dulu, baru ID Dapodik, biar siswanya tetap masuk.
      const nisn = row.nisn ? String(row.nisn).trim()
        : String(row.nipd || "").trim() || `DAPODIK-${row.peserta_didik_id}`;

      const data = {
        sekolah_id: sekolahId,
        nisn,
        nipd: row.nipd || null,
        nama: row.nama,
        jenis_kelamin: row.jenis_kelamin,
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
      // Jangan ditelan diam-diam: simpan siapa & kenapa, biar kelihatan
      // kalau ada yang gagal masuk.
      gagal++;
      if (daftarGagal.length < 20) {
        daftarGagal.push({
          peserta_didik_id: row.peserta_didik_id,
          nama: row.nama || null,
          nisn: row.nisn || null,
          alasan: String(err.message || err).split("\n").map((s) => s.trim()).filter(Boolean).pop()?.slice(0, 200) || "tidak diketahui",
        });
      }
    }
  }
  return { baru, update, gagal, total: rows.length, daftar_gagal: daftarGagal };
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
        const kelasSekarang = user.nama_rombel || "";
        const kelasList = kelasSekarang.split(", ").filter(Boolean);
        if (!kelasList.includes(row.nama)) {
          kelasList.push(row.nama);
        }
        await prisma.users.update({
          where: { pengguna_id: user.pengguna_id },
          data: { nama_rombel: kelasList.join(", ") },
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
// Body opsional:
//   kelas   : "KELAS 3A" atau "KELAS 3A,KELAS 3B" (array juga boleh)
//   tingkat : "3" atau ["1","2"] -- tingkat_pendidikan_id
// Kalau `kelas`/`tingkat` kosong, tarik semua (perilaku lama).
router.post("/", adminAuth, async (req, res) => {
  try {
    const npsn = req.body.npsn || process.env.DAPODIK_NPSN;
    const baseUrl = req.body.ngrok_url || process.env.DAPODIK_NGROK_URL;
    const token = req.body.token || process.env.DAPODIK_TOKEN;
    const tipe = req.body.tipe || "all";

    if (!npsn || !baseUrl || !token) {
      return res.status(400).json(errorResponse("npsn, URL, dan token Dapodik wajib diisi", "VALIDATION_ERROR"));
    }

    const filterKelas = normalisasiFilter(req.body.kelas);
    const filterTingkat = normalisasiFilter(req.body.tingkat);
    const adaFilter = filterKelas.length > 0 || filterTingkat.length > 0;

    const syncLog = await prisma.sync_log.create({
      data: { sekolah_id: req.user.sekolah_id, dieksekusi_oleh: req.user.pengguna_id },
    });

    let hasilPesertaDidik = null;

    if (tipe === "peserta_didik" || tipe === "all") {
      const semua = await panggilDapodik(baseUrl, "getPesertaDidik", { npsn }, token);
      const rows = saringPesertaDidik(semua, filterKelas, filterTingkat);
      hasilPesertaDidik = await syncPesertaDidik(rows, req.user.sekolah_id, syncLog.sync_id);
      hasilPesertaDidik.total_di_dapodik = semua.length;
      await prisma.sync_log.update({
        where: { sync_id: syncLog.sync_id },
        data: {
          total_data: hasilPesertaDidik.total,
          data_baru: hasilPesertaDidik.baru,
          data_diperbarui: hasilPesertaDidik.update,
          data_gagal: hasilPesertaDidik.gagal,
          log_error: hasilPesertaDidik.gagal > 0
            ? JSON.stringify(hasilPesertaDidik.daftar_gagal)
            : null,
        },
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
      filter_dipakai: adaFilter ? { kelas: filterKelas, tingkat: filterTingkat } : null,
      peserta_didik: hasilPesertaDidik,
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

// GET /api/sync/kelas-dapodik
// Lihat dulu kelas apa aja yang ada di Dapodik beserta jumlah siswanya,
// sebelum narik datanya. Berguna biar ga salah nulis nama kelas.
// Query: ngrok_url, token (opsional, fallback ke env)
router.get("/kelas-dapodik", adminAuth, async (req, res) => {
  try {
    const npsn = req.query.npsn || process.env.DAPODIK_NPSN;
    const baseUrl = req.query.ngrok_url || process.env.DAPODIK_NGROK_URL;
    const token = req.query.token || process.env.DAPODIK_TOKEN;

    if (!npsn || !baseUrl || !token) {
      return res.status(400).json(errorResponse("npsn, URL, dan token Dapodik wajib diisi", "VALIDATION_ERROR"));
    }

    const rows = await panggilDapodik(baseUrl, "getPesertaDidik", { npsn }, token);
    const perKelas = rekapPerKelas(rows);

    // Bandingkan sama yang sudah ada di DB, biar kelihatan bedanya.
    const diDb = await prisma.siswa.groupBy({
      by: ["nama_rombel"],
      where: { sekolah_id: req.user.sekolah_id, is_active: true },
      _count: { _all: true },
    });
    const petaDb = new Map(diDb.map((r) => [r.nama_rombel, r._count._all]));

    res.json(dapodikResponse(
      perKelas.map((k) => ({
        nama_rombel: k.nama_rombel,
        jumlah_dapodik: k.jumlah,
        jumlah_di_db: petaDb.get(k.nama_rombel) ?? 0,
      })),
      { idField: "nama_rombel" }
    ));
  } catch (err) {
    console.error("Gagal ambil daftar kelas Dapodik:", err.message);
    res.status(500).json(errorResponse("Gagal ambil daftar kelas dari Dapodik", "SYNC_FAILED", 500));
  }
});

module.exports = router;