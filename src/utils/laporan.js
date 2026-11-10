// ── Laporan semester buat Kepala Sekolah ──
// Rekap per kelas: satu baris per siswa, kolom Sakit/Izin/Alpha semester itu.
// Sengaja TIDAK mencetak semua catatan absensi -- hasilnya jadi acuan ringkas
// buat kepala sekolah lihat siswa mana yang bermasalah.
//
// Semester pakai format Indonesia:
//   ganjil = 1 Juli s/d 31 Desember (tahun ajaran <tahun>/<tahun+1>)
//   genap  = 1 Januari s/d 30 Juni  (tahun ajaran <tahun-1>/<tahun>)

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const XLSX = require("xlsx");

const KET_TERHITUNG = ["Izin", "Sakit", "Alpha"];

// Semester yang sedang berjalan menurut tanggal WIB hari ini.
function semesterBerjalan() {
  const now = new Date();
  // geser ke WIB (UTC+7) cukup buat baca bulan.
  const bulanWIB = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCMonth(); // 0=Jan
  // Jul(6)..Des(11) = ganjil; Jan..Jun = genap (tahun ajaran mulai tahun lalu).
  if (bulanWIB >= 6) return { semester: "ganjil", tahun: now.getUTCFullYear() };
  return { semester: "genap", tahun: now.getUTCFullYear() - 1 };
}

// Validasi & hitung rentang tanggal semester. Return null kalau invalid.
// `tanggal` disimpan sebagai tengah malam UTC dari tanggal kalender WIB,
// jadi 1 Juli 2026 = new Date(Date.UTC(2026, 6, 1)) persis.
function rentangSemester({ semester, tahun }) {
  const berjalan = semesterBerjalan();
  semester = (semester || berjalan.semester).toLowerCase();
  tahun = parseInt(tahun, 10) || berjalan.tahun;

  if (semester !== "ganjil" && semester !== "genap") return null;
  if (!(tahun >= 2000 && tahun <= 2100)) return null;

  let mulai, selesai, tahunAjaran;
  if (semester === "ganjil") {
    mulai = new Date(Date.UTC(tahun, 6, 1)); // 1 Juli
    selesai = new Date(Date.UTC(tahun, 11, 31)); // 31 Desember (inklusif)
    tahunAjaran = `${tahun}/${tahun + 1}`;
  } else {
    mulai = new Date(Date.UTC(tahun + 1, 0, 1)); // 1 Januari tahun berikutnya
    selesai = new Date(Date.UTC(tahun + 1, 5, 30)); // 30 Juni (inklusif)
    tahunAjaran = `${tahun}/${tahun + 1}`;
  }

  // Batas atas query: selesai + 1 hari (karena query pakai lt).
  const akhir = new Date(selesai.getTime() + 24 * 60 * 60 * 1000);

  const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const labelRentang = `${mulai.getUTCDate()} ${BULAN[mulai.getUTCMonth()]} ${mulai.getUTCFullYear()} s.d. ${selesai.getUTCDate()} ${BULAN[selesai.getUTCMonth()]} ${selesai.getUTCFullYear()}`;

  return { semester, tahun, tahunAjaran, mulai, selesai, akhir, labelRentang };
}

// Keterangan efektif dari satu baris absensi: bentuk baru ("Tidak Hadir" +
// keterangan) atau bentuk lama (status "Izin"/"Sakit" langsung).
function keteranganBaris(b) {
  if (b.keterangan && KET_TERHITUNG.includes(b.keterangan)) return b.keterangan;
  if (KET_TERHITUNG.includes(b.status)) return b.status;
  return null;
}

