# Sistem Informasi Absensi Siswa Berbasis Web dengan Integrasi QR Code, Notifikasi WhatsApp, dan Dashboard Analitik

Sistem Informasi Absensi Siswa Berbasis Web dengan Integrasi QR Code, Notifikasi WhatsApp, dan Dashboard Analitik pada SDN 2 Garumukti

## API

Base URL: `https://backend-absensi-siswa-mu.vercel.app`

Dokumentasi lengkap: [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md)

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
| Admin | `admin@sekolah.sch.id` | `admin123` | Semua |
| Guru | `guru@sekolah.sch.id` | `guru123` | KELAS 3A |
| Wali Kelas 1 | `idahsr@gmail.com` | `dapodik123` | 1A, 1B |
| Wali Kelas 2 | `elisnina293@gmail.com` | `dapodik123` | 2A, 2B |
| Wali Kelas 3 | `satap2pamulihan@gmail.com` | `dapodik123` | 3A, 3B |
| Wali Kelas 4 | `rukmaredza@gmail.com` | `dapodik123` | 4A, 4B |
| Wali Kelas 5 | `ratihsetiasih45@gmail.com` | `dapodik123` | 5A, 5B |
| Wali Kelas 6 | `ayidadang1967@gmail.com` | `dapodik123` | 6A, 6B |
| Kepsek | `atepsuherman6747@gmail.com` | `dapodik123` | Read Only |

---

## Checklist Backend

### Udah Jadi

- Setup project + Prisma + PostgreSQL (Neon)
- Format response ala Dapodik (results, rows, snake_case)
- Login pake JWT, RBAC (Admin/Guru/Kepsek)
- CRUD data siswa -- 301 siswa dari Dapodik
- Sync Dapodik all (peserta didik + pengguna + rombongan belajar)
- Akun guru otomatis dari Dapodik (password: dapodik123)
- Guru wali multi kelas (1 guru bisa pegang >1 kelas)
- Generate kartu PDF + QR (single & bulk)
- Scan QR absen (peserta_didik_id) + cegah double absen
- Absen manual (izin/sakit/telat)
- Riwayat absensi (filter tanggal, kelas, status)
- Riwayat per siswa
- Dashboard ringkasan hari ini
- Dashboard tren 7 hari
- Dashboard per-kelas (12 kelas)
- Flagging siswa bermasalah (alfa >= 3)
- Export CSV
- CI workflow
- Seed data (admin+guru)
- Error codes lengkap
- Notifikasi log

### Skip dulu

- Kirim WA ke orang tua -- butuh setup akun WhatsApp Business
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
    absensi.js          scan qr, manual, riwayat
    sync.js             sync dari dapodik
    dashboard.js        ringkasan
    notifikasi.js       log wa (kirim belum)
  utils/response.js     helper format dapodik
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
     "token": "0B5EHd1bAQzakEI",
     "tipe": "all"
   }
   ```

   Tipe sync:
   - `all` (default) -- ambil siswa, buat akun guru, set wali kelas
   - `peserta_didik` -- data siswa doang
   - `pengguna` -- akun guru/kepsek doang
   - `rombongan_belajar` -- wali kelas doang

   ~2 menit, 302 siswa + 8 akun guru + 12 wali kelas masuk.
