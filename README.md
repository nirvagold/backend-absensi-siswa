# Backend Absensi Siswa

Backend absen pake QR. Data siswa dari Dapodik.

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

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin@sekolah.sch.id` | `admin123` |
| Guru | `guru@sekolah.sch.id` | `guru123` |

---

## Checklist Backend

### Udah Jadi

- Setup project + Prisma + PostgreSQL (Neon)
- Format response ala Dapodik (results, rows, snake_case)
- Login pake JWT, RBAC (Admin/Guru/Kepsek)
- CRUD data siswa -- 301 siswa dari Dapodik
- Sync Dapodik via ngrok
- Scan QR absen (md5 nisn) + cegah double absen
- Absen manual (izin/sakit/telat)
- Riwayat absensi (filter tanggal, kelas, status)
- Dashboard ringkasan hari ini
- Flagging siswa bermasalah (alfa >= 3)
- CI workflow (Prisma generate)
- Seed data (admin+guru)
- Error codes 18 macam + format error global
- Notifikasi log (tabel doang, kirim WA belum)
- Deploy ke Vercel

### Belum

- Generate kartu PDF + QR (masih di PRD doang)
- Kirim WA ke orang tua (Meta API)
- Refresh token + logout
- Rate limiting
- Sesi absensi (buka/tutup sesi)
- Dashboard tren mingguan + rekap per kelas
- Update & delete siswa
- Export CSV
- Filter dashboard -- guru cuma liat kelasnya
- Rekap absensi per tanggal

### Mungkin Gapernah Dibikin

- Reset password lewat email
- Multi-sekolah dalam 1 instance
- Self-scan siswa (kiosk mode)
- Backup otomatis

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

2. Set environment variable di Vercel:
   - `DAPODIK_NGROK_URL` = url ngrok
   - `DAPODIK_TOKEN` = `0B5EHd1bAQzakEI`
   - `DAPODIK_NPSN` = `20208854`

3. Hit endpoint:
   ```bash
   POST /api/sync/dapodik
   ```

   ~2 menit, 302 siswa masuk sendiri.