// Rekap per kelas: roster lengkap + hitungan Sakit/Izin/Alpha per siswa.
async function ambilRekap(prisma, sekolahId, rentang) {
  const [siswaList, rekap] = await Promise.all([
    prisma.siswa.findMany({
      where: { sekolah_id: sekolahId, is_active: true },
      select: { peserta_didik_id: true, nisn: true, nama: true, nama_rombel: true },
      orderBy: [{ nama_rombel: "asc" }, { nama: "asc" }],
    }),
    prisma.absensi.groupBy({
      by: ["peserta_didik_id", "keterangan", "status"],
      where: {
        sekolah_id: sekolahId,
        tanggal: { gte: rentang.mulai, lt: rentang.akhir },
        OR: [
          { status: "Tidak Hadir", keterangan: { in: KET_TERHITUNG } },
          { status: { in: ["Izin", "Sakit"] } }, // bentuk penulisan lama
        ],
      },
      _count: { _all: true },
    }),
  ]);

  // (peserta_didik_id -> {Izin, Sakit, Alpha})
  const hitung = new Map();
  for (const r of rekap) {
    const ket = keteranganBaris(r);
    if (!ket) continue;
    const per = hitung.get(r.peserta_didik_id) || { Izin: 0, Sakit: 0, Alpha: 0 };
    per[ket] += r._count._all;
    hitung.set(r.peserta_didik_id, per);
  }

  // Kelompokkan roster per kelas, sisipkan hitungannya.
  const petaKelas = new Map();
  for (const s of siswaList) {
    const kelas = s.nama_rombel || "Tanpa Kelas";
    if (!petaKelas.has(kelas)) petaKelas.set(kelas, []);
    const c = hitung.get(s.peserta_didik_id) || { Izin: 0, Sakit: 0, Alpha: 0 };
    petaKelas.get(kelas).push({
      nisn: s.nisn,
      nama: s.nama,
      sakit: c.Sakit,
      izin: c.Izin,
      alpha: c.Alpha,
      total: c.Sakit + c.Izin + c.Alpha,
    });
  }

  return [...petaKelas.entries()].map(([nama_rombel, siswa]) => ({
    nama_rombel,
    total_siswa: siswa.length,
    jumlah: {
      sakit: siswa.reduce((a, b) => a + b.sakit, 0),
      izin: siswa.reduce((a, b) => a + b.izin, 0),
      alpha: siswa.reduce((a, b) => a + b.alpha, 0),
    },
    siswa,
  }));
}

// ── Excel ──
// Sheet pertama "Ringkasan" (per kelas), lalu satu sheet per kelas.
function buatExcelLaporan({ sekolah, rentang, rekap, dicetakOleh }) {
  const wb = XLSX.utils.book_new();

  const judul = [
    [sekolah.nama],
    [`NPSN ${sekolah.npsn}`],
    [`LAPORAN SEMESTER ${rentang.semester.toUpperCase()} - TAHUN AJARAN ${rentang.tahunAjaran}`],
    [rentang.labelRentang],
    [`Dicetak oleh: ${dicetakOleh}`],
    [],
  ];

  // Ringkasan per kelas.
  const ringkasan = [
    ...judul,
    ["Kelas", "Jumlah Siswa", "Sakit", "Izin", "Alpha", "Total"],
    ...rekap.map((k) => [k.nama_rombel, k.total_siswa, k.jumlah.sakit, k.jumlah.izin, k.jumlah.alpha, k.jumlah.sakit + k.jumlah.izin + k.jumlah.alpha]),
    [
      "TOTAL",
      rekap.reduce((a, b) => a + b.total_siswa, 0),
      rekap.reduce((a, b) => a + b.jumlah.sakit, 0),
      rekap.reduce((a, b) => a + b.jumlah.izin, 0),
      rekap.reduce((a, b) => a + b.jumlah.alpha, 0),
      rekap.reduce((a, b) => a + b.jumlah.sakit + b.jumlah.izin + b.jumlah.alpha, 0),
    ],
  ];
  const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasan);
  wsRingkasan["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsRingkasan, "Ringkasan");

  // Satu sheet per kelas: baris = siswa, kolom = Sakit/Izin/Alpha.
  for (const k of rekap) {
    const rows = [
      ...judul,
      [`${k.nama_rombel} - ${k.total_siswa} siswa`],
      [],
      ["No", "NISN", "Nama", "Sakit", "Izin", "Alpha", "Total"],
      ...k.siswa.map((s, i) => [i + 1, s.nisn, s.nama, s.sakit, s.izin, s.alpha, s.total]),
      ["", "", "JUMLAH", k.jumlah.sakit, k.jumlah.izin, k.jumlah.alpha, k.jumlah.sakit + k.jumlah.izin + k.jumlah.alpha],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 4 }, { wch: 12 }, { wch: 30 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }];
    // Nama sheet maks 31 char & tanpa [ ] : * ? / \ -- "KELAS 1A" aman, tapi
    // jaga-jaga buat nama rombel lain.
    XLSX.utils.book_append_sheet(wb, ws, k.nama_rombel.slice(0, 31).replace(/[[\]:*?/\\]/g, "-"));
  }

  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
}

