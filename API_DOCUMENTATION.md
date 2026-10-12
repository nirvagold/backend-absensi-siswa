# API Documentation

Base URL: `https://backend-absensi-siswa-mu.vercel.app`

---

## Daftar Isi

- [Pertama: Cara Pake Token](#pertama-cara-pake-token)
- [1. Auth](#1-auth)
- [2. Siswa](#2-siswa)
- [3. Kartu QR / PDF](#3-kartu-qr--pdf)
- [4. Absensi](#4-absensi)
- [5. Dashboard](#5-dashboard)
- [6. Sync Dapodik](#6-sync-dapodik)
- [7. Notifikasi](#7-notifikasi)
- [8. Cron Alfa Otomatis](#8-cron-alfa-otomatis)
- [9. Zona Waktu & Aturan Status](#9-zona-waktu--aturan-status)
- [10. Error Codes](#10-error-codes)
- [11. Akun Test](#11-akun-test)
- [12. Tips & Trik](#12-tips--trik)

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
6. Backend cek udah absen apa belum hari ini (batas hari WIB)
7. Kalo belum -> hitung status dari jam scan -> catat -> berhasil
8. Kalo udah -> return 409
```

**Status otomatis dari jam scan:**

Status dihitung dari **jam WIB** waktu scan dibandingkan `ABSEN_BATAS_MASUK` (default `09:00`):

| Waktu scan (WIB) | Status |
|------------------|--------|
| Sebelum/tepat batas masuk | `Hadir` |
| Setelah batas masuk | `Terlambat` |

Scan yang berhasil **tidak pernah** otomatis jadi "Tidak Hadir" — paling jauh "Terlambat".
Status "Tidak Hadir"/Alfa ditentukan oleh alfa otomatis (cron) atau input manual.

**WA otomatis:** kalau `WA_KIRIM_OTOMATIS` bukan `"false"` dan siswa punya nomor wali,
backend kirim WA (status Hadir/Terlambat) ke orang tua via Fonnte secara async.
Gagal kirim tidak menggagalkan absensi.

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
  "message": "Siswa sudah absen hari ini pukul 07:12 WIB",
  "error_code": "ALREADY_ABSENT",
  "data": {
    "waktu": "2026-09-24T00:12:30.000Z",
    "status": "Hadir"
  }
}
```

**Yang harus ditampilkan:**

- Peringatan: "Anunya udah absen jam 07:12 WIB"
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
  "status": "Tidak Hadir",
  "keterangan": "Sakit"
}
```

**Field:**

| Field | Wajib | Tipe | Keterangan |
|-------|-------|------|------------|
| `peserta_didik_id` | ✅ Ya | string | UUID siswa |
| `status` | ✅ Ya | string | Salah satu dari tabel di bawah |
| `keterangan` | ⚠️ Kondisional | string | **Wajib** kalau `status = "Tidak Hadir"` — isinya `Izin`, `Sakit`, atau `Alfa` |

**Status yang valid:**

| Status | Kapan dipake | Keterangan |
|--------|-------------|------------|
| `Hadir` | Siswa hadir tapi ga bawa kartu | Opsional (bebas) |
| `Terlambat` | Datang telat | Opsional (bebas) |
| `Tidak Hadir` | Ga masuk sekolah | **Wajib**: `Izin` / `Sakit` / `Alfa` |
| `Izin` | Ada surat izin | — (legacy, tetap diterima) |
| `Sakit` | Ada surat dokter / keterangan sakit | — (legacy, tetap diterima) |

> **Catatan:** cara yang dianjurkan sekarang adalah `status: "Tidak Hadir"` + `keterangan`
> berisi `Izin`/`Sakit`/`Alfa`, biar semua ketidakhadiran konsisten dihitung di dashboard
> dan flagging siswa bermasalah. Status `Izin`/`Sakit` lama tetap diterima biar data & frontend
> yang lama ga rusak.

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
    "tanggal": "2026-10-12T00:00:00.000Z",
    "waktu_absen": "2026-10-12T01:30:00.000Z",
    "status": "Tidak Hadir",
    "metode": "manual",
    "keterangan": "Sakit"
  }
}
```

> `tanggal` disimpan sebagai tengah malam UTC dari tanggal **WIB**. `waktu_absen` dikirim
> dalam ISO UTC — konversi ke WIB (+7) buat ditampilin.

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

**Response 400 -- "Tidak Hadir" tanpa keterangan:**

```json
{
  "success": false,
  "message": "Status 'Tidak Hadir' wajib diberi keterangan Izin, Sakit, atau Alfa",
  "error_code": "VALIDATION_ERROR"
}
```

**Response 404 -- Siswa ga ketemu:**

```json
{
  "success": false,
  "message": "Siswa tidak ditemukan",
  "error_code": "STUDENT_NOT_FOUND"
}
```

**WA otomatis:** kalau `WA_KIRIM_OTOMATIS` bukan `"false"`, WA dikirim otomatis **hanya untuk
status `Hadir` dan `Terlambat`**. Izin/Sakit/Alfa/Tidak Hadir **tidak** auto-kirim —
admin kirim manual lewat [7.2 Kirim WA Manual](#72-kirim-wa-manual).

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

### 4.6 Edit Absensi

Buat ngubah status/keterangan absensi yang udah tercatat. Kasus utama: siswa ditandai
**Alfa otomatis** oleh cron, ternyata bawa surat izin -> admin edit jadi Izin.

**Endpoint:**

```
PUT /api/absensi/:absensi_id
```

**Header:** `Authorization: Bearer {token}` (Admin / Guru)

**Body:** (kirim yang mau diubah aja, minimal salah satu)

```json
{
  "status": "Tidak Hadir",
  "keterangan": "Izin"
}
```

**Aturan validasi:** sama kayak absen manual — `status` harus salah satu dari
Hadir/Terlambat/Izin/Sakit/Tidak Hadir, dan kalau `status = "Tidak Hadir"` maka
`keterangan` wajib `Izin` / `Sakit` / `Alfa`.

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
    "tanggal": "2026-10-12T00:00:00.000Z",
    "waktu_absen": "2026-10-12T00:00:00.000Z",
    "status": "Tidak Hadir",
    "metode": "sistem",
    "keterangan": "Izin",
    "petugas_id": "uuid-admin"
  }
}
```

**Response 404 -- Absensi ga ketemu:**

```json
{
  "success": false,
  "message": "Absensi tidak ditemukan",
  "error_code": "NOT_FOUND"
}
```

**Response 400 -- Status ga valid / keterangan kurang:**

```json
{
  "success": false,
  "message": "Status 'Tidak Hadir' wajib diberi keterangan Izin, Sakit, atau Alfa",
  "error_code": "VALIDATION_ERROR"
}
```

### 4.7 Hapus Absensi

**Endpoint:**

```
DELETE /api/absensi/:absensi_id
```

**Header:** `Authorization: Bearer {token}` (**Admin saja**)

Log notifikasi WA yang nyambung ke absensi ini ikut dihapus otomatis.

**Response 200:**

```json
{
  "success": true,
  "message": "Absensi berhasil dihapus"
}
```

**Response 403 -- Bukan admin:**

```json
{
  "success": false,
  "message": "Hanya admin yang bisa menghapus absensi",
  "error_code": "FORBIDDEN_ACCESS"
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

### 5.3 Rekap Per Kelas

**Endpoint:**

```
GET /api/dashboard/per-kelas
```

**Header:** `Authorization: Bearer {token}`

**Response 200:**

```json
{
  "results": 12,
  "id": "nama_rombel",
  "start": 0,
  "limit": 20,
  "rows": [
    { "nama_rombel": "KELAS 1A", "total_siswa": 27, "hadir": 25, "persentase": 92.6 },
    { "nama_rombel": "KELAS 1B", "total_siswa": 27, "hadir": 24, "persentase": 88.9 }
  ]
}
```

### 5.4 Siswa Bermasalah (Flagging)

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

WA dikirim lewat **Fonnte** (bukan Meta API). Kalau `FONNTE_TOKEN` belum diset,
pengiriman balas `{ status: "gagal", error: "FONNTE_TOKEN belum diset" }` dan tetap dicatat di log.

### 7.1 Log Notifikasi

```
GET /api/notifikasi/log
```

**Header:** `Authorization: Bearer {token}` (**Admin saja**)

Ambil 50 log terakhir. Response:

```json
{
  "results": 12,
  "id": "notifikasi_id",
  "rows": [
    {
      "notifikasi_id": "uuid",
      "absensi_id": "uuid-absensi",
      "nomor_tujuan": "081234567890",
      "pesan": "Absen: ANNASYA AZRA IZZATUNNISA - Hadir",
      "status": "dikirim",
      "created_at": "2026-10-12T01:30:05.000Z"
    }
  ]
}
```

### 7.2 Kirim WA Manual

Kirim (atau kirim ulang) WA hasil absen ke wali siswa. Dipake buat status yang
**tidak** auto-kirim: Izin, Sakit, Alfa, Tidak Hadir.

**Endpoint:**

```
POST /api/notifikasi/kirim/:absensi_id
```

**Header:** `Authorization: Bearer {token}` (Admin / Guru)

**Body:** kosong

**Response 200:**

```json
{
  "success": true,
  "data": {
    "status": "dikirim"
  }
}
```

Kalau Fonnte nolak, `status` jadi `"gagal"` + ada `error` (tapi HTTP tetap 200,
dan kegagalan tetap dicatat di log):

```json
{
  "success": true,
  "data": {
    "status": "gagal",
    "error": "token tidak valid"
  }
}
```

**Response 404 -- Absensi ga ketemu:**

```json
{
  "success": false,
  "message": "Absensi tidak ditemukan",
  "error_code": "NOT_FOUND"
}
```

**Response 400 -- Siswa ga punya nomor wali:**

```json
{
  "success": false,
  "message": "Nomor telepon wali siswa tidak tersedia",
  "error_code": "NO_PHONE"
}
```

### 7.3 Setting Notifikasi

**Endpoint:**

```
GET /api/notifikasi/setting
```

**Header:** `Authorization: Bearer {token}` (**Admin saja**)

```json
{
  "results": 1,
  "id": "wa_otomatis",
  "rows": {
    "wa_otomatis": true
  }
}
```

`wa_otomatis` dibaca dari env `WA_KIRIM_OTOMATIS` (`"false"` = mati).

### 7.4 Test Kirim WA

```
POST /api/notifikasi/test
```

**Header:** `Authorization: Bearer {token}` (**Admin saja**)

**Body:**

```json
{
  "nomor": "081234567890",
  "pesan": "Test notifikasi dari Sistem Absensi QR"
}
```

`pesan` opsional. Response sama kayak 7.2 (`{ success: true, data: { status } }`).

### Isi Pesan WA

```
Assalamualaikum Wr. Wb.

Yth. Bpk/Ibu Wali dari {nama}

{nama} telah absen masuk pada:
Jam: {HH:MM} WIB
Status: {status}
Tanggal: {YYYY-MM-DD}

-- SDN 2 Garumukti
```

---

## 8. Cron Alfa Otomatis

Siswa yang **sampai lewat jam masuk (`ABSEN_BATAS_MASUK`, default 09:00 WIB) belum absen**
otomatis ditandai:
`status = "Tidak Hadir"`, `keterangan = "Alfa"`, `metode = "sistem"`.
Bisa diedit jadi Izin/Sakit lewat [4.6 Edit Absensi](#46-edit-absensi).

**Endpoint:**

```
GET /api/cron/alfa
GET /api/cron/alfa?tanggal=YYYY-MM-DD
```

**Header (pilih salah satu):**

- `Authorization: Bearer {CRON_SECRET}` (dipakai Vercel Cron)
- `x-cron-secret: {CRON_SECRET}`

`tanggal` opsional (default hari ini WIB) — buat nandai alfa di tanggal lampau.

**Response 200:**

```json
{
  "success": true,
  "data": [
    {
      "sekolah_id": "uuid-sekolah",
      "sekolah_nama": "SDN 2 GARUMUKTI",
      "total_siswa": 301,
      "sudah_absen": 250,
      "ditandai": 51
    }
  ]
}
```

**Response 401 -- Secret salah / ga ada:**

```json
{
  "success": false,
  "message": "Secret tidak valid",
  "error_code": "CRON_UNAUTHORIZED"
}
```

**Response 503 -- `CRON_SECRET` belum diset di server:**

```json
{
  "success": false,
  "message": "CRON_SECRET belum diset",
  "error_code": "CRON_UNCONFIGURED"
}
```

**Siapa yang manggil:**

- **Vercel** (serverless): Vercel Cron di `vercel.json` — `0 2 * * *` UTC (= **09:00 WIB**) — otomatis manggil endpoint ini tiap hari. Set `CRON_SECRET` di dashboard Vercel.
- **Railway / server long-running**: scheduler in-proses di `src/index.js` (cek tiap menit, jalan sekali sehari setelah jam masuk WIB). Matikan dengan `JADWAL_JOBS=false`.
- **Manual**: panggil endpointnya pake curl / Postman.

Aman dipanggil berkali-kali (idempotent) — siswa yang udah punya absensi hari itu di-skip.

---

## 9. Zona Waktu & Aturan Status

### Zona waktu

Semua perhitungan hari dan jam pakai **WIB (UTC+7)**, ga bergantung timezone server
(Vercel jalan di UTC). Jadi absen jam 00:30 WIB dihitung sebagai **hari baru**,
bukan nempel ke absen kemarin.

- Kolom `tanggal` = tengah malam UTC dari tanggal WIB (mis. `2026-10-12T00:00:00.000Z`).
- Field `waktu_absen` selalu ISO UTC — tambah 7 jam buat nampilin WIB.
- Query `tanggal_mulai` / `tanggal_selesai` pakai tanggal WIB, dan `tanggal_selesai` **inklusif**.

### Ringkasan aturan status

| Kejadian | Status | Keterangan |
|----------|--------|------------|
| Scan QR sebelum/tepat batas masuk | `Hadir` | — |
| Scan QR setelah batas masuk | `Terlambat` | — |
| Input manual Hadir (lupa kartu) | `Hadir` | — |
| Input manual sakit/izin | `Tidak Hadir` | `Sakit` / `Izin` |
| Lewat jam masuk belum absen (cron) | `Tidak Hadir` | `Alfa` |

### Ringkasan WA

| Status | WA otomatis | WA manual |
|--------|-------------|-----------|
| `Hadir` | ✅ (kalau `WA_KIRIM_OTOMATIS` ≠ `"false"`) | ✅ |
| `Terlambat` | ✅ (kalau `WA_KIRIM_OTOMATIS` ≠ `"false"`) | ✅ |
| `Tidak Hadir` (Izin/Sakit/Alfa) | ❌ | ✅ |

---

## 10. Error Codes

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
| `CRON_UNAUTHORIZED` | 401 | Secret cron salah / ga dikirim |
| `FORBIDDEN_ACCESS` | 403 | Role user ga berhak akses |
| `STUDENT_NOT_FOUND` | 404 | Siswa ga ketemu di DB |
| `NOT_FOUND` | 404 | Data (mis. absensi) ga ketemu |
| `NO_PHONE` | 400 | Siswa ga punya nomor telepon wali |
| `ALREADY_ABSENT` | 409 | Udah absen hari ini |
| `INVALID_QR_CODE` | 400 | Format kode QR salah |
| `DAPODIK_CONNECTION_ERROR` | 502 | Gagal konek ke Dapodik |
| `DAPODIK_CONFIG_MISSING` | 400 | URL / token Dapodik blom diatur |
| `SYNC_IN_PROGRESS` | 409 | Sync lagi jalan |
| `CRON_UNCONFIGURED` | 503 | `CRON_SECRET` belum diset di server |
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

## 11. Akun Test

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin@sekolah.sch.id` | `admin123` |
| Guru | `guru@sekolah.sch.id` | `guru123` |

---

## 12. Tips & Trik

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

**Status dihitung otomatis** dari jam scan (WIB) vs `ABSEN_BATAS_MASUK` — lewat batas
langsung dapet `status: "Terlambat"`, ga perlu ditentuin frontend.

### Flow Edit Absen Alfa jadi Izin

```javascript
// Alfa otomatis udah ditandai cron (status: "Tidak Hadir", keterangan: "Alfa")
// Ternyata siswa bawa surat izin -> admin edit:
await api.put(`/api/absensi/${absensi_id}`, {
  status: 'Tidak Hadir',
  keterangan: 'Izin'
});
```

### Flow Kirim WA Manual

```javascript
// Otomatis cuma buat Hadir/Terlambat. Buat Izin/Sakit/Alfa, admin kirim sendiri:
await api.post(`/api/notifikasi/kirim/${absensi_id}`);
// -> { success: true, data: { status: "dikirim" } }
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
2. **Format waktu:** ISO 8601 UTC. Tambah 7 jam buat WIB — `new Date(data.waktu_absen).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })`
3. **Nama field:** `snake_case` semua. Jangan pake camelCase
4. **Display value:** pake field yang ada `_str` kalo perlu teks (contoh: `agama_id_str`)
5. **Kelas:** namanya `KELAS 3A`, `KELAS 1B`, dll. Pake spasi. Kalo mau filter, URL encode jadi `KELAS%203A`
6. **Tidak hadir:** pakai `status: "Tidak Hadir"` + `keterangan` (`Izin`/`Sakit`/`Alfa`) — bukan status terpisah
7. **Hari absensi:** batasnya jam **00:00 WIB**, bukan UTC. Absen jam 00:30 WIB masuk hari baru