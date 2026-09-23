const router = require("express").Router();
const prisma = require("../config/prisma");
const { authMiddleware } = require("../middleware/auth");
const { errorResponse } = require("../utils/response");
const QRCode = require("qrcode");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

const adminAuth = authMiddleware(["Admin"]);

// Helper: generate PDF kartu untuk 1 siswa
async function buatKartu(siswa, sekolah) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 378]); // ~85.6x54mm di 72 DPI (kartu CR-80 landscape)
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 20;
  const qrSize = 100;

  // Border
  page.drawRectangle({
    x: 5, y: 5, width: width - 10, height: height - 10,
    borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 2,
  });

  // Header: nama sekolah
  page.drawText(sekolah?.nama || "", {
    x: margin, y: height - margin - 5,
    size: 12, font: fontBold,
    color: rgb(0.1, 0.1, 0.6),
  });

  // Garis pemisah
  page.drawLine({
    start: { x: margin, y: height - margin - 18 },
    end: { x: width - margin, y: height - margin - 18 },
    color: rgb(0.2, 0.2, 0.2),
  });

  // Nama siswa
  page.drawText(siswa.nama, {
    x: margin, y: height - margin - 40,
    size: 18, font: fontBold,
    color: rgb(0, 0, 0),
  });

  // NISN
  page.drawText(`NISN: ${siswa.nisn}`, {
    x: margin, y: height - margin - 65,
    size: 11, font: font,
  });

  // Kelas
  page.drawText(`Kelas: ${siswa.nama_rombel || "-"}`, {
    x: margin, y: height - margin - 85,
    size: 11, font: font,
  });

  // QR Code
  const qrBuffer = await QRCode.toBuffer(siswa.peserta_didik_id, {
    width: qrSize, margin: 1,
    errorCorrectionLevel: "M",
  });
  const qrImage = await doc.embedPng(qrBuffer);
  page.drawImage(qrImage, {
    x: width - margin - qrSize,
    y: margin + 15,
    width: qrSize,
    height: qrSize,
  });

  // Footer: tahun ajaran
  const tahun = new Date().getFullYear();
  page.drawText(`Tahun Ajaran ${tahun}/${tahun + 1}`, {
    x: margin, y: margin + 5,
    size: 8, font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Label QR
  page.drawText("SCAN ME", {
    x: width - margin - qrSize + 15,
    y: margin + 5,
    size: 7, font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return doc;
}

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