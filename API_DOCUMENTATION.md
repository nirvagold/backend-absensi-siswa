# API Documentation

Base URL: `https://backend-absensi-siswa-mu.vercel.app`

Semua response pake format Dapodik: `{ results, id, start, limit, rows }`

Field names: snake_case, suffix `_str` buat display value.

---

## Daftar Isi

- [Auth](#1-auth)
- [Siswa](#2-siswa)
- [Kartu QR](#3-kartu-qr)
- [Absensi](#4-absensi)
- [Dashboard](#5-dashboard)
- [Sync Dapodik](#6-sync-dapodik)
- [Notifikasi](#7-notifikasi)
- [Error Codes](#8-error-codes)
- [Akun Test](#9-akun-test)
- [Axios Setup](#10-axios-setup)

---

## 1. Auth

### Login

```
POST /api/auth/login
```

```json
{
  "username": "admin@sekolah.sch.id",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "results": 1,
  "id": "pengguna_id",
  "rows": {
    "pengguna_id": "892042b2-...",
    "username": "admin@sekolah.sch.id",
    "nama": "Admin SDN 2 Garumukti",
    "peran_id_str": "Admin",
    "sekolah_id": "3c6b9c9d-...",
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Error (401):**
```json
{
  "success": false,
  "message": "Username atau password salah",
  "error_code": "INVALID_CREDENTIALS"
}
```

> Pake header ini di setiap request kecuali login:
> ```
> Authorization: Bearer {token}
> ```

### Profil

```
GET /api/auth/me
```

### Logout

```
POST /api/auth/logout
```

Hapus token di frontend.

---

## 2. Siswa

### Daftar Siswa

```
GET /api/siswa
```

| Parameter | Tipe | Default | Keterangan |
|-----------|------|---------|------------|
| `page` | int | 1 | Halaman |
| `limit` | int | 20 | Max 100 |
| `search` | string | - | Cari nama / NISN / NIPD |
| `kelas` | string | - | Filter kelas (KELAS 3A) |

**Response:**
```json
{
  "results": 301,
  "id": "peserta_didik_id",
  "rows": [
    {
      "peserta_didik_id": "56d41d62-5d64-4e99-b081-00820cd9ea3d",
      "nisn": "3173959741",
      "nama": "ANNASYA AZRA IZZATUNNISA",
      "jenis_kelamin": "P",
      "nik": "3205345711170002",
      "tempat_lahir": "Garut",
      "tanggal_lahir": "2017-11-17",
      "agama_id_str": "Islam",
      "alamat_jalan": "Kp. Stamplat",
      "nama_ayah": "Jajang Solehadin",
      "nama_ibu": "Cucu Ningsih",
      "nama_rombel": "KELAS 3A",
      "tingkat_pendidikan_id": "3",
      "nomor_telepon_seluler": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 301,
    "total_pages": 16
  }
}
```

### Detail Siswa

```
GET /api/siswa/:peserta_didik_id
```

### Tambah Siswa

```
POST /api/siswa
```

```json
{
  "nisn": "3173959741",
  "nama": "ANNASYA AZRA IZZATUNNISA",
  "jenis_kelamin": "P",
  "nama_rombel": "KELAS 3A"
}
```

### Update Siswa

```
PUT /api/siswa/:peserta_didik_id
```

```json
{
  "nama": "Nama Baru",
  "nama_rombel": "KELAS 4A"
}
```

### Hapus Siswa (soft delete)

```
DELETE /api/siswa/:peserta_didik_id
```

### Export CSV

```
GET /api/siswa/export
```

Return file CSV, langsung bisa di-download.

---

## 3. Kartu QR

### Kartu 1 Siswa

```
GET /api/siswa/:peserta_didik_id/kartu-qr
```

Return PDF kartu ukuran CR-80 (85.6x54mm) dengan QR Code.
QR berisi `peserta_didik_id` (UUID).

### Kartu Bulk (banyak siswa)

```
POST /api/siswa/kartu-qr/bulk
```

Request (pilih salah satu):
```json
{
  "siswa_ids": ["uuid-1", "uuid-2", "uuid-3"]
}
```

Atau filter kelas:
```json
{
  "kelas": "KELAS 3A"
}
```

Return PDF berisi banyak kartu (1 halaman = 1 kartu).

**QR Code di kartu:** berisi `peserta_didik_id` (UUID langsung dari Dapodik).
Contoh: `56d41d62-5d64-4e99-b081-00820cd9ea3d`
Library scanner: `html5-qrcode` atau `vue-qrcode-reader`.

---

## 4. Absensi

### Scan QR

```
POST /api/absensi/scan
```

```json
{
  "kode": "56d41d62-5d64-4e99-b081-00820cd9ea3d",
  "sesi_id": "uuid-sesi-aktif"
}
```

| Field | Wajib | Keterangan |
|-------|-------|------------|
| `kode` | Ya | peserta_didik_id hasil scan QR |
| `sesi_id` | Tidak | ID sesi absensi |

**Sukses (200):**
```json
{
  "results": 1,
  "id": "absensi_id",
  "rows": {
    "absensi_id": "uuid",
    "peserta_didik_id": "56d41d62-...",
    "nisn": "3173959741",
    "nama": "ANNASYA AZRA IZZATUNNISA",
    "nama_rombel": "KELAS 3A",
    "tanggal": "2026-09-24",
    "waktu_absen": "2026-09-24T07:12:30.000Z",
    "status": "Hadir",
    "metode": "scan"
  }
}
```

**Duplikat (409):**
```json
{
  "success": false,
  "message": "Siswa sudah absen hari ini pukul 07:12",
  "error_code": "ALREADY_ABSENT"
}
```

**Tidak ditemukan (404):**
```json
{
  "success": false,
  "message": "QR Code tidak dikenali. Siswa tidak ditemukan",
  "error_code": "STUDENT_NOT_FOUND"
}
```

### Absen Manual

```
POST /api/absensi/manual
```

```json
{
  "peserta_didik_id": "56d41d62-...",
  "status": "Izin",
  "keterangan": "Ada acara keluarga"
}
```

Status valid: `Hadir`, `Terlambat`, `Izin`, `Sakit`, `Tidak Hadir`

### Absensi Hari Ini

```
GET /api/absensi/hari-ini
```

### Riwayat Absensi

```
GET /api/absensi
```

| Parameter | Tipe | Default | Keterangan |
|-----------|------|---------|------------|
| `page` | int | 1 | |
| `limit` | int | 50 | Max 200 |
| `tanggal_mulai` | date | - | YYYY-MM-DD |
| `tanggal_selesai` | date | - | |
| `kelas` | string | - | Filter kelas |
| `status` | string | - | Filter status |

### Riwayat Per Siswa

```
GET /api/absensi/siswa/:peserta_didik_id
```

---

## 5. Dashboard

### Ringkasan

```
GET /api/dashboard/ringkasan
```

```json
{
  "results": 1,
  "id": "tanggal",
  "rows": {
    "tanggal": "2026-09-24",
    "total_siswa": 301,
    "hadir": 280,
    "terlambat": 5,
    "izin": 3,
    "sakit": 2,
    "tidak_hadir": 12,
    "persentase_hadir": 92.72
  }
}
```

### Tren Kehadiran

```
GET /api/dashboard/tren
```

Return 7 hari terakhir.

```json
{
  "results": 7,
  "id": "tanggal",
  "rows": [
    { "tanggal": "2026-09-18", "hadir": 289, "persentase": 95.7 },
    { "tanggal": "2026-09-19", "hadir": 275, "persentase": 91.1 }
  ]
}
```

### Siswa Bermasalah

```
GET /api/dashboard/siswa-bermasalah
```

Siswa dengan alfa >= 3.

```json
{
  "results": 5,
  "rows": [
    { "peserta_didik_id": "uuid", "nama": "Budi", "nama_rombel": "KELAS 5A", "total_alfa": 12 }
  ]
}
```

---

## 6. Sync Dapodik

### Mulai Sync

```
POST /api/sync/dapodik
```

```json
{
  "npsn": "20208854",
  "ngrok_url": "https://xxxx.ngrok-free.dev"
}
```

Response (process ~2 menit untuk 302 siswa):

```json
{
  "results": 1,
  "rows": {
    "sync_id": "6e9ca1c2-...",
    "status": "berhasil",
    "total_data": 302,
    "data_baru": 301,
    "data_diperbarui": 0,
    "data_gagal": 1,
    "waktu_mulai": "2026-09-23T19:10:58.980Z",
    "waktu_selesai": "2026-09-23T19:13:21.867Z"
  }
}
```

### Status Sync

```
GET /api/sync/dapodik/status/:sync_id
```

### Riwayat Sync

```
GET /api/sync/dapodik/history
```

---

## 7. Notifikasi

### Log WA

```
GET /api/notifikasi/log
```

(Backend belum kirim WA beneran, tinggal nunggu token Meta API.)

---

## 8. Error Codes

| Code | Status | Pesan |
|------|--------|-------|
| INVALID_CREDENTIALS | 401 | Username atau password salah |
| TOKEN_EXPIRED | 401 | Sesi berakhir, login ulang |
| TOKEN_MISSING | 401 | Token tidak ditemukan |
| FORBIDDEN_ACCESS | 403 | Tidak punya akses |
| STUDENT_NOT_FOUND | 404 | Siswa tidak ditemukan |
| ALREADY_ABSENT | 409 | Sudah absen hari ini |
| DAPODIK_CONNECTION_ERROR | 502 | Gagal konek Dapodik |
| VALIDATION_ERROR | 400 | Data tidak valid |
| SISWA_ALREADY_EXISTS | 409 | NISN sudah terdaftar |
| RATE_LIMIT_EXCEEDED | 429 | Terlalu banyak request |

**Format error:**
```json
{
  "success": false,
  "message": "Pesan error",
  "error_code": "ERROR_CODE",
  "errors": [
    { "field": "nisn", "message": "NISN sudah terdaftar" }
  ]
}
```

---

## 9. Akun Test

| Role | Username | Password |
|------|----------|----------|
| Admin | admin@sekolah.sch.id | admin123 |
| Guru | guru@sekolah.sch.id | guru123 |

---

## 10. Axios Setup

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://backend-absensi-siswa-mu.vercel.app',
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
```

**Contoh pake:**

```javascript
// Login
const { data } = await api.post('/api/auth/login', {
  username: 'admin@sekolah.sch.id',
  password: 'admin123'
});
localStorage.setItem('token', data.rows.token);

// Daftar siswa
const siswa = await api.get('/api/siswa?limit=20&kelas=KELAS%203A');

// Scan QR (kode = peserta_didik_id hasil QR)
const absen = await api.post('/api/absensi/scan', {
  kode: '56d41d62-5d64-4e99-b081-00820cd9ea3d'
});

// Dashboard
const dash = await api.get('/api/dashboard/ringkasan');

// Download kartu PDF
window.open('https://backend-absensi-siswa-mu.vercel.app/api/siswa/{id}/kartu-qr');

// Export CSV
window.open('https://backend-absensi-siswa-mu.vercel.app/api/siswa/export');
```