const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse } = require("../utils/response");
const { jamStrWIB, tanggalStrWIB } = require("../utils/waktu");
const axios = require("axios");

const adminAuth = authMiddleware(["Admin"]);
const guruAuth = authMiddleware(["Admin", "Guru"]);

// Kirim WA via Fonnte
async function kirimWA(nomor, pesan) {
  try {
    const token = process.env.FONNTE_TOKEN;
    if (!token) return { status: "gagal", error: "FONNTE_TOKEN belum diset" };

    const res = await axios.post("https://api.fonnte.com/send", {
      target: nomor,
      message: pesan,
      countryCode: "62",
    }, {
      headers: { Authorization: token },
      timeout: 10000,
    });

    if (res.data?.status) {
      return { status: "dikirim" };
    }
    return { status: "gagal", error: res.data?.reason || "Unknown" };
  } catch (err) {
    return { status: "gagal", error: err.message };
  }
}

// Susun pesan WA hasil absen (dipakai buat auto & manual kirim)
function buatPesanAbsen(siswa, absen) {
  const waktuHHMM = jamStrWIB(absen.waktu_absen);
  return `Assalamualaikum Wr. Wb.\n\nYth. Bpk/Ibu Wali dari ${siswa.nama}\n\n${siswa.nama} telah absen masuk pada:\nJam: ${waktuHHMM} WIB\nStatus: ${absen.status}\nTanggal: ${tanggalStrWIB(absen.tanggal)}\n\n-- SDN 2 Garumukti`;
}

// Catat log pengiriman ke notifikasi_log (absorbed dari route scan)
async function catatLog(absensi_id, nomor_tujuan, pesan, result) {
  try {
    await prisma.notifikasi_log.create({
      data: {
        absensi_id,
        nomor_tujuan,
        pesan: pesan || `Absen: ${result?.nama || "Siswa"}`,
        status: result?.status || "dikirim",
      },
    });
  } catch (e) {
    console.error("Gagal catat notifikasi_log:", e.message);
  }
}

// App settings
function waOtomatis() {
  return process.env.WA_KIRIM_OTOMATIS !== "false";
}

// GET /api/notifikasi/log
router.get("/log", adminAuth, async (req, res) => {
  try {
    const logs = await prisma.notifikasi_log.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
    });
    res.json(dapodikResponse(logs, { idField: "notifikasi_id" }));
  } catch (err) {
    res.status(500).json(errorResponse("Gagal ambil log", "INTERNAL_ERROR", 500));
  }
});

// GET /api/notifikasi/setting — baca setting (nanti bisa lewat satu endpoint)
router.get("/setting", adminAuth, async (req, res) => {
  res.json(dapodikResponse({
    wa_otomatis: waOtomatis(),
  }, { idField: "wa_otomatis", limit: 1 }));
});

// POST /api/notifikasi/test — kirim WA test
router.post("/test", adminAuth, async (req, res) => {
  try {
    const { nomor, pesan } = req.body;
    if (!nomor) return res.status(400).json(errorResponse("Nomor wajib diisi", "VALIDATION_ERROR"));

    const hasil = await kirimWA(nomor, pesan || "Test notifikasi dari Sistem Absensi QR");
    res.json({ success: true, data: hasil });
  } catch (err) {
    res.status(500).json(errorResponse("Gagal kirim WA", "INTERNAL_ERROR", 500));
  }
});

// POST /api/notifikasi/kirim/:absensi_id — kirim WA hasil absen secara manual
// (untuk kejadian yang tidak dikirim otomatis, atau kirim ulang)
router.post("/kirim/:absensi_id", guruAuth, async (req, res) => {
  try {
    const { absensi_id } = req.params;
    if (!absensi_id) {
      return res.status(400).json(errorResponse("absensi_id wajib diisi", "VALIDATION_ERROR"));
    }

    const absen = await prisma.absensi.findUnique({
      where: { absensi_id },
      include: { siswa: true },
    });

    if (!absen) {
      return res.status(404).json(errorResponse("Absensi tidak ditemukan", "NOT_FOUND", 404));
    }

    const nomor = absen.siswa?.nomor_telepon_seluler;
    if (!nomor) {
      return res.status(400).json(errorResponse("Nomor telepon wali siswa tidak tersedia", "NO_PHONE", 400));
    }

    const pesan = buatPesanAbsen(absen.siswa, absen);
    const hasil = await kirimWA(nomor, pesan);
    await catatLog(absen.absensi_id, nomor, `Absen: ${absen.siswa.nama} - ${absen.status}`, hasil);

    res.json({ success: true, data: hasil });
  } catch (err) {
    console.error("Kirim WA manual error:", err);
    res.status(500).json(errorResponse("Gagal kirim WA", "INTERNAL_ERROR", 500));
  }
});

module.exports = { router, kirimWA, buatPesanAbsen, catatLog, waOtomatis };