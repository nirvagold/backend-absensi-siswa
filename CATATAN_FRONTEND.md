# Sinkronisasi Backend ↔ Frontend

Dokumen ini buat tim frontend. Isinya: **apa yang berubah di backend**, **endpoint barunya**,
dan **apa yang perlu disesuaikan di frontend** biar dua-duanya klop.

Terakhir diperbarui: 2026-10-13 (setelah commit `c99f705` + `9dad209`).

Base URL tetap sama: `https://backend-absensi-siswa-mu.vercel.app`

---

## 1. Ringkasan Perubahan

| # | Perubahan | Dampak ke frontend |
|---|-----------|-------------------|
| 1 | **Scan di luar jam sekolah ditolak** (400) | 🔴 **Wajib** — ScannerView harus nangkep error code baru |
| 2 | **Status scan otomatis** Hadir/Terlambat dari jam | 🟢 Aman — ScannerView udah baca `rows.status` |
| 3 | **Alfa otomatis** jam 09:00 WIB | 🟡 Perlu — dashboard punya 6 kartu, backend cuma kirim 5 field |
| 4 | **"Tidak Hadir" wajib keterangan** Izin/Sakit/Alfa | 🔴 **Wajib** — ManualAbsensiView sekarang bakal ditolak 400 |
| 5 | **Edit absensi** `PUT /api/absensi/:id` | 🟢 Endpoint baru, belum ada UI-nya |
| 6 | **WA otomatis/manual** | 🟢 Endpoint baru, belum ada UI-nya |
| 7 | **Zona waktu WIB** di semua hari/jam | 🟡 Perlu — format jam di frontend belum set timezone |
| 8 | **`GET /api/absensi` nambah `keterangan`?** | ⚠️ **Belum** — lihat bagian 4.1, ini yang paling bikin bingung |

---

## 2. Perubahan Detail

### 2.1 Scan di luar jam sekolah ditolak (BARU)

**Aturan:** scan cuma diterima jam **06:00 – 12:00 WIB** (bisa diatur backend lewat env
`ABSEN_JAM_MULAI` / `ABSEN_JAM_SELESAI`).

Di luar jam itu, `POST /api/absensi/scan` balas **400**:

```json
{
  "success": false,
  "message": "Absen ditolak: sudah lewat jam absen. Jam absen dibuka 06:00 - 12:00 WIB",
  "error_code": "OUTSIDE_ABSEN_HOURS",
  "data": {
    "waktu_scan": "2026-10-12T16:50:11.057Z",
    "jam_wib": "23:50"
  }
}
```

`message` bisa diawali `"Absen ditolak: sebelum jam absen dibuka."` (scan kepagian)
atau `"Absen ditolak: sudah lewat jam absen."` (scan kesorean).

