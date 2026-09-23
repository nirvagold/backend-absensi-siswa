require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Routes ──
app.get("/", (req, res) => {
  res.json({
    nama: "Backend Absensi QR",
    versi: "1.0.0",
    status: "nyala",
  });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/siswa", require("./routes/siswa"));
app.use("/api/absensi", require("./routes/absensi"));
app.use("/api/sync/dapodik", require("./routes/sync"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/notifikasi", require("./routes/notifikasi"));

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