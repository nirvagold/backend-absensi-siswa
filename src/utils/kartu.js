"use strict";
// ── Kartu pelajar (PDF) ──
// Tema ilustrasi ceria, senada tampilan sekolah dasar: langit biru, matahari,
// bukit berlapis, pohon pinus, dan rumah beratap merah.
//
// Semua bentuk digambar lewat SVG path dengan titik acuan pojok kiri-atas
// halaman (koordinat layar: x ke kanan, y ke bawah), biar penataannya gampang.
// Hanya teks dan gambar yang pakai koordinat PDF biasa (y dari bawah).

const QRCode = require("qrcode");
const { PDFDocument, rgb, StandardFonts, LineCapStyle } = require("pdf-lib");

// Ukuran kartu yang sudah dipakai sejak awal (2 kartu per lembar Letter).
const W = 612;
const H = 378;

// ── Warna ──
function hx(hex) {
  const n = parseInt(hex, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const C = {
  sky: hx("A9DCF5"),
  sun: hx("FBC02D"),
  sunRay: hx("F9A825"),
  cloud: hx("FFFFFF"),
  hillFar: hx("AEDCAB"),
  hillFarLine: hx("8CC489"),
  hillNear: hx("7BC97F"),
  hillNearLine: hx("5CAD63"),
  ground: hx("F6E7C8"),
  groundLine: hx("DCC79C"),
  tree: hx("4E9A51"),
  treeLine: hx("35703A"),
  trunk: hx("9A6B4F"),
  house: hx("FFFFFF"),
  roof: hx("E4634B"),
  window: hx("FDD835"),
  door: hx("2E5C8A"),
  navy: hx("1B3A5C"),
  navySoft: hx("4A6B8A"),
  muted: hx("7A8FA6"),
  red: hx("C62828"),
  white: hx("FFFFFF"),
  divider: hx("D7E3EE"),
  stone: hx("C9D6E2"),
  stoneLine: hx("A8BACB"),
};

// ── Penggambar bentuk ──

function rrect(page, x, sy, w, h, r, opts = {}) {
  const rr = Math.min(r, w / 2, h / 2);
  const d = [
    `M ${rr},0`,
    `H ${w - rr}`,
    `A ${rr},${rr} 0 0 1 ${w},${rr}`,
    `V ${h - rr}`,
    `A ${rr},${rr} 0 0 1 ${w - rr},${h}`,
    `H ${rr}`,
    `A ${rr},${rr} 0 0 1 0,${h - rr}`,
    `V ${rr}`,
    `A ${rr},${rr} 0 0 1 ${rr},0`,
    "Z",
  ].join(" ");
  page.drawSvgPath(d, { x, y: H - sy, ...opts });
}

function poly(page, pts, opts = {}) {
  const d = "M " + pts.map(([x, y]) => `${x},${y}`).join(" L ") + " Z";
  page.drawSvgPath(d, { x: 0, y: H, ...opts });
}

// Bulatan penuh. Titik (cx, sy) = pusat.
function disc(page, cx, sy, r, opts = {}) {
  const d = `M ${cx - r},${sy} a ${r},${r} 0 1 0 ${2 * r},0 a ${r},${r} 0 1 0 ${-2 * r},0 Z`;
  page.drawSvgPath(d, { x: 0, y: H, ...opts });
}

// Bukit: setengah bulatan dengan garis punggungan saja di sisi atas.
function hill(page, cx, sy, r, fill, stroke, strokeWidth = 2) {
  const d = `M ${cx - r},${sy} A ${r},${r} 0 0 1 ${cx + r},${sy} Z`;
  page.drawSvgPath(d, { x: 0, y: H, color: fill, borderColor: stroke, borderWidth: strokeWidth });
}

function line(page, x1, sy1, x2, sy2, opts = {}) {
  page.drawSvgPath(`M ${x1},${sy1} L ${x2},${sy2}`, {
    x: 0, y: H, borderColor: C.navy, borderWidth: 2, borderLineCap: LineCapStyle.Round, ...opts,
  });
}

function teks(page, str, x, sy, opts = {}) {
  const { size = 11, font, color = C.navy, maxWidth, align = "left" } = opts;
  const s = String(str ?? "");
  if (!s) return;
  let sz = size;
  if (maxWidth) {
    while (sz > 6 && font.widthOfTextAtSize(s, sz) > maxWidth) sz -= 0.5;
  }
  const w = font.widthOfTextAtSize(s, sz);
  const px = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  page.drawText(s, { x: px, y: H - sy, size: sz, font, color });
}

// ── Ornamen ──

function matahari(page, cx, sy, r) {
  for (let i = 0; i < 12; i++) {
    const a = ((i * 30 + 15) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    line(page, cx + c * (r + 6), sy - s * (r + 6), cx + c * (r + 15), sy - s * (r + 15), {
      borderColor: C.sunRay, borderWidth: 5, borderLineCap: LineCapStyle.Round,
    });
  }
  disc(page, cx, sy, r, { color: C.sun, borderColor: C.sunRay, borderWidth: 2.5 });
}

function awan(page, cx, sy, s) {
  const r = 13 * s;
  disc(page, cx - r * 1.5, sy + r * 0.35, r * 0.85, { color: C.cloud });
  disc(page, cx, sy, r, { color: C.cloud });
  disc(page, cx + r * 1.5, sy + r * 0.4, r * 0.75, { color: C.cloud });
  rrect(page, cx - r * 2.1, sy + r * 0.25, r * 4.2, r * 0.85, r * 0.42, { color: C.cloud });
}

function pinus(page, cx, baseY, s) {
  const w = 23 * s;
  rrect(page, cx - 3 * s, baseY - 13 * s, 6 * s, 14 * s, 1.5 * s, {
    color: C.trunk, borderColor: C.treeLine, borderWidth: 1.5,
  });
  const tiers = [
    { y: baseY - 12 * s, h: 27 * s, w: w },
    { y: baseY - 30 * s, h: 25 * s, w: w * 0.82 },
    { y: baseY - 46 * s, h: 24 * s, w: w * 0.62 },
  ];
  for (const t of tiers) {
    poly(page, [
      [cx - t.w, t.y],
      [cx + t.w, t.y],
      [cx, t.y - t.h],
    ], { color: C.tree, borderColor: C.treeLine, borderWidth: 2 });
  }
}

// Rumpun rumput: tiga goresan pendek dari satu titik.
function rumput(page, x, baseY, s = 1) {
  for (const [dx, dy] of [[-2.5, -5], [0, -7], [2.5, -5]]) {
    line(page, x, baseY, x + dx * s, baseY + dy * s, { borderColor: C.treeLine, borderWidth: 1.5 });
  }
}

// Batu kerikil di tanah.
function batu(page, cx, sy, s = 1) {
  rrect(page, cx - 7 * s, sy - 4 * s, 14 * s, 8 * s, 4 * s, {
    color: C.stone, borderColor: C.stoneLine, borderWidth: 1.5,
  });
}

function rumah(page, cx, baseY, s) {
  const w = 58 * s;
  const h = 44 * s;
  const x = cx - w / 2;
  // cerobong di belakang atap
  rrect(page, x + w * 0.72, baseY - h - 32 * s, 9 * s, 20 * s, 1.5, {
    color: C.roof, borderColor: C.navy, borderWidth: 1.5,
  });
  rrect(page, x, baseY - h, w, h, 3, { color: C.house, borderColor: C.navy, borderWidth: 2 });
  poly(page, [
    [x - 9 * s, baseY - h + 2 * s],
    [cx, baseY - h - 30 * s],
    [x + w + 9 * s, baseY - h + 2 * s],
  ], { color: C.roof, borderColor: C.navy, borderWidth: 2 });
  rrect(page, cx - 8 * s, baseY - 26 * s, 16 * s, 26 * s, 2, {
    color: C.door, borderColor: C.navy, borderWidth: 1.5,
  });
  for (const wx of [x + 8 * s, x + w - 21 * s]) {
    rrect(page, wx, baseY - 38 * s, 13 * s, 13 * s, 2, {
      color: C.window, borderColor: C.navy, borderWidth: 1.5,
    });
  }
}

// ── Kartu ──

async function buatKartu(siswa, sekolah) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([W, H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // 1. Langit
  rrect(page, 0, 0, W, H, 18, { color: C.sky });

  // 2. Matahari + awan
  matahari(page, 562, 44, 23);
  awan(page, 472, 34, 0.62);
  awan(page, 452, 68, 0.45);

  // 3. Bukit berlapis
  const baseBukit = 352;
  for (const cx of [-40, 185, 400, 610]) {
    hill(page, cx, baseBukit, 96, C.hillFar, C.hillFarLine);
  }
  for (const cx of [10, 145, 285, 430, 590]) {
    hill(page, cx, baseBukit, 62, C.hillNear, C.hillNearLine);
  }

  // 4. Tanah
  rrect(page, 0, baseBukit, W, H - baseBukit, 0, { color: C.ground });
  line(page, 0, baseBukit, W, baseBukit, { borderColor: C.groundLine });

  // 5. Pohon, rumah, dan batu
  for (const cx of [88, 130, 350, 396]) pinus(page, cx, baseBukit, 1);
  pinus(page, 552, baseBukit, 0.85);
  pinus(page, 596, baseBukit, 1);
  rumah(page, 248, baseBukit, 1);

  for (const x of [30, 62, 118, 168, 205, 300, 330, 372, 424, 470, 516, 566]) {
    rumput(page, x, baseBukit + 8 + (x % 9), x % 3 === 0 ? 1 : 0.8);
  }
  for (const [bx, by, bs] of [[100, 372, 1], [196, 366, 0.75], [438, 374, 0.9], [560, 368, 0.7]]) {
    batu(page, bx, by, bs);
  }

  // 6. Papan nama sekolah
  rrect(page, 22, 20, 420, 48, 16, { color: C.white, borderColor: C.navy, borderWidth: 2.5 });
  teks(page, (sekolah?.nama || "").toUpperCase(), 40, 46, { size: 17, font: bold, maxWidth: 386 });
  const alamat = [sekolah?.kecamatan, sekolah?.kabupaten_kota].filter(Boolean).join(" · ");
  teks(page, alamat, 40, 60, { size: 9, font, color: C.navySoft, maxWidth: 386 });

  // 7. Panel data siswa
  const pX = 22, pY = 84, pW = 436, pH = 164;
  rrect(page, pX, pY, pW, pH, 18, { color: C.white, borderColor: C.navy, borderWidth: 2.5 });

  rrect(page, 40, 100, 142, 24, 12, { color: C.red });
  teks(page, "KARTU PELAJAR", 111, 116, { size: 10, font: bold, color: C.white, align: "center" });

  teks(page, siswa.nama, 40, 152, { size: 21, font: bold, maxWidth: 400 });

  line(page, 40, 170, 440, 170, { borderColor: C.divider });

  const kolom = [
    { x: 40, label: "NISN", nilai: siswa.nisn },
    { x: 190, label: "NIPD", nilai: siswa.nipd || "-" },
    { x: 320, label: "KELAS", nilai: siswa.nama_rombel || "-" },
  ];
  for (const k of kolom) {
    teks(page, k.label, k.x, 190, { size: 8, font, color: C.muted });
    teks(page, k.nilai, k.x, 210, { size: 13, font: bold, maxWidth: 130 });
  }

  const tahun = new Date().getFullYear();
  teks(page, `Tahun Ajaran ${tahun}/${tahun + 1} · Wajib dibawa saat absensi QR`, 40, 234, {
    size: 8, font, color: C.muted, maxWidth: 400,
  });

  // 8. Kotak QR
  const qX = 470, qY = 84, qW = 120, qH = 164;
  rrect(page, qX, qY, qW, qH, 18, { color: C.white, borderColor: C.navy, borderWidth: 2.5 });
  const qrSize = 100;
  const qrBuffer = await QRCode.toBuffer(siswa.peserta_didik_id, {
    width: qrSize, margin: 0, errorCorrectionLevel: "M",
  });
  const qrImage = await doc.embedPng(qrBuffer);
  page.drawImage(qrImage, {
    x: qX + (qW - qrSize) / 2,
    y: H - (qY + 12) - qrSize,
    width: qrSize,
    height: qrSize,
  });
  teks(page, "SCAN ME", qX + qW / 2, 224, { size: 11, font: bold, align: "center" });
  teks(page, "Kode QR absensi", qX + qW / 2, 238, { size: 8, font, color: C.muted, align: "center" });

  return doc;
}

module.exports = { buatKartu, W, H };
