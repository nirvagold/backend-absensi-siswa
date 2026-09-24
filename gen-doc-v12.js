const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, PageBreak, WidthType, ShadingType, BorderStyle } = require("docx");

const FONT = "Calibri";

function h(l, t) {
  const ls = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
  const sz = l === 1 ? 32 : l === 2 ? 28 : l === 3 ? 24 : 22;
  return new Paragraph({ heading: ls[l], spacing: { before: l === 1 ? 400 : 280, after: 120 }, children: [new TextRun({ text: t, font: FONT, bold: true, size: sz, color: l === 1 ? "1a237e" : "283593" })] });
}
function p(t) { return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t, font: FONT, size: 22 })] }); }
function b(t, lv) { return new Paragraph({ bullet: { level: lv || 0 }, spacing: { after: 40 }, children: [new TextRun({ text: t, font: FONT, size: 22 })] }); }
function sp(h2) { return new Paragraph({ spacing: { after: h2 || 120 }, children: [] }); }
function pg() { return new Paragraph({ children: [new PageBreak()] }); }
function tbl(hd, rows) {
  const bdr = { style: BorderStyle.SINGLE, size: 1, color: "999999" }, w = 100 / hd.length;
  return new Table({
    rows: [
      new TableRow({ tableHeader: true, children: hd.map((h2, i) => new TableCell({ width: { size: w, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: "e8eaf6" }, borders: { top: bdr, bottom: bdr, left: bdr, right: bdr }, children: [new Paragraph({ spacing: { before: 40, after: 40 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: h2, font: FONT, size: 20, bold: true, color: "1a237e" })] })] })) }),
      ...rows.map((row, ri) => new TableRow({ children: row.map(c => new TableCell({ width: { size: w, type: WidthType.PERCENTAGE }, shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: "f5f5f5" } : undefined, borders: { top: bdr, bottom: bdr, left: bdr, right: bdr }, children: [new Paragraph({ spacing: { before: 30, after: 30 }, children: [new TextRun({ text: String(c), font: FONT, size: 20 })] })] })) })),
    ],
  });
}

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  sections: [
    // COVER
    { children: [
      sp(600),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DOKUMENTASI BACKEND", font: FONT, size: 48, bold: true, color: "1a237e" })] }),
      sp(100),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Sistem Absensi Siswa Berbasis QR", font: FONT, size: 32, color: "455a64" })] }),
      sp(150),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SDN 2 Garumukti -- NPSN 20208854", font: FONT, size: 24, color: "1a237e" })] }),
      sp(300),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Versi 1.2 -- 24 September 2026", font: FONT, size: 24, color: "78909c" })] }),
      sp(50),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Backend Developer", font: FONT, size: 22, color: "78909c" })] }),
      pg(),
    ]},
    // MAIN
    { children: [
      h(1, "1. Ringkasan"),
      p("Dokumen ini mencatat seluruh pekerjaan backend untuk Sistem Absensi QR versi 1.2."),

      h(1, "2. Tech Stack"),
      tbl(["Komponen", "Teknologi", "Keterangan"],[["Runtime","Node.js 24",""],["Framework","Express.js 4",""],["Database","PostgreSQL (Neon free tier)","0.5GB, Singapore"],["ORM","Prisma 5.22",""],["Auth","JWT + bcryptjs","HS256, 2 jam"],["QR Code","qrcode (npm)","Error level M"],["PDF","pdf-lib","Kartu CR-80"],["Hosting","Vercel (serverless)","Free tier"],["Tunnel","ngrok","Akses Dapodik"],["Git","GitHub","nirvagold/backend-absensi-siswa"],["Security","helmet + rate limit","Security headers"]]),
      sp(),

      h(1, "3. Arsitektur"),
      p("Dapodik (localhost:5774) --> ngrok Tunnel --> Backend (Vercel) --> Frontend (Vue.js)"),
      p("--> PostgreSQL (Neon)"),
      p("--> WhatsApp Business API (Meta)"),
      sp(),

      h(1, "4. Database"),
      h(2, "4.1 Data Minimal"),
      p("Siswa hanya menyimpan data yang diperlukan untuk absensi. Data pribadi (NIK, agama, tanggal lahir, alamat, nama ortu) TIDAK disimpan."),
      tbl(["Field", "Tipe", "Ket"],[["peserta_didik_id","UUID PK",""],["nisn","VARCHAR UNIQUE",""],["nipd","VARCHAR","nullable"],["nama","VARCHAR",""],["jenis_kelamin","CHAR(1)","L/P"],["nama_rombel","VARCHAR","KELAS 3A"],["tingkat_pendidikan_id","VARCHAR","1-6"],["nomor_telepon_seluler","VARCHAR","nullable"]]),
      sp(),

      h(1, "5. Endpoint API"),
      p("Base URL: https://backend-absensi-siswa-mu.vercel.app"),
      p("Format response: { results, id, start, limit, rows } (gaya Dapodik)"),
      h(2, "5.1 Auth"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["POST","/api/auth/login","No","Login -> JWT"],["POST","/api/auth/logout","JWT","Logout"],["GET","/api/auth/me","JWT","Profil"]]),
      h(2, "5.2 Siswa"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["GET","/api/siswa","JWT","List + search"],["GET","/api/siswa/:id","JWT","Detail"],["POST","/api/siswa","Admin","Tambah"],["PUT","/api/siswa/:id","Admin","Update"],["DELETE","/api/siswa/:id","Admin","Soft delete"],["GET","/api/siswa/export","JWT","CSV"]]),
      h(2, "5.3 Kartu QR"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["GET","/api/siswa/:id/kartu-qr","Admin","PDF 1 kartu"],["POST","/api/siswa/kartu-qr/bulk","Admin","PDF bulk"]]),
      h(2, "5.4 Absensi"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["POST","/api/absensi/scan","Guru/Admin","Scan QR"],["POST","/api/absensi/manual","Guru/Admin","Manual"],["GET","/api/absensi/hari-ini","JWT","Hari ini"],["GET","/api/absensi","JWT","Riwayat"],["GET","/api/absensi/siswa/:id","JWT","Per siswa"]]),
      h(2, "5.5 Dashboard"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["GET","/api/dashboard/ringkasan","JWT","Ringkasan"],["GET","/api/dashboard/tren","JWT","7 hari"],["GET","/api/dashboard/per-kelas","JWT","Rekap kelas"],["GET","/api/dashboard/siswa-bermasalah","JWT","Flagging"]]),
      h(2, "5.6 Sync Dapodik"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["POST","/api/sync/dapodik","Admin","(all/peserta_didik/pengguna/rombongan_belajar"],["GET","/api/sync/dapodik/status/:id","Admin","Status"],["GET","/api/sync/dapodik/history","Admin","Riwayat"]]),
      h(2, "5.7 Notifikasi"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["GET","/api/notifikasi/log","Admin","Log WA"]]),
      sp(),

      h(1, "6. QR Code"),
      p("QR Code berisi peserta_didik_id (UUID). Bukan data pribadi. Contoh: 56d41d62-5d64-4e99-b081-00820cd9ea3d"),
      tbl(["Parameter","Nilai"],[["Isi QR","peserta_didik_id (UUID)"],["Hash","Tidak perlu, UUID sudah unique"],["Error correction","Level M (15%)"],["Ukuran di kartu","25x25mm"],["Library scan","html5-qrcode"]]),
      sp(),

      h(1, "7. Generate Kartu PDF"),
      p("PDF ukuran 85.6x54mm (CR-80 landscape). 1 halaman = 1 kartu. Komposisi: nama sekolah, nama siswa (bold 14pt), NISN, kelas, QR Code, tahun ajaran."),
      sp(),

      h(1, "8. Autentikasi & RBAC"),
      b("JWT HS256, access 2 jam"),
      b("Header: Authorization: Bearer {token}"),
      b("Password default akun Dapodik: dapodik123"),
      tbl(["Fitur","Admin","Guru","Kepsek"],[["Data Siswa","Full CRUD","Read (kelasnya)","-"],["Kartu QR","Generate","-","-"],["Sync Dapodik","Full","-","-"],["Absensi","Full","Full","-"],["Dashboard","Full","Kelasnya","Read Only"],["Export","Ya","-","-"]]),
      sp(),

      h(1, "9. Sync Dapodik"),
      p("Tipe sync:"),
      b("all (default) -- ambil siswa + buat akun guru + set wali kelas"),
      b("peserta_didik -- data siswa doang"),
      b("pengguna -- buat akun guru/kepsek dari Dapodik (password: dapodik123)"),
      b("rombongan_belajar -- set wali kelas"),
      p("Token Dapodik bisa dikirim dari frontend via body request { token: 'xxx' }"),
      h(2, "9.1 Akun dari Dapodik"),
      tbl(["Nama","Email","Role","Kelas"],[["Idah Siti Rohayati","idahsr@gmail.com","Guru","1A, 1B"],["Elis Nina","elisnina293@gmail.com","Guru","2A, 2B"],["Sandi Budiman","satap2pamulihan@gmail.com","Guru","3A, 3B"],["Rukma Redza Ardian","rukmaredza@gmail.com","Guru","4A, 4B"],["Ratih Setiasih","ratihsetiasih45@gmail.com","Guru","5A, 5B"],["Ayi Dadang","ayidadang1967@gmail.com","Guru","6A, 6B"],["Atep Suherman","atepsuherman6747@gmail.com","Kepala Sekolah","-"]]),
      sp(),

      h(1, "10. Keamanan"),
      b("Data pribadi siswa (NIK, agama, lahir, ortu) TIDAK disimpan di database"),
      b("QR Code berisi UUID, bukan data pribadi"),
      b("helmet security headers terpasang"),
      b("Body size limit 1mb"),
      b("CORS terbatas (kalo frontend sudah deploy)"),
      sp(),

      h(1, "11. Yang Udah Dicapai (21 fitur)"),
      b("1. Login (JWT, RBAC)"), b("2. Daftar siswa (search, filter kelas)"), b("3. Detail siswa"), b("4. Tambah siswa"), b("5. Update siswa"), b("6. Hapus siswa (soft)"), b("7. Export CSV"), b("8. Kartu QR single PDF"), b("9. Kartu QR bulk"), b("10. Sync Dapodik all"), b("11. Akun guru otomatis dari Dapodik"), b("12. Wali kelas multi kelas"), b("13. Scan QR absen (peserta_didik_id)"), b("14. Absen manual"), b("15. Riwayat absensi"), b("16. Dashboard ringkasan"), b("17. Dashboard tren 7 hari"), b("18. Dashboard per-kelas"), b("19. Flagging siswa bermasalah"), b("20. Guru filter kelas"), b("21. Security hardening"),
      sp(),

      h(1, "12. Yang Belum"),
      b("Kirim WA ke ortu (butuh Meta API token)"),
      b("Sesi absensi (buka/tutup)"),
      b("Multi-sekolah"),
      sp(),

      h(1, "13. Akun Test"),
      tbl(["Role","Username","Password","Kelas"],[["Admin","admin@sekolah.sch.id","admin123","Semua"],["Guru","guru@sekolah.sch.id","guru123","KELAS 3A"]]),
      sp(),

      h(1, "14. Cara Jalanin Ulang"),
      b("1. git clone https://github.com/nirvagold/backend-absensi-siswa.git"),
      b("2. npm install"),
      b("3. Set DATABASE_URL di .env"),
      b("4. npx prisma db push --schema=src/prisma/schema.prisma"),
      b("5. node src/prisma/seed.js"),
      b("6. npm start"),
      b("7. ngrok http 5774"),
      b("8. POST /api/sync/dapodik dengan body { ngrok_url, token, tipe:'all' }"),
      sp(200),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: "-- Dokumentasi Backend v1.2 --", font: FONT, size: 24, bold: true, color: "9e9e9e" })] }),
    ]},
  ],
});

Packer.toBuffer(doc).then(buf => {
  const out = "D:\\Capstone2\\backend\\Dokumentasi_Backend_v1.2.docx";
  fs.writeFileSync(out, buf);
  console.log("OK:", out, (buf.length / 1024).toFixed(1), "KB");
});