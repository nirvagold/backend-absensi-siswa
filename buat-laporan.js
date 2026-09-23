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
function jb(s) { return new Paragraph({ spacing: { after: 20 }, indent: { left: 400 }, children: [new TextRun({ text: s, font: "Consolas", size: 17, color: "333333" })] }); }

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
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Sistem Informasi Absensi Siswa Berbasis Web", font: FONT, size: 32, color: "455a64" })] }),
      sp(50),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Integrasi QR Code, Notifikasi WhatsApp, dan Dashboard Analitik", font: FONT, size: 24, color: "455a64" })] }),
      sp(150),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SDN 2 Garumukti -- NPSN 20208854", font: FONT, size: 24, color: "1a237e" })] }),
      sp(300),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Backend Developer", font: FONT, size: 22, color: "78909c" })] }),
      sp(100),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "24 September 2026", font: FONT, size: 24, color: "78909c" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Versi 1.0", font: FONT, size: 22, color: "78909c" }) ] }),
      pg(),
    ]},
    // MAIN
    { children: [
      h(1, "1. Ringkasan"),
      p("Dokumen ini mencatat seluruh pekerjaan backend untuk Sistem Absensi QR. Mulai dari arsitektur, tech stack, endpoint API, database schema, hingga hal-hal yang ditemui selama pengembangan."),

      h(1, "2. Tech Stack"),
      tbl(["Komponen", "Teknologi", "Keterangan"], [
        ["Runtime", "Node.js 24", ""],
        ["Framework", "Express.js 4", ""],
        ["Database", "PostgreSQL (Neon free tier)", "0.5GB, Singapore region"],
        ["ORM", "Prisma 5.22", "Type-safe, auto-generated client"],
        ["Auth", "JWT + bcryptjs", "HS256, expires 2 jam"],
        ["QR Code", "qrcode (npm)", "Error correction level M"],
        ["PDF", "pdf-lib", "Generate kartu ukuran CR-80"],
        ["HTTP Client", "Axios", "Komunikasi ke Dapodik"],
        ["Hosting", "Vercel (serverless)", "Free tier, timeout 10s"],
        ["Tunnel", "ngrok", "Akses Dapodik dari localhost"],
        ["Git", "GitHub", "nirvagold/backend-absensi-siswa"],
      ]),
      sp(),

      h(1, "3. Arsitektur"),
      p("Dapodik (localhost:5774) --> ngrok Tunnel --> Backend (Vercel) --> Frontend (Vue.js)"),
      p("                                              |-> PostgreSQL (Neon)"),
      p("                                              |-> WhatsApp Business API (Meta)"),
      sp(40),
      h(2, "3.1 Catatan Arsitektur"),
      b("Dapodik cuma bisa diakses dari local sekolah. Makanya pake ngrok biar backend cloud bisa ambil data."),
      b("Vercel serverless punya timeout 10s. Sync 302 siswa butuh ~2 menit, jadi prosesnya sequential loop satu-satu."),
      b("Kartu PDF di-generate di memory (buffer), langsung di-return. Ga ada file yang disimpan."),
      b("QR Code isinya peserta_didik_id (UUID), bukan md5(NISN). Ini perubahan di tengah jalan."),
      sp(),

      h(1, "4. Database"),
      h(2, "4.1 Schema"),
      p("7 tabel: sekolah, users, siswa, absensi, sesi_absensi, sync_log, notifikasi_log"),
      p("Semua primary key UUID. Field names snake_case (ngikut Dapodik)."),
      sp(40),
      h(2, "4.2 Detail Tabel"),
      h(3, "users"),
      tbl(["Field", "Tipe", "Ket"], [["pengguna_id","UUID PK",""],["sekolah_id","UUID FK",""],["username","VARCHAR UNIQUE",""],["password_hash","VARCHAR","bcrypt"],["nama","VARCHAR",""],["peran_id_str","VARCHAR","Admin/Guru/Kepsek"],["nama_rombel","VARCHAR","Kelas yg dipegang (khusus Guru)"],["is_active","BOOLEAN","default true"]]),
      sp(30),
      h(3, "sekolah"),
      tbl(["Field","Tipe","Ket"],[["sekolah_id","UUID PK",""],["npsn","VARCHAR UNIQUE","20208854"],["nama","VARCHAR","SDN 2 Garumukti"],["alamat_jalan","TEXT","Kp. Cileuleuy"],["kecamatan","VARCHAR","Pamulihan"],["kabupaten_kota","VARCHAR","Garut"],["provinsi","VARCHAR","Jawa Barat"],["bentuk_pendidikan_id_str","VARCHAR","SD"],["status_sekolah_str","VARCHAR","Negeri"]]),
      sp(30),
      h(3, "siswa"),
      tbl(["Field","Tipe","Ket"],[["peserta_didik_id","UUID PK","Dari Dapodik"],["sekolah_id","UUID FK",""],["nisn","VARCHAR UNIQUE",""],["nipd","VARCHAR","nullable"],["nama","VARCHAR",""],["jenis_kelamin","CHAR(1)","L/P"],["nik","VARCHAR","nullable"],["nama_rombel","VARCHAR","KELAS 3A"],["tingkat_pendidikan_id","VARCHAR","1-6"],["nomor_telepon_seluler","VARCHAR","nullable"],["is_active","BOOLEAN","default true"],["sync_id","UUID","terakhir sync"]]),
      sp(30),
      h(3, "absensi"),
      tbl(["Field","Tipe","Ket"],[["absensi_id","UUID PK",""],["peserta_didik_id","UUID FK",""],["sekolah_id","UUID FK",""],["tanggal","DATE","UNIQUE(pd_id, tanggal)"],["waktu_absen","TIMESTAMP",""],["status","VARCHAR","Hadir/Terlambat/Izin/Sakit/Tdk Hadir"],["metode","VARCHAR","scan/manual"],["sesi_id","UUID FK","nullable"],["petugas_id","UUID FK","yg scan"]]),
      sp(),
      h(2, "4.3 Jumlah Data Saat Ini"),
      tbl(["Tabel", "Jumlah"], [["sekolah","1"],["users","2 (admin + guru)"],["siswa","301 (dari Dapodik)"],["absensi","~10 (hasil test)"],["sync_log","1"]],[]),
      sp(),

      h(1, "5. Endpoint API"),
      p("Base URL: https://backend-absensi-siswa-mu.vercel.app"),
      p("Format response: { results, id, start, limit, rows } (gaya Dapodik)"),

      h(2, "5.1 Auth"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["POST","/api/auth/login","No","Login -> dapet JWT"],["POST","/api/auth/logout","JWT","Logout"],["GET","/api/auth/me","JWT","Profil user"]]),
      h(2, "5.2 Siswa"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["GET","/api/siswa","JWT","List + search + filter"],["GET","/api/siswa/:id","JWT","Detail"],["POST","/api/siswa","Admin","Tambah"],["PUT","/api/siswa/:id","Admin","Update"],["DELETE","/api/siswa/:id","Admin","Soft delete"],["GET","/api/siswa/export","JWT","CSV"]]),
      h(2, "5.3 Kartu QR"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["GET","/api/siswa/:id/kartu-qr","Admin","PDF 1 kartu"],["POST","/api/siswa/kartu-qr/bulk","Admin","PDF banyak kartu"]]),
      h(2, "5.4 Absensi"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["POST","/api/absensi/scan","Guru/Admin","Scan QR"],["POST","/api/absensi/manual","Guru/Admin","Manual (izin/sakit)"],["GET","/api/absensi/hari-ini","JWT","Absen hari ini"],["GET","/api/absensi","JWT","Riwayat + filter"],["GET","/api/absensi/siswa/:id","JWT","Riwayat per siswa"]]),
      h(2, "5.5 Dashboard"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["GET","/api/dashboard/ringkasan","JWT","Ringkasan hari ini"],["GET","/api/dashboard/tren","JWT","7 hari terakhir"],["GET","/api/dashboard/siswa-bermasalah","JWT","Flagging alfa"]]),
      h(2, "5.6 Sync Dapodik"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["POST","/api/sync/dapodik","Admin","Mulai sync"],["GET","/api/sync/dapodik/status/:id","Admin","Polling status"],["GET","/api/sync/dapodik/history","Admin","Riwayat sync"]]),
      h(2, "5.7 Notifikasi"),
      tbl(["Method","Endpoint","Auth","Fungsi"],[["GET","/api/notifikasi/log","Admin","Log WA"]]),
      sp(),

      h(1, "6. Sync Dapodik -- Detail"),
      p("Proses yang terjadi saat admin klik tombol sinkronisasi:"),
      b("Backend nerima request POST /api/sync/dapodik dengan body { npsn, ngrok_url }"),
      b("Backend manggil GET {ngrok_url}/WebService/getPesertaDidik?npsn=20208854"),
      b("Dapodik balik JSON dengan format: { results: N, rows: [...] }"),
      b("Backend loop satu-satu 302 siswa, cek existing, kalo ada update, kalo ga ada insert"),
      b("Proses ~2 menit. Vercel timeout 10s, makanya lambat."),
      b("Frontend harus polling status via GET /api/sync/dapodik/status/{sync_id}"),
      sp(40),
      h(2, "6.1 Mapping Field"),
      tbl(["Field Dapodik", "Field DB", "Contoh"], [
        ["peserta_didik_id", "peserta_didik_id", "56d41d62-..."],
        ["nisn", "nisn", "3173959741"],
        ["nama", "nama", "ANNASYA AZRA IZZATUNNISA"],
        ["jenis_kelamin", "jenis_kelamin", "P"],
        ["nik", "nik", "3205345711170002"],
        ["tempat_lahir", "tempat_lahir", "Garut"],
        ["tanggal_lahir", "tanggal_lahir", "2017-11-17"],
        ["agama_id_str", "agama_id_str", "Islam"],
        ["alamat_jalan", "alamat_jalan", "Kp. Stamplat"],
        ["nama_ayah", "nama_ayah", "Jajang Solehadin"],
        ["nama_ibu", "nama_ibu", "Cucu Ningsih"],
        ["nama_rombel", "nama_rombel", "KELAS 3A"],
        ["tingkat_pendidikan_id", "tingkat_pendidikan_id", "3"],
        ["nomor_telepon_seluler", "nomor_telepon_seluler", "null"],
      ]),
      sp(),

      h(1, "7. QR Code"),
      p("Awalnya QR Code direncanakan berisi md5(NISN). Tapi di tengah jalan diganti jadi peserta_didik_id (UUID) langsung."),
      h(2, "7.1 Alasan Perubahan"),
      b("md5(NISN): perlu looping semua siswa > cari yg cocok. Lambat."),
      b("UUID: SELECT WHERE peserta_didik_id = kode -> 1 query langsung -> cepet."),
      b("UUID udah unique secara global, ga perlu di-hash lagi."),
      b("peserta_didik_id juga ga ngekspos data pribadi siswa."),
      h(2, "7.2 Spesifikasi QR (Final)"),
      tbl(["Parameter", "Nilai"], [
        ["Isi", "peserta_didik_id (UUID)"],
        ["Contoh", "56d41d62-5d64-4e99-b081-00820cd9ea3d"],
        ["Error correction", "Level M (15%)"],
        ["Ukuran di kartu", "25x25mm"],
        ["Library generate", "qrcode (npm)"],
        ["Library scan (frontend)", "html5-qrcode"],
      ]),
      sp(),

      h(1, "8. Generate Kartu PDF"),
      p("File PDF di-generate pake pdf-lib. Setiap kartu ukuran 612x378 points (setara 85.6x54mm CR-80 landscape)."),
      h(2, "8.1 Komposisi Kartu"),
      b("Border tipis di pinggir"), b("Header: nama sekolah"), b("Garis pemisah"), b("Nama siswa (18pt, bold)"), b("NISN"), b("Kelas"), b("QR Code (100x100px, pojok kanan bawah)"), b("Tahun ajaran di footer"),
      h(2, "8.2 Mode Generate"),
      b("Single: GET /api/siswa/{id}/kartu-qr -> return 1 halaman PDF"), b("Bulk: POST /api/siswa/kartu-qr/bulk -> bisa pake array ID atau filter kelas"),

      h(1, "9. Autentikasi & RBAC"),
      h(2, "9.1 JWT"),
      b("Algorithm: HS256"), b("Access token: 2 jam"), b("Payload: pengguna_id, username, peran_id_str, sekolah_id, nama_rombel"),
      b("Header: Authorization: Bearer {token}"),
      h(2, "9.2 RBAC Matrix"),
      tbl(["Fitur", "Admin", "Guru", "Kepsek"], [
        ["Data Siswa", "Full CRUD", "Read only (kelasnya)", "-"],
        ["Kartu QR", "Generate", "-", "-"],
        ["Sync Dapodik", "Full", "-", "-"],
        ["Absensi", "Scan & Manual", "Scan & Manual", "-"],
        ["Dashboard", "Full", "Kelasnya", "Read Only"],
        ["Export", "Ya", "-", "-"],
      ]),
      sp(),

      h(1, "10. Middleware Auth"),
      p("authMiddleware(roles) di src/middleware/auth.js:"),
      b("roles = [] -> semua user terautentikasi bisa akses"), b("roles = ['Admin'] -> cuma admin"), b("roles = ['Admin', 'Guru'] -> admin dan guru"),

      h(1, "11. Error Handling"),
      p("Semua error pake format:"),
      jb('{ "success": false, "message": "...", "error_code": "..." }'),
      sp(40),
      h(2, "11.1 Daftar Error Code"),
      tbl(["Code", "Status", "Penyebab"],[["INVALID_CREDENTIALS","401","Username/password salah"],["TOKEN_EXPIRED","401","Token expired"],["TOKEN_MISSING","401","Header Authorization ga ada"],["FORBIDDEN_ACCESS","403","Role ga berhak"],["STUDENT_NOT_FOUND","404","Siswa ga ketemu"],["ALREADY_ABSENT","409","Udah absen hari ini"],["INVALID_QR_CODE","400","QR ga valid"],["DAPODIK_CONNECTION_ERROR","502","Gagal konek Dapodik"],["VALIDATION_ERROR","400","Field wajib kosong"],["SISWA_ALREADY_EXISTS","409","NISN duplikat"],["RATE_LIMIT_EXCEEDED","429","Kebanyakan request"]]),

      h(1, "12. Environment Variables"),
      tbl(["Variable", "Keterangan"],[["DATABASE_URL","Koneksi ke Neon PostgreSQL"],["JWT_SECRET","Secret key JWT"],["PORT","Port (3000)"],["DAPODIK_NGROK_URL","URL ngrok tunnel"],["DAPODIK_TOKEN","Token autentikasi Dapodik"],["DAPODIK_NPSN","NPSN sekolah (20208854)"],["WA_PHONE_NUMBER_ID","ID nomor WA (belum)"],["WA_ACCESS_TOKEN","Token WA (belum)"]]),

      h(1, "13. Yang Udah Dicapai"),
      tbl(["No","Fitur","Status","Endpoint / Keterangan"],[["1","Login","OK","POST /api/auth/login"],["2","Daftar siswa","OK","GET /api/siswa + search + filter"],["3","Detail siswa","OK","GET /api/siswa/:id"],["4","Tambah siswa","OK","POST /api/siswa"],["5","Update siswa","OK","PUT /api/siswa/:id"],["6","Hapus siswa","OK","DELETE /api/siswa/:id (soft)"],["7","Export CSV","OK","GET /api/siswa/export"],["8","Sync Dapodik","OK","POST /api/sync/dapodik"],["9","Generate kartu PDF","OK","GET /api/siswa/:id/kartu-qr"],["10","Kartu bulk","OK","POST /api/siswa/kartu-qr/bulk"],["11","Scan QR absen","OK","POST /api/absensi/scan"],["12","Absen manual","OK","POST /api/absensi/manual"],["13","Riwayat absensi","OK","GET /api/absensi + filter"],["14","Absen hari ini","OK","GET /api/absensi/hari-ini"],["15","Riwayat per siswa","OK","GET /api/absensi/siswa/:id"],["16","Dashboard ringkasan","OK","GET /api/dashboard/ringkasan"],["17","Tren 7 hari","OK","GET /api/dashboard/tren"],["18","Flagging siswa","OK","GET /api/dashboard/siswa-bermasalah"],["19","Guru filter kelas","OK","Guru cuma liat kelasnya"],["20","Logout","OK","POST /api/auth/logout"],["21","Notifikasi log","OK","GET /api/notifikasi/log"]]),
      sp(),

      h(1, "14. Yang Belum"),
      tbl(["No","Fitur","Status","Prioritas"],[["1","Kirim WA ke ortu","Belum","P1 -- butuh setup Meta API"],["2","Sesi absensi","Belum","P2 -- buka/tutup sesi"],["3","Rekap per tanggal","Belum","P2 -- GET /api/absensi/rekap/:tgl"],["4","Multi-sekolah","Belum","P3 -- butuh refactor"]]),

      h(1, "15. Kendala & Solusi"),
      tbl(["Masalah","Solusi"],[["Vercel timeout 10s","Sync diproses sequential --> butuh ~2 menit. Frontend polling status."],["bcrypt native gagal di Vercel","Ganti ke bcryptjs (pure JS, works everywhere)"],["NGROK butuh autentikasi","Bikin akun ngrok, set authtoken"],["prisma validate error di CI","Hapus step validate, generate aja cukup"],["Guru bisa liat semua siswa","Tambah field nama_rombel di users, filter endpoint"],["Dapodik cuma localhost","Pake ngrok tunnel -> URL public"],["QR pake md5(NISN) lambat","Ganti ke peserta_didik_id langsung -> 1 query"]],[]),

      h(1, "16. Cara Jalanin Ulang"),
      p("Kalo komputer mati / mau set dari awal:"),
      b("1. Clone repo: git clone https://github.com/nirvagold/backend-absensi-siswa.git"),
      b("2. Install: npm install"),
      b("3. Generate prisma: npx prisma generate --schema=src/prisma/schema.prisma"),
      b("4. Push schema ke DB: npx prisma db push --schema=src/prisma/schema.prisma"),
      b("5. Seed: node src/prisma/seed.js"),
      b("6. Jalanin: npm start"),
      b("7. Jalanin ngrok: ngrok http 5774"),
      b("8. Set DAPODIK_NGROK_URL di Vercel dengan URL ngrok"),
      b("9. Sync Dapodik: POST /api/sync/dapodik"),

      sp(200),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: "-- Dokumentasi Backend --", font: FONT, size: 24, bold: true, color: "9e9e9e" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Versi 1.0", font: FONT, size: 20, color: "9e9e9e" })] }),
    ]},
  ],
});

Packer.toBuffer(doc).then(buf => {
  const out = "D:\\Capstone2\\backend\\Dokumentasi_Backend.docx";
  fs.writeFileSync(out, buf);
  console.log("OK:", out, (buf.length / 1024).toFixed(1), "KB");
});