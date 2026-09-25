# Catatan untuk Frontend

Hal-hal yang ga ada di PRD tapi perlu diketahui pas nyambungin API.

---

## Filter Kelas & Search (SiswaView)

**Jangan filter client-side.** Kirim parameter ke backend biar pagination ngikut.

```
GET /api/siswa?search=annasya&kelas=KELAS%205A&page=1&limit=20
```

Backend ngerti parameter: `search`, `kelas`, `tingkat`, `page`, `limit`.

Data kelas buat dropdown ambil dari:

```
GET /api/kelas
```

Balikannya 12 kelas lengkap dengan jumlah siswa.

---

## Absensi Manual

Format udah fix, tinggal pake:

```
POST /api/absensi/manual
Authorization: Bearer {token}
Content-Type: application/json

{
  "peserta_didik_id": "uuid-siswa",
  "status": "Sakit",
  "keterangan": "Demam berobat"
}
```

Status valid: `Hadir`, `Terlambat`, `Izin`, `Sakit`, `Tidak Hadir`

Kalo siswa udah absen hari ini, balik 409 `ALREADY_ABSENT`.

---

## QR Code

QR sekarang isinya **peserta_didik_id (UUID)**, bukan md5(NISN). Jadi scan -> dapet UUID -> kirim langsung:

```
POST /api/absensi/scan
{
  "kode": "56d41d62-..."
}
```

---

## Sync Dapodik

Body request butuh 3 field:

```json
{
  "npsn": "20208854",
  "ngrok_url": "https://xxxx.ngrok-free.dev",
  "token": "0B5EHd1bAQzakEI"
}
```

Tipe sync bisa milih: `all` (default), `peserta_didik`, `pengguna`, `rombongan_belajar`.

---

## Generate Kartu Bulk

Backend ga kenal parameter `semua_siswa`. Pake filter `kelas` atau `siswa_ids`:

```json
{
  "kelas": "KELAS 5A"
}
```

Atau pake array ID:

```json
{
  "siswa_ids": ["uuid-1", "uuid-2"]
}
```

---

## Format Waktu

Response dari backend formatnya ISO 8601. Contoh:

```json
"waktu_absen": "2026-09-25T10:41:51.975Z"
```

Di frontend perlu di-format manual:

```javascript
new Date(waktu_absen).toLocaleTimeString('id-ID', {
  hour: '2-digit',
  minute: '2-digit'
})
```

---

## Endpoint Baru (Mungkin Belum di PRD)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | /api/kelas | Daftar 12 kelas + jumlah siswa |
| GET | /api/dashboard/per-kelas | Statistik absensi per kelas |
| GET | /api/dashboard/tren | Tren 7 hari terakhir |
| POST | /api/notifikasi/test | Kirim test WA |
| GET | /api/absensi/siswa/:id | Riwayat absen per siswa |