# Sistem Informasi Absensi Siswa Berbasis Web dengan Integrasi QR Code, Notifikasi WhatsApp, dan Dashboard Analitik

Sistem Informasi Absensi Siswa Berbasis Web dengan Integrasi QR Code, Notifikasi WhatsApp, dan Dashboard Analitik pada SDN 2 Garumukti

## API

Base URL: `https://backend-absensi-siswa-mu.vercel.app`

Dokumentasi lengkap: [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md)

Catatan sinkronisasi buat tim frontend: [`CATATAN_FRONTEND.md`](CATATAN_FRONTEND.md)

### Quick Start

```bash
git clone https://github.com/nirvagold/backend-absensi-siswa.git
cd backend-absensi-siswa
cp .env.example .env.local
npm install
npx prisma db push --schema=src/prisma/schema.prisma
node src/prisma/seed.js
npm start
```

### Akun Test

| Role | Username | Password | Kelas |
| --- | --- | --- | --- |
| Admin | `admin@sekolah.sch.id` | `-` | Semua |
| Guru | `guru@sekolah.sch.id` | `-` | KELAS 3A |
| Kepala Sekolah | (setelah sync Dapodik) | `-` | Read Only |

---

## Checklist Backend

### Udah Jadi

- Setup project + Prisma + PostgreSQL (Neon)
- Format response ala Dapodik (results, rows, snake_case)
- Login pake JWT, RBAC (Admin/Guru/Kepala Sekolah)
- CRUD data siswa -- 301 siswa dari Dapodik
- Sync Dapodik all (peserta didik + pengguna + rombongan belajar)
- Akun guru otomatis dari Dapodik (password: dapodik123)
- Guru wali multi kelas (1 guru bisa pegang >1 kelas)
- Generate kartu PDF + QR (single & bulk)
- Scan QR absen (peserta_didik_id) + cegah double absen
- Jam absensi bertingkat: 06:00-07:00 Hadir, 07:00-08:00 Terlambat, 08:00 dst. ditolak (`ABSEN_JAM_MULAI` / `ABSEN_BATAS_MASUK` / `ABSEN_JAM_SELESAI`)
- Status scan otomatis: lewat batas jam masuk -> "Terlambat" (batas diatur via env)
- Absen manual (Hadir/Terlambat/Tidak Hadir, plus Izin/Sakit gaya lama) + keterangan Izin/Sakit/Alpha
- Alpha otomatis: siswa belum absen setelah jam alpha -> "Tidak Hadir" + keterangan "Alpha" (Vercel Cron / scheduler in-proses)
- Siswa telat datang: scan menimpa catatan alpha otomatis jadi "Terlambat"
- Edit absensi (ubah status/keterangan) -- mis. alpha diubah jadi izin
- Riwayat absensi (filter tanggal, kelas, status, keterangan, search nama/NISN)
- Riwayat per siswa
- Dashboard ringkasan hari ini (hadir/terlambat/izin/sakit/alpha + belum absen)
- Dashboard tren 7 hari
- Dashboard per-kelas (12 kelas)
- Flagging siswa bermasalah (alpha >= 3)
- Export CSV
- CI workflow
- Seed data (admin+guru)
- Error codes lengkap
- Notifikasi log
- Kirim WA ke ortu via Fonnte: otomatis setelah absen atau manual per absensi (mode bisa diganti admin dari UI, tersimpan di DB)
- Zona waktu konsisten WIB (server UTC-safe)

### Skip dulu

- Sesi absensi (buka/tutup sesi) -- fitur tambahan, P2
- Rekap absensi per tanggal -- kecil, tinggal nambah endpoint
- Multi-sekolah -- kalo mau dipake sekolah lain
- Rate limiting -- biar ga ditembak orang iseng

---

## Stack

```
Express.js  -- biar ada backendnya
Prisma      -- ORM, ga nulis SQL manual
PostgreSQL  -- database beneran (Neon free tier)
JWT         -- login
bcryptjs    -- hash password
qrcode      -- generate QR (belum kepake)
pdf-lib     -- buat PDF kartu (belum kepake)
axios       -- ngambil data dari Dapodik
Vercel      -- hosting gratisan
```

---

## Struktur Folder

```
src/
  index.js              entry point, routes
  config/prisma.js      koneksi database
  middleware/auth.js    JWT + RBAC
  routes/
    auth.js             login, profil
    siswa.js            daftar siswa, crud
    absensi.js          scan qr, manual, riwayat, edit
    sync.js             sync dari dapodik
    dashboard.js        ringkasan
    notifikasi.js       kirim wa (fonnte) + log + setting otomatis/manual
    cron.js             cron alpha otomatis (dipicu Vercel Cron)
  config/
    absensi.js          aturan jam: buka, batas Hadir/Terlambat, tutup, jam alpha
    pengaturan.js       setelan per sekolah di DB (mis. mode WA)
  scripts/
    alpha.js             tandai alpha otomatis (siswa belum absen)
  utils/
    response.js         helper format dapodik
    waktu.js            util zona waktu WIB (UTC-safe)
  prisma/
    schema.prisma       schema database
    seed.js             data awal (admin+guru)
```

