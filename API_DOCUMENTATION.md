# API Documentation — Backend Absensi QR

> **Base URL:** `https://backend-absensi-siswa-mu.vercel.app`
>
> Semua response mengikuti **format Dapodik**: `{ results, id, start, limit, rows }`
>
> Field names: **snake_case**, suffix `_str` untuk display value.

---

## Daftar Isi

- [Autentikasi](#1-autentikasi)
- [Data Siswa](#2-data-siswa)
- [Absensi](#4-absensi)
- [Dashboard](#5-dashboard)
- [Sync Dapodik](#6-sync-dapodik)
- [Error Codes](#7-error-codes)
- [Akun Test](#8-akun-test)

---

## 1. Autentikasi

### Login

Mendapatkan JWT token untuk akses endpoint lain.

```
POST /api/auth/login
```

**Request Body:**
```json
{
  "username": "admin@sekolah.sch.id",
  "password": "admin123"
}
```

**Response Sukses (200):**
```json
{
  "results": 1,
  "id": "pengguna_id",
  "start": 0,
  "limit": 1,
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

**Response Gagal (401):**
```json
{
  "success": false,
  "message": "Username atau password salah",
  "error_code": "INVALID_CREDENTIALS"
}
```

> **⚠️ Wajib:** Setiap request (kecuali login) harus menyertakan header:
> ```
> Authorization: Bearer {token}
> ```

### Profil Saya

```
GET /api/auth/me
```

**Response:**
```json
{
  "results": 1,
  "id": "pengguna_id",
  "start": 0,
  "limit": 1,
  "rows": {
    "pengguna_id": "892042b2-...",
    "username": "admin@sekolah.sch.id",
    "nama": "Admin SDN 2 Garumukti",
    "peran_id_str": "Admin",
    "sekolah_id": "3c6b9c9d-...",
    "nomor_telepon_seluler": null
  }
}
```

---

## 2. Data Siswa

### Daftar Siswa

```
GET /api/siswa
```

**Query Parameters:**

| Parameter | Tipe | Default | Keterangan |
|-----------|------|---------|------------|
| `page` | int | 1 | Halaman |
| `limit` | int | 20 | Max 100 |
| `search` | string | - | Cari nama / NISN / NIPD |
| `kelas` | string | - | Filter nama_rombel (KELAS 1A) |
| `tingkat` | string | - | Filter tingkat_pendidikan_id (1-6) |

**Response:**
```json
{
  "results": 301,
  "id": "peserta_didik_id",
  "start": 0,
  "limit": 3,
  "rows": [
    {
      "peserta_didik_id": "56d41d62-5d64-4e99-b081-00820cd9ea3d",
      "nisn": "3173959741",
      "nipd": "2425012611",
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
      "nomor_telepon_seluler": null,
      "foto_url": null,
      "is_active": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 3,
    "total": 301,
    "total_pages": 101
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

**Request Body:**
```json
{
  "nisn": "3173959741",
  "nama": "ANNASYA AZRA IZZATUNNISA",
  "jenis_kelamin": "P",
  "nama_rombel": "KELAS 3A"
}
```

---

## 4. Absensi

### Scan QR

Mencatat absensi berdasarkan scan QR Code.

```
POST /api/absensi/scan
```

**Request Body:**
```json
{
  "kode": "md5-hash-of-nisn",
  "sesi_id": "uuid-sesi-aktif"
}
```

| Field | Wajib | Keterangan |
|-------|-------|------------|
| `kode` | ✅ Ya | `peserta_didik_id` (UUID) — hasil scan QR, langsung dari kartu |
| `sesi_id` | ❌ Tidak | ID sesi absensi (opsional) |

**Response Sukses (200):**
```json
{
  "results": 1,
  "id": "absensi_id",
  "start": 0,
  "limit": 1,
  "rows": {
    "absensi_id": "uuid-absensi-456",
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

**Response Duplikat (409):**
```json
{
  "success": false,
  "message": "Siswa sudah absen hari ini pukul 07:12",
  "error_code": "ALREADY_ABSENT",
  "data": {
    "waktu": "2026-09-24T07:12:30.000Z",
    "status": "Hadir"
  }
}
```

**Response Siswa Tidak Ditemukan (404):**
```json
{
  "success": false,
  "message": "QR Code tidak dikenali. Siswa tidak ditemukan",
  "error_code": "STUDENT_NOT_FOUND"
}
```

### Absen Manual

Untuk input manual (izin, sakit, telat).

```
POST /api/absensi/manual
```

**Request Body:**
```json
{
  "peserta_didik_id": "56d41d62-...",
  "status": "Izin",
  "keterangan": "Ada acara keluarga"
}
```

Status yang valid: `Hadir`, `Terlambat`, `Izin`, `Sakit`, `Tidak Hadir`

### Absensi Hari Ini

Mendapatkan daftar absensi hari ini (real-time).

```
GET /api/absensi/hari-ini
```

### Riwayat Absensi

```
GET /api/absensi
```

**Query Parameters:**

| Parameter | Tipe | Default | Keterangan |
|-----------|------|---------|------------|
| `page` | int | 1 | |
| `limit` | int | 50 | Max 200 |
| `tanggal_mulai` | date | - | YYYY-MM-DD |
| `tanggal_selesai` | date | - | YYYY-MM-DD |
| `kelas` | string | - | Filter nama_rombel |
| `status` | string | - | Filter status |

**Response:**
```json
{
  "results": 50,
  "id": "absensi_id",
  "start": 0,
  "limit": 50,
  "rows": [
    {
      "absensi_id": "uuid",
      "peserta_didik_id": "uuid",
      "nisn": "3173959741",
      "nama": "ANNASYA AZRA IZZATUNNISA",
      "nama_rombel": "KELAS 3A",
      "tanggal": "2026-09-24",
      "waktu_absen": "2026-09-24T07:12:30.000Z",
      "status": "Hadir",
      "metode": "scan"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 150, "total_pages": 3 }
}
```

---

## 5. Dashboard

### Ringkasan Hari Ini

```
GET /api/dashboard/ringkasan
```

**Response:**
```json
{
  "results": 1,
  "id": "tanggal",
  "start": 0,
  "limit": 1,
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

Tampilan di Frontend:
```
┌──────────────────────────────────────┐
│  📅 24 September 2026                │
│                                      │
│  TOTAL      HADIR     TERLAMBAT      │
│   301       280          5           │
│                                      │
│  IZIN      SAKIT     TIDAK HADIR     │
│    3         2           12          │
│                                      │
│  ✅ Kehadiran: 92.72%               │
└──────────────────────────────────────┘
```

### Siswa Bermasalah (Flagging Alfa)

```
GET /api/dashboard/siswa-bermasalah
```

Menampilkan siswa dengan alfa >= 3 kali.

**Response:**
```json
{
  "results": 5,
  "id": "peserta_didik_id",
  "start": 0,
  "limit": 20,
  "rows": [
    {
      "peserta_didik_id": "uuid",
      "nama": "Budi Santoso",
      "nama_rombel": "KELAS 5A",
      "total_alfa": 12
    }
  ]
}
```

---

## 6. Sync Dapodik

### Mulai Sinkronisasi

```
POST /api/sync/dapodik
```

**Request Body:**
```json
{
  "npsn": "20208854",
  "ngrok_url": "https://lyricism-simplify-crate.ngrok-free.dev"
}
```

**Response (sync butuh waktu ~2 menit untuk 302 siswa):**
```json
{
  "results": 1,
  "id": "sync_id",
  "start": 0,
  "limit": 1,
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

### Cek Status Sync

```
GET /api/sync/dapodik/status/:sync_id
```

### Riwayat Sync

```
GET /api/sync/dapodik/history
```

---

## 7. Error Codes

| Code | Status | Pesan |
|------|--------|-------|
| `INVALID_CREDENTIALS` | 401 | Username atau password salah |
| `TOKEN_EXPIRED` | 401 | Sesi telah berakhir, login ulang |
| `TOKEN_MISSING` | 401 | Token tidak ditemukan |
| `FORBIDDEN_ACCESS` | 403 | Tidak punya akses |
| `STUDENT_NOT_FOUND` | 404 | Siswa tidak ditemukan |
| `ALREADY_ABSENT` | 409 | Sudah absen hari ini |
| `DAPODIK_CONNECTION_ERROR` | 502 | Gagal konek Dapodik |
| `DAPODIK_CONFIG_MISSING` | 400 | URL/token Dapodik belum diatur |
| `VALIDATION_ERROR` | 400 | Data tidak valid |
| `SISWA_ALREADY_EXISTS` | 409 | NISN sudah terdaftar |
| `RATE_LIMIT_EXCEEDED` | 429 | Terlalu banyak request |

**Format Error Global:**
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

## 8. Akun Test

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin@sekolah.sch.id` | `admin123` |
| Guru | `guru@sekolah.sch.id` | `guru123` |

---

## Tips untuk Frontend

### Axios Setup

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://backend-absensi-siswa-mu.vercel.app',
});

// Auto-attach JWT
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 — redirect ke login
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

### Cara Pake

```javascript
// Login
const { data } = await api.post('/api/auth/login', {
  username: 'admin@sekolah.sch.id',
  password: 'admin123'
});
localStorage.setItem('token', data.rows.token);

// Ambil daftar siswa
const siswa = await api.get('/api/siswa?limit=20&kelas=KELAS%203A');
console.log(siswa.data.rows); // array siswa

// Kirim scan QR
const absen = await api.post('/api/absensi/scan', {
  kode: md5('3173959741') // hasil dari library QR scanner
});

// Dashboard
const dash = await api.get('/api/dashboard/ringkasan');
console.log(dash.data.rows); // { total_siswa, hadir, ... }
```

### Response Pagination

Semua endpoint list (`/api/siswa`, `/api/absensi`) punya pagination di response:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 301,
    "total_pages": 16
  }
}
```

---

> **QR Code:** Berisi `peserta_didik_id` (UUID langsung dari Dapodik). Contoh: `56d41d62-5d64-4e99-b081-00820cd9ea3d`
>
> Library scanner: [html5-qrcode](https://www.npmjs.com/package/html5-qrcode) atau [vue-qrcode-reader](https://www.npmjs.com/package/vue-qrcode-reader).
>
> Format capture hasil scan: `{ kode: "56d41d62-..." }` → POST ke `/api/absensi/scan`.