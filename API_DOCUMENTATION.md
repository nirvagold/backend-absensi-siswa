# API Documentation

Base URL: `https://backend-absensi-siswa-mu.vercel.app`

---

## Daftar Isi

- [Pertama: Cara Pake Token](#pertama-cara-pake-token)
- [1. Auth](#1-auth)
- [2. Siswa](#2-siswa)
- [3. Kartu QR / PDF](#3-kartu-qr-pdf)
- [4. Absensi](#4-absensi)
- [5. Dashboard](#5-dashboard)
- [6. Sync Dapodik](#6-sync-dapodik)
- [7. Notifikasi](#7-notifikasi)
- [8. Error Codes](#8-error-codes)
- [9. Akun Test](#9-akun-test)
- [10. Tips & Trik](#10-tips-trik)

---

## Pertama: Cara Pake Token

**Ada 2 jenis token. Jangan ketuker.**

| Token | Fungsi | Siapa yang pake |
|---|---|---|
| **JWT** (hasil login) | Akses semua API backend | **Frontend** -- wajib dikirim di tiap request |
| Dapodik Token (`0B5EH...`) | Ambil data dari Dapodik | **Backend doang**, frontend ga perlu tau |

### Cara kerja JWT:

1. **Login** -> dapet token
2. **Simpen** di localStorage
3. **Kirim** di header tiap request (kecuali login)
4. **Kalo 401** -> redirect ke login

### Format header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Contoh pake Axios (udah auto):

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://backend-absensi-siswa-mu.vercel.app',
});

// Ini yang otomatis nambahin header
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Ini yang otomatis redirect kalo 401
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

### Semua response pake format ini:

```json
{
  "results": 302,
  "id": "peserta_didik_id",
  "start": 0,
  "limit": 20,
  "rows": [ ... ]
}
```

- Field names: `snake_case`
- Display value: pake suffix `_str` (contoh: `agama_id_str: "Islam"`)

---

## 1. Auth

> **Ga perlu header Authorization** untuk login. Sisanya wajib.

### 1.1 Login

Mendapatkan JWT token. Token ini yang dipake buat akses semua endpoint lain.

**Endpoint:**

```
POST /api/auth/login
```

**Body:**

```json
{
  "username": "admin@sekolah.sch.id",
  "password": "admin123"
}
```

**Response 200 -- Berhasil:**

```json
{
  "results": 1,
  "id": "pengguna_id",
  "start": 0,
  "limit": 1,
  "rows": {
    "pengguna_id": "892042b2-9155-45db-9b77-d39a21041298",
    "username": "admin@sekolah.sch.id",
    "nama": "Admin SDN 2 Garumukti",
    "peran_id_str": "Admin",
    "sekolah_id": "3c6b9c9d-3778-4aa5-909a-a75c2621b6f2",
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Response 401 -- Gagal:**

```json
{
  "success": false,
  "message": "Username atau password salah",
  "error_code": "INVALID_CREDENTIALS"
}
```

**Response 400 -- Body ga lengkap:**

```json
{
  "success": false,
  "message": "Username dan password wajib diisi",
  "error_code": "VALIDATION_ERROR"
}
```

**Response 429 -- Kebanyakan nyoba:**

```json
{
  "success": false,
  "message": "Terlalu banyak percobaan login. Coba lagi dalam 60 detik.",
  "error_code": "RATE_LIMIT_EXCEEDED"
}
```

**Catatan buat frontend:**

```javascript
// Simpen token abis login
const res = await api.post('/api/auth/login', {
  username: 'admin@sekolah.sch.id',
  password: 'admin123'
});
localStorage.setItem('token', res.data.rows.token);
```

### 1.2 Profil

Mengambil data user yang lagi login.

**Endpoint:**

```
GET /api/auth/me
```

**Header:** `Authorization: Bearer {token}`

**Response 200:**

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

**Response 401 (token ga ada / expired):**

```json
{
  "success": false,
  "message": "Token tidak ditemukan",
  "error_code": "TOKEN_MISSING"
}
```

### 1.3 Logout

**Endpoint:**

```
POST /api/auth/logout
```

**Header:** `Authorization: Bearer {token}`

**Response 200:**

```json
{
  "success": true,
  "message": "Logout berhasil"
}
```

> Sebenernya logout itu hapus token di frontend doang. Backend cuma bilang "iya". Jadi ya hapus aja `localStorage.removeItem('token')`.

---

## 2. Siswa

> **Semua endpoint di sini wajib pake header:** `Authorization: Bearer {token}`

### 2.1 Daftar Siswa (Dengan Pagination)

**Endpoint:**

```
GET /api/siswa
```

**Query Parameters:**

| Parameter | Tipe | Default | Wajib? | Keterangan |
|-----------|------|---------|--------|------------|
| `page` | integer | 1 | Tidak | Halaman (mulai dari 1) |
| `limit` | integer | 20 | Tidak | Max 100 |
| `search` | string | - | Tidak | Cari berdasarkan nama / NISN / NIPD (min 3 karakter) |
| `kelas` | string | - | Tidak | Harus sama persis. Contoh: KELAS 3A |

**Cara pake di frontend:**

```javascript
// Halaman 1, default 20 siswa
const res = await api.get('/api/siswa');

// Cari siswa
const res = await api.get('/api/siswa?search=annasya');

// Filter kelas
const res = await api.get('/api/siswa?kelas=KELAS%203A');

// Pagination
const res = await api.get('/api/siswa?page=2&limit=50');
```

**Response 200:**

```json
{
  "results": 301,
  "id": "peserta_didik_id",
  "start": 0,
  "limit": 20,
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
      "rt": "5",
      "rw": "5",
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
    "limit": 20,
    "total": 301,
    "total_pages": 16
  }
}
```

**Penjelasan field:**

| Field | Contoh | Keterangan |
|-------|--------|------------|
| `peserta_didik_id` | `56d41d62-...` | UUID primary key -- dipake buat QR code |
| `nisn` | `3173959741` | Nomor induk siswa nasional |
| `nipd` | `2425012611` | Nomor induk PPDB |
| `nama` | `ANNASYA AZRA IZZATUNNISA` | Nama lengkap |
| `jenis_kelamin` | `P` | L / P |
| `nik` | `3205345711170002` | NIK KTP |
| `nama_rombel` | `KELAS 3A` | Nama kelas |
| `tingkat_pendidikan_id` | `3` | Tingkat 1-6 |
| `nomor_telepon_seluler` | `null` | Nomor HP (sering kosong) |
| `foto_url` | `null` | Foto (belum ada datanya) |

### 2.2 Detail Siswa

**Endpoint:**

```
GET /api/siswa/:peserta_didik_id
```

**Response 200:**

```json
{
  "results": 1,
  "id": "peserta_didik_id",
  "start": 0,
  "limit": 1,
  "rows": {
    "peserta_didik_id": "56d41d62-...",
    "nisn": "3173959741",
    "nama": "ANNASYA AZRA IZZATUNNISA",
    "jenis_kelamin": "P",
    "nama_rombel": "KELAS 3A",
    "tingkat_pendidikan_id": "3"
  }
}
```

**Response 404:**

```json
{
  "success": false,
  "message": "Siswa tidak ditemukan",
  "error_code": "STUDENT_NOT_FOUND"
}
```

### 2.3 Tambah Siswa

**Endpoint:**

```
POST /api/siswa
```

**Header:** `Authorization: Bearer {token}` (Admin aja)

**Body:**

```json
{
  "nisn": "8888888888",
  "nama": "Budi Santoso",
  "jenis_kelamin": "L",
  "nama_rombel": "KELAS 4A",
  "nik": "3205345711170002",
  "tempat_lahir": "Garut",
  "tanggal_lahir": "2016-05-10"
}
```

**Wajib diisi:** `nisn`, `nama`, `jenis_kelamin`
**Opsional:** sisanya

**Response 201 -- Berhasil:**

```json
{
  "results": 1,
  "id": "peserta_didik_id",
  "start": 0,
  "limit": 1,
  "rows": {
    "peserta_didik_id": "15e792ee-99b4-4a0f-a628-e1d52bf1e73b",
    "nisn": "8888888888",
    "nama": "Budi Santoso",
    "jenis_kelamin": "L",
    "nama_rombel": "KELAS 4A"
  }
}
```

**Response 400 -- Validasi gagal:**

```json
{
  "success": false,
  "message": "nisn, nama, jenis_kelamin wajib diisi",
  "error_code": "VALIDATION_ERROR"
}
```

**Response 409 -- NISN duplikat:**

```json
{
  "success": false,
  "message": "NISN sudah terdaftar",
  "error_code": "SISWA_ALREADY_EXISTS"
}
```

### 2.4 Update Siswa

**Endpoint:**

```
PUT /api/siswa/:peserta_didik_id
```

**Header:** `Authorization: Bearer {token}` (Admin aja)

**Body:**

```json
{
  "nama": "Nama Baru",
  "nama_rombel": "KELAS 5A"
}
```

Ga perlu kirim semua field. Cukup field yang mau diubah.

**Response 200:**

```json
{
  "results": 1,
  "id": "peserta_didik_id",
  "start": 0,
  "limit": 1,
  "rows": {
    "peserta_didik_id": "15e792ee-...",
    "nisn": "8888888888",
    "nama": "Nama Baru",
    "nama_rombel": "KELAS 5A",
    "jenis_kelamin": "L"
  }
}
```

### 2.5 Hapus Siswa (Soft Delete)

> Ini soft delete, artinya `is_active` jadi `false`. Data tetep di database.

**Endpoint:**

```
DELETE /api/siswa/:peserta_didik_id
```

**Header:** `Authorization: Bearer {token}` (Admin aja)

**Response 200:**

```json
{
  "success": true,
  "message": "Siswa berhasil dinonaktifkan"
}
```

**Catatan:** Kalo udah di-delete, siswa ini ga muncul di daftar (karena filter `is_active: true`).

### 2.6 Export CSV

**Endpoint:**

```
GET /api/siswa/export
```

**Header:** `Authorization: Bearer {token}`

Ini return file CSV, bukan JSON. Contoh cara ngedownload:

```javascript
// Cara 1: langsung redirect (paling gampang)
window.open('https://backend-absensi-siswa-mu.vercel.app/api/siswa/export');

// Cara 2: pake axios + blob
const res = await api.get('/api/siswa/export', { responseType: 'blob' });
const url = window.URL.createObjectURL(new Blob([res.data]));
const link = document.createElement('a');
link.href = url;
link.setAttribute('download', 'siswa.csv');
document.body.appendChild(link);
link.click();
```

---

## 3. Kartu QR / PDF

> **Semua endpoint di sini wajib pake header:** `Authorization: Bearer {token}`

### 3.1 Generate Kartu 1 Siswa

**Endpoint:**

```
GET /api/siswa/:peserta_didik_id/kartu-qr
```

**Header:** `Authorization: Bearer {token}` (Admin aja)

**Response:** File PDF. Bukan JSON.

**Spesifikasi kartu:**

| Komponen | Detail |
|----------|--------|
| Ukuran | 85.6 x 54 mm (CR-80) |
| Orientasi | Landscape |
| Header | Nama sekolah |
| Nama siswa | Font bold 14pt |
| NISN | Nomor induk |
| Kelas | Nama rombel |
| QR Code | 25x25mm, berisi peserta_didik_id |
| Tahun ajaran | Footer |

**Cara download:**

```javascript
// Cara paling gampang
window.open(`https://backend-absensi-siswa-mu.vercel.app/api/siswa/${peserta_didik_id}/kartu-qr`);
```

### 3.2 Generate Kartu Bulk

**Endpoint:**

```
POST /api/siswa/kartu-qr/bulk
```

**Header:** `Authorization: Bearer {token}` (Admin aja)

**Opsi 1 -- Pake array ID:**

```json
{
  "siswa_ids": [
    "56d41d62-5d64-4e99-b081-00820cd9ea3d",
    "7cb2a2eb-1455-4bce-8370-00ad4ec60dd1"
  ]
}
```

**Opsi 2 -- Filter kelas:**

```json
{
  "kelas": "KELAS 3A"
}
```

**Response:** File PDF dengan banyak halaman. 1 halaman = 1 kartu.

---

## 4. Absensi

> **Semua endpoint di sini wajib pake header:** `Authorization: Bearer {token}`

### 4.1 Scan QR

Ini inti dari semua fitur. QR discan -> kirim UUID -> backend catat absen.

**Endpoint:**

```
POST /api/absensi/scan
```

**Header:** `Authorization: Bearer {token}` (Admin / Guru)

**Body:**

```json
{
  "kode": "56d41d62-5d64-4e99-b081-00820cd9ea3d",
  "sesi_id": "uuid-sesi-aktif"
}
```

| Field | Wajib | Tipe | Keterangan |
|-------|-------|------|------------|
| `kode` | ✅ Ya | string | `peserta_didik_id` hasil dari scan QR |
| `sesi_id` | ❌ Tidak | string | ID sesi kalo guru buka sesi |

**Alur lengkap:**

```
1. Siswa tunjukkin kartu QR
2. Petugas buka halaman scan
3. Kamera scan QR -> dapet peserta_didik_id (UUID)
4. Frontend kirim POST kode itu ke backend
5. Backend cari siswa (1 query langsung, cepet)
6. Backend cek udah absen apa belum hari ini
7. Kalo belum -> catat -> berhasil
8. Kalo udah -> return 409
```

**Response 200 -- Berhasil:**

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

**Yang harus ditampilkan di frontend setelah sukses:**

- Nama siswa: `ANNASYA AZRA IZZATUNNISA`
- Kelas: `KELAS 3A`
- Waktu: `07:12`
- Status: `Hadir`
- Pesan: `Absensi berhasil dicatat`

**Response 409 -- Udah absen:**

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

**Yang harus ditampilkan:**

- Peringatan: "Anunya udah absen jam 07:12"
- Jangan dianggep error, tapi kasih tau aja

**Response 404 -- QR ga dikenal:**

```json
{
  "success": false,
  "message": "QR Code tidak dikenali. Siswa tidak ditemukan",
  "error_code": "STUDENT_NOT_FOUND"
}
```

**Response 400 -- Kode kosong:**

```json
{
  "success": false,
  "message": "Kode QR wajib diisi",
  "error_code": "VALIDATION_ERROR"
}
```

### 4.2 Absen Manual

Buat kalo siswa lupa bawa kartu, izin, sakit, atau telat.

**Endpoint:**

```
POST /api/absensi/manual
```

**Header:** `Authorization: Bearer {token}` (Admin / Guru)

**Body:**

```json
{
  "peserta_didik_id": "56d41d62-...",
  "status": "Sakit",
  "keterangan": "Demam berobat ke puskesmas"
}
```

**Status yang valid:**

| Status | Kapan dipake |
|--------|-------------|
| `Hadir` | Siswa hadir tapi ga bawa kartu |
| `Terlambat` | Datang telat |
| `Izin` | Ada surat izin |
| `Sakit` | Ada surat dokter / keterangan sakit |
| `Tidak Hadir` | Alfa tanpa keterangan |

**Response 200:**

```json
{
  "results": 1,
  "id": "absensi_id",
  "start": 0,
  "limit": 1,
  "rows": {
    "absensi_id": "uuid",
    "peserta_didik_id": "56d41d62-...",
    "tanggal": "2026-09-24",
    "waktu_absen": "2026-09-24T08:30:00.000Z",
    "status": "Sakit",
    "metode": "manual",
    "keterangan": "Demam berobat ke puskesmas"
  }
}
```

**Response 409 -- Udah absen:**

```json
{
  "success": false,
  "message": "Siswa sudah absen hari ini dengan status Hadir",
  "error_code": "ALREADY_ABSENT"
}
```

**Response 400 -- Status ga valid:**

```json
{
  "success": false,
  "message": "Status tidak valid",
  "error_code": "VALIDATION_ERROR"
}
```

### 4.3 Absensi Hari Ini

Buat nampilin daftar real-time yang udah absen hari ini.

**Endpoint:**

```
GET /api/absensi/hari-ini
```

**Header:** `Authorization: Bearer {token}`

**Response 200:**

```json
{
  "results": 5,
  "id": "absensi_id",
  "start": 0,
  "limit": 20,
  "rows": [
    {
      "absensi_id": "uuid",
      "peserta_didik_id": "56d41d62-...",
      "nisn": "3173959741",
      "nama": "ANNASYA AZRA IZZATUNNISA",
      "nama_rombel": "KELAS 3A",
      "waktu_absen": "2026-09-24T07:12:30.000Z",
      "status": "Hadir",
      "metode": "scan"
    }
  ]
}
```

**Buat polling real-time:** Panggil endpoint ini tiap 5-10 detik selama sesi absen berlangsung.

### 4.4 Riwayat Absensi

**Endpoint:**

```
GET /api/absensi
```

**Header:** `Authorization: Bearer {token}`

**Query Parameters:**

| Parameter | Tipe | Default | Keterangan |
|-----------|------|---------|------------|
| `page` | int | 1 | Pagination |
| `limit` | int | 50 | Max 200 |
| `tanggal_mulai` | date | - | Format: YYYY-MM-DD |
| `tanggal_selesai` | date | - | Format: YYYY-MM-DD |
| `kelas` | string | - | Filter nama rombel |
| `status` | string | - | Hadir / Terlambat / Izin / Sakit / Tidak Hadir |

**Contoh:**

```javascript
// Riwayat minggu ini
api.get('/api/absensi?tanggal_mulai=2026-09-18&tanggal_selesai=2026-09-24');

// Filter kelas tertentu
api.get('/api/absensi?kelas=KELAS%203A&status=Hadir');

// Pagination
api.get('/api/absensi?page=2&limit=20');
```

**Response 200:**

```json
{
  "results": 150,
  "id": "absensi_id",
  "start": 0,
  "limit": 50,
  "rows": [
    {
      "absensi_id": "uuid",
      "peserta_didik_id": "56d41d62-...",
      "nisn": "3173959741",
      "nama": "ANNASYA AZRA IZZATUNNISA",
      "nama_rombel": "KELAS 3A",
      "tanggal": "2024-09-24",
      "waktu_absen": "2026-09-24T07:12:30.000Z",
      "status": "Hadir",
      "metode": "scan"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "total_pages": 3
  }
}
```

### 4.5 Riwayat Per Siswa

**Endpoint:**

```
GET /api/absensi/siswa/:peserta_didik_id
```

**Header:** `Authorization: Bearer {token}`

**Response:**

```json
{
  "results": 30,
  "id": "absensi_id",
  "start": 0,
  "limit": 20,
  "rows": [
    {
      "absensi_id": "uuid",
      "peserta_didik_id": "56d41d62-...",
      "tanggal": "2026-09-24T00:00:00.000Z",
      "waktu_absen": "2026-09-24T07:12:30.000Z",
      "status": "Hadir",
      "metode": "scan"
    }
  ]
}
```

---

## 5. Dashboard

> **Semua endpoint di sini wajib pake header:** `Authorization: Bearer {token}`

### 5.1 Ringkasan Hari Ini

**Endpoint:**

```
GET /api/dashboard/ringkasan
```

**Header:** `Authorization: Bearer {token}`

**Response 200:**

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

**Buat tampilan dashboard:**

```
Total Siswa:  301
Hadir:        280  (92.72%)
Terlambat:    5
Izin:         3
Sakit:        2
Tidak Hadir:  12
```

### 5.2 Tren Kehadiran (7 Hari)

**Endpoint:**

```
GET /api/dashboard/tren
```

**Header:** `Authorization: Bearer {token}`

**Response 200:**

```json
{
  "results": 7,
  "id": "tanggal",
  "start": 0,
  "limit": 20,
  "rows": [
    { "tanggal": "2026-09-18", "hadir": 289, "persentase": 95.7 },
    { "tanggal": "2026-09-19", "hadir": 275, "persentase": 91.1 },
    { "tanggal": "2026-09-20", "hadir": 0, "persentase": 0 },
    { "tanggal": "2026-09-21", "hadir": 0, "persentase": 0 },
    { "tanggal": "2026-09-22", "hadir": 291, "persentase": 96.4 },
    { "tanggal": "2026-09-23", "hadir": 285, "persentase": 94.4 },
    { "tanggal": "2026-09-24", "hadir": 280, "persentase": 92.7 }
  ]
}
```

**Catatan:** Persentase 0 artinya hari libur / minggu / belum ada absensi.

### 5.3 Siswa Bermasalah (Flagging)

Siswa yang sering alfa (total alfa >= 3).

**Endpoint:**

```
GET /api/dashboard/siswa-bermasalah
```

**Header:** `Authorization: Bearer {token}`

**Response 200:**

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

**Buat tampilan:**

```
Nama              Kelas       Alfa
Budi Santoso      KELAS 5A    12x
Siti Nurhaliza    KELAS 4B     5x
```

---

## 6. Sync Dapodik

> **Semua endpoint di sini wajib pake header:** `Authorization: Bearer {token}` (Admin aja)

### 6.1 Mulai Sinkronisasi

**Endpoint:**

```
POST /api/sync/dapodik
```

**Header:** `Authorization: Bearer {token}` (Admin)

**Body:**

```json
{
  "npsn": "20208854",
  "ngrok_url": "https://lyricism-simplify-crate.ngrok-free.dev",
  "token": "0B5EHd1bAQzakEI",
  "tipe": "all"
}
```

**Tipe sync:**

| Tipe | Fungsi |
|------|--------|
| `all` (default) | Ambil siswa + buat akun guru + set wali kelas |
| `peserta_didik` | Data siswa doang |
| `pengguna` | Bikin akun guru/kepsek dari Dapodik |
| `rombongan_belajar` | Set wali kelas dari rombel |

**Response (langsung balik):**

```json
{
  "results": 1,
  "id": "sync_id",
  "start": 0,
  "limit": 1,
  "rows": {
    "sync_id": "6e9ca1c2-...",
    "status": "berjalan"
  }
}
```

Ini bakal proses ~2 menit untuk 302 siswa + 8 akun guru + 12 wali kelas. **Yang perlu frontend lakuin: polling.**

```javascript
// 1. Mulai sync
const sync = await api.post('/api/sync/dapodik', {
  npsn: '20208854',
  ngrok_url: 'https://lyricism-simplify-crate.ngrok-free.dev',
  token: '0B5EHd1bAQzakEI',
  tipe: 'all'
});
const syncId = sync.data.rows.sync_id;

// 2. Polling status tiap 5 detik
const interval = setInterval(async () => {
  const status = await api.get(`/api/sync/dapodik/status/${syncId}`);
  if (status.data.rows.status !== 'berjalan') {
    clearInterval(interval);
    // Selesai! Tampilkan hasil
    alert(`Sinkronisasi selesai! ${status.data.rows.total_data} siswa`);
  }
}, 5000);
```

**Response kalo selesai (via polling status):**

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

**Response error (502):**

```json
{
  "success": false,
  "message": "Gagal terhubung ke Dapodik. Pastikan ngrok berjalan dan token valid.",
  "error_code": "DAPODIK_CONNECTION_ERROR"
}
```

### 6.2 Riwayat Sync

```
GET /api/sync/dapodik/history
```

---

## 7. Notifikasi

```
GET /api/notifikasi/log
```

> **Catatan:** Ini masih tabel doang. Kirim WA beneran belum aktif -- nunggu setup token Meta API.

---

## 8. Error Codes

### HTTP Status Codes

| Code | Artinya |
|------|---------|
| 200 | OK |
| 201 | Data berhasil dibuat |
| 400 | Input salah / ga lengkap |
| 401 | Token ga ada / expired |
| 403 | Role ga punya akses |
| 404 | Data ga ditemukan |
| 409 | Konflik (duplikat) |
| 422 | Validasi gagal |
| 429 | Kena rate limit |
| 500 | Error server |
| 502 | Gagal konek ke Dapodik |

### Daftar Error Code

| Code | Status | Penyebab |
|------|--------|----------|
| `INVALID_CREDENTIALS` | 401 | Username/password salah |
| `TOKEN_EXPIRED` | 401 | Token kedaluwarsa, suruh login ulang |
| `TOKEN_MISSING` | 401 | Header Authorization ga ada |
| `TOKEN_INVALID` | 401 | Token palsu / corrupted |
| `FORBIDDEN_ACCESS` | 403 | Role user ga berhak akses |
| `STUDENT_NOT_FOUND` | 404 | Siswa ga ketemu di DB |
| `ALREADY_ABSENT` | 409 | Udah absen hari ini |
| `INVALID_QR_CODE` | 400 | Format kode QR salah |
| `DAPODIK_CONNECTION_ERROR` | 502 | Gagal konek ke Dapodik |
| `DAPODIK_CONFIG_MISSING` | 400 | URL / token Dapodik blom diatur |
| `SYNC_IN_PROGRESS` | 409 | Sync lagi jalan |
| `VALIDATION_ERROR` | 400 / 422 | Field wajib kosong / format salah |
| `SISWA_ALREADY_EXISTS` | 409 | NISN udah terdaftar |
| `RATE_LIMIT_EXCEEDED` | 429 | Kegencet tombol terlalu cepet |

### Format Error

```json
{
  "success": false,
  "message": "Pesan error yang jelas buat user",
  "error_code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "nisn",
      "message": "NISN sudah terdaftar"
    }
  ]
}
```

Bagian `errors` cuma muncul kalo ada validasi multiple field.

---

## 9. Akun Test

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin@sekolah.sch.id` | `admin123` |
| Guru | `guru@sekolah.sch.id` | `guru123` |

---

## 10. Tips & Trik

### Pagination

Semua endpoint yang return list (`/api/siswa`, `/api/absensi`) punya ini:

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

### 401 Handler

```javascript
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
```

### Flow Login

```javascript
const res = await api.post('/api/auth/login', {
  username: 'admin@sekolah.sch.id',
  password: 'admin123'
});
const token = res.data.rows.token;
localStorage.setItem('token', token);
// Redirect ke dashboard
```

### Flow Scan QR

```javascript
// Hasil scan dari html5-qrcode
const pesertaDidikId = decodedText; // UUID dari QR

const res = await api.post('/api/absensi/scan', {
  kode: pesertaDidikId
});

if (res.status === 200) {
  const data = res.data.rows;
  alert(`Absen berhasil!\n${data.nama}\n${data.waktu_absen}`);
}

// Kalo 409 (udah absen)
if (res.status === 409) {
  alert(`Udah absen jam ${data.data.waktu}`);
}
```

### Flow Download PDF Kartu

```javascript
// 1 siswa
window.open(`https://backend-absensi-siswa-mu.vercel.app/api/siswa/${id}/kartu-qr`);

// Bulk per kelas
await api.post('/api/siswa/kartu-qr/bulk', { kelas: 'KELAS 3A' }, { responseType: 'blob' });
```

### Notes Penting

1. **QR code isinya:** `peserta_didik_id` (UUID). Langsung kirim ke backend, ga perlu diolah lagi
2. **Format waktu:** ISO 8601. Tinggal `new Date(data.waktu_absen).toLocaleTimeString('id-ID')`
3. **Nama field:** `snake_case` semua. Jangan pake camelCase
4. **Display value:** pake field yang ada `_str` kalo perlu teks (contoh: `agama_id_str`)
5. **Kelas:** namanya `KELAS 3A`, `KELAS 1B`, dll. Pake spasi. Kalo mau filter, URL encode jadi `KELAS%203A`