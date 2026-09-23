const jwt = require("jsonwebtoken");
const { errorResponse } = require("../utils/response");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-jangan-pakai-ini";

function authMiddleware(roles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json(errorResponse("Token tidak ditemukan", "TOKEN_MISSING", 401));
    }

    try {
      const token = header.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;

      if (roles.length > 0 && !roles.includes(decoded.peran_id_str)) {
        return res.status(403).json(errorResponse("Anda tidak punya akses ke fitur ini", "FORBIDDEN_ACCESS", 403));
      }

      next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json(errorResponse("Sesi telah berakhir, silakan login ulang", "TOKEN_EXPIRED", 401));
      }
      return res.status(401).json(errorResponse("Token tidak valid", "TOKEN_INVALID", 401));
    }
  };
}

function generateToken(user) {
  return jwt.sign(
    {
      pengguna_id: user.pengguna_id,
      username: user.username,
      nama: user.nama,
      peran_id_str: user.peran_id_str,
      sekolah_id: user.sekolah_id,
      nama_rombel: user.nama_rombel || null,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "2h" }
  );
}

module.exports = { authMiddleware, generateToken, JWT_SECRET };