---

## Cara Jalanin Dapodik Sync

1. Jalanin ngrok:
   ```bash
   ngrok http 5774
   ```
   Dapet url kaya `https://xxxx.ngrok-free.dev`

2. Hit endpoint:
   ```bash
   POST /api/sync/dapodik
   Body: {
     "ngrok_url": "https://xxxx.ngrok-free.dev",
     "token": "-",
     "tipe": "all"
   }
   ```

   Tipe sync:
   - `all` (default) -- ambil siswa, buat akun guru, set wali kelas
   - `peserta_didik` -- data siswa doang
   - `pengguna` -- akun guru/kepsek doang
   - `rombongan_belajar` -- wali kelas doang

   ~2 menit, 302 siswa + 8 akun guru + 12 wali kelas masuk.

---

## Environment Variables

Lihat `.env.example` untuk daftar lengkap. Yang penting untuk fitur absensi & WA:

| Variable | Fungsi | Default |
| --- | --- | --- |
| `FONNTE_TOKEN` | Token Fonnte buat kirim WA. Kalau kosong, WA tidak terkirim (balas `gagal`). | (kosong) |
| `WA_KIRIM_OTOMATIS` | Nilai **awal** WA otomatis. Admin bisa ganti kapan saja dari UI (`PUT /api/notifikasi/setting`) -- begitu diubah, yang dipakai nilai di DB. | `"true"` |
| `ABSEN_JAM_MULAI` | Jam buka absen WIB (`"HH:MM"`). Scan sebelum ini ditolak. | `"06:00"` |
| `ABSEN_BATAS_MASUK` | Batas Hadir vs Terlambat (`"HH:MM"`). Scan lewat jam ini -> "Terlambat". | `"07:00"` |
| `ABSEN_JAM_SELESAI` | Jam tutup absen (`"HH:MM"`). Scan setelah (dan tepat) jam ini ditolak -> masuk alpha. | `"08:00"` |
| `ABSEN_BATAS_ALPHA` | Jam jalan cron alpha otomatis (`"HH:MM"`). | `"08:00"` |
| `CRON_SECRET` | Secret buat endpoint `/api/cron/alpha`. **Wajib diset** di Vercel. | (kosong) |
| `JADWAL_JOBS` | `"false"` = matikan scheduler alpha in-proses (dipakai di Vercel, karena ada Vercel Cron). | (aktif) |

### Jam absen & status

Empat pengaturan jam yang beda fungsinya:

| Jam WIB | Hasil scan |
| --- | --- |
| sebelum `ABSEN_JAM_MULAI` (06:00) | **ditolak** `400 OUTSIDE_ABSEN_HOURS` |
| `ABSEN_JAM_MULAI` - `ABSEN_BATAS_MASUK` (06:00-07:00) | **"Hadir"** |
| `ABSEN_BATAS_MASUK` - `ABSEN_JAM_SELESAI` (07:00-08:00) | **"Terlambat"** |
| sejak `ABSEN_JAM_SELESAI` (08:00 dst.) | **ditolak** `400 OUTSIDE_ABSEN_HOURS` -> siswa ditandai alpha |

Batasnya inklusif di atas: tepat jam 07:00 sudah "Terlambat", tepat jam 08:00 sudah tutup.
`ABSEN_BATAS_ALPHA` (jam cron alpha) default-nya sama dengan `ABSEN_JAM_SELESAI`, jadi begitu
pintu absen tutup, siswa yang belum scan langsung ditandai alpha.

Siswa yang datang setelah ditandai alpha otomatis lalu scan sendiri: catatan alpha
(metode `sistem`) ditimpa jadi "Terlambat" + WA otomatis terkirim. Catatan hasil scan
atau input manual tetap tidak bisa ditimpa (balas `409 ALREADY_ABSENT`).

### Alpha otomatis

- **Vercel**: Vercel Cron di `vercel.json` (`0 1 * * *` UTC = **08:00 WIB**) memanggil `/api/cron/alpha`.
- **Railway/long-running**: scheduler in-proses di `src/index.js` jalan otomatis (cek tiap menit, eksekusi sekali sehari setelah jam `ABSEN_BATAS_ALPHA` WIB).
- Hasil: siswa yang belum absen -> baris `status: "Tidak Hadir"`, `keterangan: "Alpha"`, `metode: "sistem"`.
- Bisa diedit jadi Izin/Sakit lewat `PUT /api/absensi/:id`.
- Jalankan manual: `GET /api/cron/alpha?tanggal=YYYY-MM-DD` dengan header `Authorization: Bearer <CRON_SECRET>`.

### Zona waktu

Semua perhitungan hari & jam pakai **WIB (UTC+7)**, tidak bergantung timezone server
(Vercel jalan di UTC). Kolom `tanggal` menyimpan tengah malam UTC dari tanggal WIB.
Helpers ada di `src/utils/waktu.js`.
