const router = require("express").Router();
const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const { generateToken } = require("../middleware/auth");
const { authMiddleware } = require("../middleware/auth");
const { dapodikResponse, errorResponse, successResponse } = require("../utils/response");

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json(errorResponse("Username dan password wajib diisi", "VALIDATION_ERROR"));
    }

    const user = await prisma.users.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json(errorResponse("Username atau password salah", "INVALID_CREDENTIALS", 401));
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json(errorResponse("Username atau password salah", "INVALID_CREDENTIALS", 401));
    }

    if (!user.is_active) {
      return res.status(403).json(errorResponse("Akun telah dinonaktifkan", "FORBIDDEN_ACCESS", 403));
    }

    // Update last_login
    await prisma.users.update({
      where: { pengguna_id: user.pengguna_id },
      data: { last_login: new Date() },
    });

    const token = generateToken(user);
    const data = {
      pengguna_id: user.pengguna_id,
      username: user.username,
      nama: user.nama,
      peran_id_str: user.peran_id_str,
      sekolah_id: user.sekolah_id,
      token,
    };

    res.json(dapodikResponse(data, { idField: "pengguna_id", limit: 1 }));
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json(errorResponse("Terjadi kesalahan server", "INTERNAL_ERROR", 500));
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware(), async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { pengguna_id: req.user.pengguna_id },
      select: { pengguna_id: true, username: true, nama: true, peran_id_str: true, sekolah_id: true, nomor_telepon_seluler: true },
    });

    if (!user) {
      return res.status(404).json(errorResponse("User tidak ditemukan", "USER_NOT_FOUND", 404));
    }

    res.json(dapodikResponse(user, { idField: "pengguna_id", limit: 1 }));
  } catch (err) {
    res.status(500).json(errorResponse("Terjadi kesalahan server", "INTERNAL_ERROR", 500));
  }
});

module.exports = router;