require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-jangan-pakai-ini") {
  console.warn("JWT_SECRET masih default. Set environment variable JWT_SECRET di Vercel.");
}

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ── Routes ──
app.get("/", (req, res) => {
  res.json({
    nama: "Backend Absensi QR",
    versi: "1.0.0",
    status: "nyala",
  });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/siswa", require("./routes/kartu")); // :id/kartu-qr, kartu-qr/bulk
app.use("/api/siswa", require("./routes/siswa")); // /:id
app.use("/api/absensi", require("./routes/absensi"));
app.use("/api/kelas", require("./routes/kelas"));
app.use("/api/sync/dapodik", require("./routes/sync"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/notifikasi", require("./routes/notifikasi").router);

// ── 404 ──
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint tidak ditemukan",
    error_code: "NOT_FOUND",
  });
});

// ── Error Handler ──
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(500).json({
    success: false,
    message: "Terjadi kesalahan pada server",
    error_code: "INTERNAL_ERROR",
  });
});

// Untuk Railway: listen langsung
// Untuk Vercel: export app
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ Backend nyala di http://localhost:${PORT}`);
  });
}

module.exports = app;