// ── PDF ──
// A4 portrait, satu tabel per kelas. Y menyusut tiap baris; pindah halaman
// kalau mepet bawah.
async function buatPdfLaporan({ sekolah, rentang, rekap, dicetakOleh }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28;
  const H = 841.89;
  const abu = rgb(0.92, 0.92, 0.92);
  const teksRedup = rgb(0.35, 0.35, 0.35);

  const cols = [
    { label: "No", w: 26, align: "left" },
    { label: "NISN", w: 62, align: "left" },
    { label: "Nama", w: 250, align: "left" },
    { label: "Sakit", w: 46, align: "right" },
    { label: "Izin", w: 46, align: "right" },
    { label: "Alpha", w: 46, align: "right" },
    { label: "Total", w: 49, align: "right" },
  ];
  const X0 = 35;
  const BARIS_TINGGI = 14;
  const BATAS_BAWAH = 55;

  let page;
  let y;

  // Nama yang kepanjangan dipotong biar ga nabrak kolom sebelah.
  function potongTeks(t, f, ukuran, lebar) {
    if (f.widthOfTextAtSize(t, ukuran) <= lebar) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + "...", ukuran) > lebar) t = t.slice(0, -1);
    return t + "...";
  }

  function tulisBaris(cells, { bold = false, latar = null, ukuran = 8.5 } = {}) {
    const f = bold ? fontBold : font;
    if (latar) {
      page.drawRectangle({ x: X0, y: y - BARIS_TINGGI, width: cols.reduce((a, b) => a + b.w, 0), height: BARIS_TINGGI, color: latar });
    }
    let x = X0;
    for (const col of cols) {
      const v = String(cells[col.label] ?? "");
      const w = col.w - 8;
      const teks = potongTeks(v, f, ukuran, w);
      const tx = col.align === "right" ? x + col.w - 4 - f.widthOfTextAtSize(teks, ukuran) : x + 4;
      page.drawText(teks, { x: tx, y: y - BARIS_TINGGI + 4, size: ukuran, font: f, color: rgb(0.1, 0.1, 0.1) });
      x += col.w;
    }
    // garis bawah baris
    page.drawLine({ start: { x: X0, y: y - BARIS_TINGGI }, end: { x: X0 + cols.reduce((a, b) => a + b.w, 0), y: y - BARIS_TINGGI }, thickness: 0.4, color: abu });
    y -= BARIS_TINGGI;
  }

  function headerHalaman(kompak) {
    if (kompak) {
      page.drawText(potongTeks(`${sekolah.nama} - Laporan Semester ${rentang.semester} TA ${rentang.tahunAjaran} (lanjutan)`, fontBold, 9, W - 2 * X0), {
        x: X0, y: H - 40, size: 9, font: fontBold, color: teksRedup,
      });
      y = H - 60;
      return;
    }

    const tengah = W / 2;
    const t1 = sekolah.nama;
    page.drawText(t1, { x: tengah - fontBold.widthOfTextAtSize(t1, 14) / 2, y: H - 55, size: 14, font: fontBold });
    const t2 = `NPSN ${sekolah.npsn}`;
    page.drawText(t2, { x: tengah - font.widthOfTextAtSize(t2, 9) / 2, y: H - 70, size: 9, font, color: teksRedup });

    const t3 = "LAPORAN SEMESTER " + rentang.semester.toUpperCase();
    page.drawText(t3, { x: tengah - fontBold.widthOfTextAtSize(t3, 12) / 2, y: H - 95, size: 12, font: fontBold });
    const t4 = `Tahun Ajaran ${rentang.tahunAjaran}`;
    page.drawText(t4, { x: tengah - fontBold.widthOfTextAtSize(t4, 10) / 2, y: H - 110, size: 10, font: fontBold });
    const t5 = rentang.labelRentang;
    page.drawText(t5, { x: tengah - font.widthOfTextAtSize(t5, 9) / 2, y: H - 124, size: 9, font, color: teksRedup });

    const kiri = `Dicetak oleh: ${dicetakOleh}`;
    page.drawText(kiri, { x: X0, y: H - 145, size: 8, font, color: teksRedup });
    const kanan = `Rekap Sakit / Izin / Alpha per siswa`;
    page.drawText(kanan, { x: W - X0 - font.widthOfTextAtSize(kanan, 8), y: H - 145, size: 8, font, color: teksRedup });

    y = H - 165;
  }

  function halamanBaru(kompak = false) {
    page = doc.addPage([W, H]);
    headerHalaman(kompak);
  }

  function headerTabel() {
    tulisBaris(Object.fromEntries(cols.map((c) => [c.label, c.label])), { bold: true, latar: abu });
  }

  halamanBaru(false);

  for (const k of rekap) {
    // Judul kelas. Kalau sisa ruang sempit, mulai halaman baru.
    if (y < BATAS_BAWAH + 3 * BARIS_TINGGI + 40) {
      halamanBaru(true);
    }

    // Bar judul kelas.
    const lebarTabel = cols.reduce((a, b) => a + b.w, 0);
    page.drawRectangle({ x: X0, y: y - 18, width: lebarTabel, height: 18, color: rgb(0.85, 0.87, 0.95) });
    page.drawText(potongTeks(`${k.nama_rombel}  (${k.total_siswa} siswa)`, fontBold, 9.5, lebarTabel - 16), {
      x: X0 + 8, y: y - 13, size: 9.5, font: fontBold,
    });
    y -= 18;

    headerTabel();

    k.siswa.forEach((s, i) => {
      if (y < BATAS_BAWAH) {
        halamanBaru(true);
        headerTabel();
      }
      tulisBaris({ No: i + 1, NISN: s.nisn, Nama: s.nama, Sakit: s.sakit, Izin: s.izin, Alpha: s.alpha, Total: s.total });
    });

    // Baris jumlah per kelas.
    if (y < BATAS_BAWAH) {
      halamanBaru(true);
      headerTabel();
    }
    tulisBaris(
      { No: "", NISN: "", Nama: "JUMLAH", Sakit: k.jumlah.sakit, Izin: k.jumlah.izin, Alpha: k.jumlah.alpha, Total: k.jumlah.sakit + k.jumlah.izin + k.jumlah.alpha },
      { bold: true, latar: abu }
    );
    y -= 14; // jarak antar kelas
  }

  // Nomor halaman di kaki tiap halaman.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Halaman ${i + 1} dari ${pages.length}`;
    p.drawText(label, { x: W - X0 - font.widthOfTextAtSize(label, 8), y: 30, size: 8, font, color: teksRedup });
  });

  return doc;
}

module.exports = { semesterBerjalan, rentangSemester, ambilRekap, buatExcelLaporan, buatPdfLaporan };