> ### ⚠️ Ini masalah nomor satu di frontend sekarang
>
> [ScannerView.vue:617](../../frontend/src/views/ScannerView.vue#L617) udah nangkep error code
> `OUTSIDE_SCHEDULE`, tapi **backend ngirim `OUTSIDE_ABSEN_HOURS`**. Jadi user bakal lihat
> pesan generik *"Gagal mencatat absensi."* padahal yang salah cuma jamnya.
>
> ```js
> // ScannerView.vue:617 — SEKARANG (kode error-nya ga pernah match)
> } else if (errorCode === 'OUTSIDE_SCHEDULE') {
>   attendanceError.value = 'Saat ini di luar jadwal absensi.'
> }
> ```

**Yang harus diubah** (2 baris di [ScannerView.vue](../../frontend/src/views/ScannerView.vue)):

```js
} else if (errorCode === 'OUTSIDE_ABSEN_HOURS') {
  // pakai pesan dari backend biar jam bukanya ikut kelihatan
  attendanceError.value =
    error.response?.data?.message || 'Saat ini di luar jam absensi.'
}
```

Saran tambahan: karena `message` dari backend udah informatif (menyebut jam buka–tutup),
lebih baik tampilkan `message` langsung daripada nulis pesan sendiri. Kode lain
(`ALREADY_ABSENT`, `STUDENT_NOT_FOUND`) juga sudah mengirim pesan yang enak dibaca.

### 2.2 Status scan otomatis: Hadir / Terlambat

Scan sebelum/tepat jam 09:00 WIB → `Hadir`. Setelahnya → `Terlambat`.
**[ScannerView.vue:460](../../frontend/src/views/ScannerView.vue#L460) udah baca
`attendanceResult.status`** — jadi gak perlu diubah, sudah klop. ✅

Kartu "Absensi berhasil" di ScannerView selalu hijau walau statusnya Terlambat — kalau mau,
warnanya bisa dibikin kuning untuk Terlambat. Opsional.

### 2.3 Alfa otomatis (BARU)

Siswa yang sampai **09:00 WIB** belum scan otomatis dicatat
`status: "Tidak Hadir"` + `keterangan: "Alfa"` + `metode: "sistem"`.

Efek di frontend:

- **Dashboard** `tidak_hadir` bakal naik drastis setelah jam 9 (semua yang belum scan masuk situ)
- **Riwayat** bakal muncul baris status `Tidak Hadir`, metode `sistem`

⚠️ **DashboardView baca `dashboard.alpha`** ([DashboardView.vue:264](../../frontend/src/views/DashboardView.vue#L264)),
tapi `GET /api/dashboard/ringkasan` **tidak pernah mengirim field `alpha`**. Karena ada `?? 0`,
kartu itu **selalu nampilin 0** — kemungkinan besar ini bukan bug baru, tapi sekarang makin
kelihatan karena alfa jadi nyata. Lihat bagian 4.2.

### 2.4 "Tidak Hadir" wajib keterangan Izin/Sakit/Alfa

Ini yang **paling mungkin bikin frontend error** sekarang.

**Aturan baru:**
- Status absensi yang valid: `Hadir`, `Terlambat`, `Tidak Hadir` (bukan lagi `Izin`/`Sakit` sebagai status)
- `Izin` / `Sakit` / `Alfa` sekarang jadi **keterangan**, bukan status
- Kalau kirim `status: "Tidak Hadir"` **tanpa** `keterangan` → **400**

```json
{
  "success": false,
  "message": "Status 'Tidak Hadir' wajib diberi keterangan Izin, Sakit, atau Alfa",
  "error_code": "VALIDATION_ERROR"
}
```

**Tapi jangan panik** — backend masih nerima cara lama demi kompatibilitas:

| Yang dikirim frontend sekarang | Hasil |
|---|---|
| `{status: 'Izin', keterangan: 'ada surat'}` | ✅ Diterima, disimpan apa adanya |
| `{status: 'Sakit'}` | ✅ Diterima |
| `{status: 'Tidak Hadir'}` tanpa keterangan | ❌ **400 VALIDATION_ERROR** |
| `{status: 'Tidak Hadir', keterangan: 'Alfa'}` | ✅ Diterima |

> ### ⚠️ Masalah nomor dua di frontend
>
> [ManualAbsensiView.vue:196](../../frontend/src/views/ManualAbsensiView.vue#L196) & [:223](../../frontend/src/views/ManualAbsensiView.vue#L223)
> cuma punya **2 pilihan status: `Izin` dan `Sakit`** — gak ada `Hadir`, `Terlambat`, atau `Tidak Hadir`.
> Dan [keterangan dilabeli "(opsional)"](../../frontend/src/views/ManualAbsensiView.vue#L246).
>
> Jadi guru gak bisa input **Hadir (lupa bawa kartu)** dari UI, padahal itu kasus paling umum.
> Sementara `Tidak Hadir` gak bisa dipilih sama sekali, jadi guru gak punya cara nandai alfa
> manual kalau cron belum jalan.

### 2.5 Endpoint baru yang belum ada UI-nya

| Endpoint | Fungsi | Saran UI |
|---|---|---|
| `PUT /api/absensi/:absensi_id` | Ubah status/keterangan | Tombol "Edit" di tabel Riwayat (lihat 4.3) |
| `POST /api/notifikasi/kirim/:absensi_id` | Kirim WA manual | Tombol "Kirim WA" di Riwayat |
| `GET /api/notifikasi/setting` | Baca setting WA | Bisa buat nampilin status aktif/nonaktif |
| `GET /api/notifikasi/log` | 50 log WA terakhir | Halaman opsional |
| `POST /api/notifikasi/test` | Tes kirim WA | Opsional, buat debugging |
| `GET /api/cron/alfa` | Trigger alfa manual | **Jangan taruh di frontend** — ini endpoint cron |

Detail lengkap ada di [API_DOCUMENTATION.md](API_DOCUMENTATION.md) bagian 4.6, 4.7, 7.x, dan 8.

### 2.6 Zona waktu WIB

**Backend:**
- Kolom `tanggal` = tengah malam UTC dari tanggal **WIB** (mis. `2026-10-13T00:00:00.000Z`)
- `waktu_absen` = ISO UTC asli
- Query `tanggal_mulai`/`tanggal_selesai` = tanggal WIB, dan `tanggal_selesai` **inklusif**
- Batas hari = **00:00 WIB** (dulu ikut jam server, jadi absen jam 00:30 WIB salah masuk hari kemarin)

> ### ⚠️ Masalah nomor tiga di frontend
>
> Dua tempat nge-format jam tanpa nyebut timezone:
>
> ```js
> // ScannerView.vue:528  &  RiwayatView.vue:1170
> new Date(value).toLocaleTimeString('id-ID', {
>   hour: '2-digit',
>   minute: '2-digit',
> })
> ```
>
> Ini pakai **timezone device user**. Guru yang HP-nya masih UTC (atau WITA/WIT) bakal lihat
> jam **beda 1–8 jam** dari yang tercatat di database, dan beda dari isi pesan WA yang
> dikirim ke orang tua (`jamStrWIB` di backend = selalu WIB).
>
> **Perbaikannya** (2 tempat, 1 baris masing-masing):
>
> ```js
> new Date(value).toLocaleTimeString('id-ID', {
>   hour: '2-digit',
>   minute: '2-digit',
>   timeZone: 'Asia/Jakarta',   // <-- tambah ini
> })
> ```
>
> `formatDate` di [DashboardView.vue:471](../../frontend/src/views/DashboardView.vue#L471)
> aman — dia pakai `tanggal` (string `YYYY-MM-DD`) dan nyusun tanggal lokal sendiri.
> Tapi kalau mau konsisten, `tanggal` cukup ditampilkan apa adanya tanpa `new Date()`,
> karena backend udah kirim string tanggalnya.

### 2.7 Role: `Kepala Sekolah`, bukan `Kepsek`

Frontend pakai `'Kepala Sekolah'` — itu **benar** dan **sudah cocok** dengan backend
([sync.js:61](src/routes/sync.js#L61)). Dokumentasi lama yang nulis "Kepsek" itu yang salah.
Tidak ada yang perlu diubah. ✅

Catatan untuk test: di DB produksi **belum ada** akun Kepala Sekolah
(`peran_id_str` yang ada cuma `Admin` dan `Guru`). Baru muncul setelah sync Dapodik.

---

## 3. Yang perlu diubah di frontend — prioritas

### 🔴 P0 — bikin fitur yang ada jalan bener

1. **ScannerView**: ganti `OUTSIDE_SCHEDULE` → `OUTSIDE_ABSEN_HOURS`
   ([baris 617](../../frontend/src/views/ScannerView.vue#L617))
2. **ManualAbsensiView**: tambah pilihan status `Hadir` + `Terlambat` + `Tidak Hadir`,
   dan bikin keterangan jadi **wajib** kalau `Tidak Hadir` dipilih
   ([baris 183–238](../../frontend/src/views/ManualAbsensiView.vue#L183))
3. **ManualAbsensiView**: kirim `keterangan` yang bener sesuai status
4. **Kedua file `formatTime`**: tambah `timeZone: 'Asia/Jakarta'`

### 🟡 P1 — biar informasi gak ilang

5. **RiwayatView**: tampilkan kolom `keterangan` (sekarang cuma nampilin `status`, jadi
   "Tidak Hadir" Izin / Sakit / Alfa kelihatan sama semua)
6. **RiwayatView**: filter status pakai nilai baru (`Tidak Hadir` + keterangan), bukan
   `Izin`/`Sakit` sebagai status
7. **DashboardView**: kartu "Alpha" selalu 0 karena field `alpha` gak ada di response

### 🟢 P2 — fitur baru

8. Tombol Edit di Riwayat (`PUT /api/absensi/:id`)
9. Tombol "Kirim WA" di Riwayat (`POST /api/notifikasi/kirim/:absensi_id`)

---

## 4. Hal yang perlu diputuskan bareng

### 4.1 `GET /api/absensi` belum mengirim `keterangan`

Ini yang perlu dibahas. **RiwayatView manggil `GET /api/absensi`** dan baca
`response.data.rows`, lalu menampilkan `row.status`
([baris 848](../../frontend/src/views/RiwayatView.vue#L848)) — **tidak membaca
`keterangan`**, dan backend juga **belum mengirimnya**.

Jadi baris Izin, Sakit, dan Alfa semuanya muncul dengan label yang sama: **"Tidak Hadir"**.
Guru gak bisa bedain siapa yang izin dan siapa yang alfa di halaman riwayat.

**Usul saya:** tambahkan `keterangan` + `metode` ke response `GET /api/absensi`
(field `metode` sebenernya dibaca frontend di [baris 858](../../frontend/src/views/RiwayatView.vue#L858)
tapi juga belum ada di response).

```json
{
  "absensi_id": "uuid",
  "peserta_didik_id": "56d41d62-...",
  "nisn": "3173959741",
  "nama": "ANNASYA AZRA IZZATUNNISA",
  "nama_rombel": "KELAS 3A",
  "tanggal": "2026-10-13",
  "waktu_absen": "2026-10-13T00:12:30.000Z",
  "status": "Tidak Hadir",
  "keterangan": "Alfa",      // <-- BARU
  "metode": "sistem"         // <-- BARU (frontend udah nunggu ini)
}
```

**Mau saya kerjakan dari sisi backend?** Satu baris di `src/routes/absensi.js` (2 tempat:
`GET /` dan `GET /hari-ini`).

### 4.2 `GET /api/absensi` — frontend baca `response.data.ringkasan`, backend gak kirim

[RiwayatView.vue:1110](../../frontend/src/views/RiwayatView.vue#L1110) baca
`response.data.ringkasan` buat 5 kartu ringkasan di atas tabel. Saya cek response asli
dari backend, key-nya cuma:

```
results, id, start, limit, rows, pagination
```

(`ringkasan` gak ada.)

Karena ada `v-if="summary"` ([baris 379](../../frontend/src/views/RiwayatView.vue#L379)),
blok ringkasan itu **gak pernah dirender sama sekali** — gak error, cuma kosong.

**Dua pilihan:**

- **(a) Backend nyediain** — tambah `ringkasan` ke response `GET /api/absensi`, isinya hitungan
  per status sesuai filter yang aktif. Lebih enak, karena angka & tabel dijamin konsisten
- **(b) Frontend hitung sendiri** — dari `rows` yang ada. Masalahnya `rows` cuma 1 halaman,
  jadi angkanya salah kalau data lebih dari 50 baris

Saya saranin **(a)**. Mau dikerjakan?

### 4.3 Edit absensi: UI-nya gimana?

Backend udah punya `PUT /api/absensi/:id` (Admin & Guru). Kasus utamanya: **alfa otomatis
diubah jadi izin** setelah siswa bawa surat.

Format body & response ada di [API_DOCUMENTATION.md](API_DOCUMENTATION.md) bagian 4.6.

**Pertanyaan buat frontend:** edit-nya di mana enaknya?

- Tombol di Riwayat (sebaris sama Hapus) — cuma bisa edit, gak bisa ubah jam
- Atau halaman detail absensi terpisah

Backend cuma nerima `status` + `keterangan`; `waktu_absen` & `metode` gak bisa diubah.

### 4.4 Rencana WA otomatis

| Status | WA otomatis | WA manual |
|---|---|---|
| `Hadir` | ✅ kalau `WA_KIRIM_OTOMATIS` ≠ `"false"` | ✅ |
| `Terlambat` | ✅ kalau `WA_KIRIM_OTOMATIS` ≠ `"false"` | ✅ |
| `Tidak Hadir` (Izin/Sakit/Alfa) | ❌ sengaja gak otomatis | ✅ |

Sekarang `FONNTE_TOKEN` **belum diset di Vercel**, jadi semua pengiriman balas
`{ status: "gagal" }` (dan tetap tercatat di log). Selama token belum diisi, tombol
"Kirim WA" bakal selalu balas gagal — bukan bug, cuma belum dikonfigurasi.

---

## 5. Checklist Test Manual

Sebelum nganggep dua sisi udah klop, cek ini:

- [ ] **Scan jam 05:00 WIB** → ditolak 400, pesan nyebut "sebelum jam absen dibuka"
- [ ] **Scan jam 07:00 WIB** → sukses, status `Hadir`
- [ ] **Scan jam 10:00 WIB** → sukses, status `Terlambat`
- [ ] **Scan jam 23:00 WIB** → ditolak 400, pesan nyebut "sudah lewat jam absen"
- [ ] **Scan siswa yang sama 2x** → yang kedua 409 "sudah absen pukul HH:MM WIB"
- [ ] **Scan siswa yang udah kena alfa otomatis** → sukses jadi `Terlambat` + `diubah_dari_alfa`
- [ ] **Manual `Izin`** (cara lama) → tetap berhasil
- [ ] **Manual `Tidak Hadir` tanpa keterangan** → 400
- [ ] **Manual `Tidak Hadir` + keterangan `Alfa`** → berhasil
- [ ] **Jam di Riwayat** = jam WIB yang sama dengan jam scan beneran
- [ ] **Hapus absensi** (Admin) → berhasil, baris hilang

---

## 6. Ringkasan Aksi

| Siapa | Ngapain |
|---|---|
| **Frontend** | Fix 4 hal P0 (error code, opsi status manual, keterangan, timezone) |
| **Backend** | Kalau disetujui: kirim `keterangan` + `metode` di `GET /api/absensi`, dan `ringkasan` |
| **Operator (kamu)** | Set `CRON_SECRET` + `FONNTE_TOKEN` di Vercel biar alfa & WA beneran jalan |
