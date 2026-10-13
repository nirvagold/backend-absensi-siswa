const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { errorResponse } = require("../utils/response");
const { PDFDocument } = require("pdf-lib");
const { buatKartu } = require("../utils/kartu");

const adminAuth = authMiddleware(["Admin"]);

// GET /api/siswa/:id/kartu-qr
router.get("/:id/kartu-qr", adminAuth, async (req, res) => {
  try {
    const siswa = await prisma.siswa.findUnique({ where: { peserta_didik_id: req.params.id } });
    if (!siswa) {
      return res.status(404).json(errorResponse("Siswa tidak ditemukan", "STUDENT_NOT_FOUND", 404));
    }

    const sekolah = await prisma.sekolah.findUnique({ where: { sekolah_id: siswa.sekolah_id } });
    const doc = await buatKartu(siswa, sekolah);
    const pdfBytes = await doc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=kartu-${siswa.nisn}.pdf`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error("Kartu error:", err);
    res.status(500).json(errorResponse("Gagal generate kartu", "INTERNAL_ERROR", 500));
  }
});

// POST /api/siswa/kartu-qr/bulk
router.post("/kartu-qr/bulk", adminAuth, async (req, res) => {
  try {
    const { siswa_ids, kelas } = req.body;
    let siswaList = [];

    if (siswa_ids && siswa_ids.length > 0) {
      siswaList = await prisma.siswa.findMany({
        where: { peserta_didik_id: { in: siswa_ids }, is_active: true },
        orderBy: { nama: "asc" },
      });
    } else if (kelas) {
      siswaList = await prisma.siswa.findMany({
        where: { nama_rombel: kelas, is_active: true },
        orderBy: { nama: "asc" },
      });
    }

    if (siswaList.length === 0) {
      return res.status(400).json(errorResponse("Tidak ada siswa ditemukan", "VALIDATION_ERROR"));
    }

    const sekolah = await prisma.sekolah.findUnique({ where: { sekolah_id: siswaList[0].sekolah_id } });
    const doc = await PDFDocument.create();

    for (const siswa of siswaList) {
      const kartu = await buatKartu(siswa, sekolah);
      const pages = await doc.copyPages(kartu, kartu.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
    }

    const pdfBytes = await doc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=kartu-bulk-${kelas || siswaList.length}.pdf`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error("Kartu bulk error:", err);
    res.status(500).json(errorResponse("Gagal generate kartu", "INTERNAL_ERROR", 500));
  }
});

module.exports = router;