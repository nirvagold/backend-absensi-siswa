# Sinkronisasi Backend ↔ Frontend

Dokumen ini buat tim frontend. Isinya: **apa yang berubah di backend**, **endpoint barunya**,
dan **apa yang perlu disesuaikan di frontend** biar dua-duanya klop.

Terakhir diperbarui: 2026-10-13 (jam absensi jadi 06:00–08:00 WIB, dashboard nambah
`total_tidak_hadir`/`sudah_absen`/`belum_absen`, setting WA bisa diubah dari UI,
field baru `jam_absen` & `label_status`).

Base URL tetap sama: `https://backend-absensi-siswa-mu.vercel.app`

---

## 1. Ringkasan Perubahan

| # | Perubahan | Dampak ke frontend |
|---|-----------|-------------------|
| 1 | **Scan di luar jam sekolah ditolak** (400) | 🔴 **Wajib** — ScannerView harus nangkep error code baru |
| 2 | **Status scan otomatis** Hadir/Terlambat dari jam | 🟢 Aman — ScannerView udah baca `rows.status` |
| 3 | **Jam absensi baru**: 06–07 Hadir, 07–08 Terlambat, 08+ tutup | 🔴 **Wajib** — ubah teks jam di UI yang masih nulis 09:00 / 12:00 |
| 4 | **Alfa otomatis** jam 08:00 WIB | ✅ **Beres** — dashboard `alfa`/`alpha` udah dikirim |
| 5 | **"Tidak Hadir" wajib keterangan** Izin/Sakit/Alfa | 🔴 **Wajib** — ManualAbsensiView sekarang bakal ditolak 400 |
| 6 | **Edit absensi** `PUT /api/absensi/:id` | 🟢 Endpoint baru, belum ada UI-nya |
| 7 | **WA otomatis/manual** — bisa diganti dari UI | 🟢 Endpoint baru (`PUT /api/notifikasi/setting`), belum ada UI-nya |
| 8 | **Dashboard nambah** `tidak_hadir`, `sudah_absen`, `belum_absen` | ✅ **Beres** — tinggal dipakai di UI |
| 9 | **Zona waktu WIB** di semua hari/jam | 🟡 Perlu — format jam di frontend belum set timezone |
| 10 | **`GET /api/absensi` nambah `keterangan`, `metode`, `ringkasan`** | ✅ **Beres** — tinggal dipakai di UI |
| 11 | **Filter baru** `keterangan` + `search` | ✅ **Beres** — search Riwayat yang dulu gak jalan, sekarang jalan |
| 12 | **Field baru** `jam_absen` + `label_status` di semua response absensi | ✅ **Beres** — bisa langsung dipakai, gak perlu format sendiri |

---

## 2. Perubahan Detail

### 2.1 Scan di luar jam sekolah ditolak (BARU)

**Aturan jam (WIB)** — bisa diatur backend lewat env, tapi defaultnya ini:

| Jam WIB | Hasil scan |
|---|---|
| sebelum **06:00** | ❌ **400** — "sebelum jam absen dibuka" |
| **06:00 – 07:00** | ✅ `Hadir` |
| **07:00 – 08:00** | ✅ `Terlambat` |
| **08:00** dst. | ❌ **400** — "sudah lewat jam absen" (masuk alfa otomatis) |

Jadi **tidak ada** absensi Hadir jam 10 pagi lagi: lewat jam 08:00 pintunya tutup dan
siswa yang belum scan langsung ditandai alfa.

Di luar jam itu, `POST /api/absensi/scan` balas **400**:

```json
{
  "success": false,
  "message": "Absen ditolak: sudah lewat jam absen. Jam absen dibuka 06:00 - 08:00 WIB (Hadir sampai 07:00, alfa otomatis 08:00)",
  "error_code": "OUTSIDE_ABSEN_HOURS",
  "data": {
    "waktu_scan": "2026-10-12T16:50:11.057Z",
    "jam_wib": "23:50",
    "jam_buka": "06:00",
    "jam_batas_masuk": "07:00",
    "jam_tutup": "08:00"
  }
}
```

`message` bisa diawali `"Absen ditolak: sebelum jam absen dibuka."` (scan kepagian)
atau `"Absen ditolak: sudah lewat jam absen."` (scan kesorean). `data` sekarang juga
ngirim jam-jamnya sendiri, jadi frontend bisa nampilin tanpa parse teks.

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

Scan sebelum jam **07:00 WIB** → `Hadir`. Jam 07:00 ke atas → `Terlambat`.
**[ScannerView.vue:460](../../frontend/src/views/ScannerView.vue#L460) udah baca
`attendanceResult.status`** — jadi gak perlu diubah, sudah klop. ✅

Response scan sekarang **selalu** ada `status`-nya (sebelumnya bisa `undefined`, itu
yang bikin kartu hasil nampilin `-`). Field yang dikirim:

```json
{
  "status": "Hadir",
  "keterangan": null,
  "label_status": "Hadir",
  "jam_absen": "06:42",
  "metode": "scan"
}
```

`label_status` = `status` yang udah digabung keterangan (`"Tidak Hadir (Alfa)"`).
Buat baris Hadir/Terlambat isinya sama kayak `status`. **Pakai `label_status` kalau
males nyusun sendiri, atau `status` + `keterangan` kalau mau styling beda per bagian.**

Kartu "Absensi berhasil" di ScannerView selalu hijau walau statusnya Terlambat — kalau mau,
warnanya bisa dibikin kuning untuk Terlambat. Opsional.

### 2.3 Alfa otomatis (BARU)

Siswa yang sampai **08:00 WIB** belum scan otomatis dicatat
`status: "Tidak Hadir"` + `keterangan: "Alfa"` + `metode: "sistem"`.
Jamnya ikut `ABSEN_BATAS_ALFA` (default 08:00), dan Vercel Cron-nya sudah digeser
ke jam yang sama (`0 1 * * *` UTC).

Kalau siswa yang udah kena alfa ternyata datang dan scan (antara 07:00–08:00), barisnya
**ditimpa** jadi `Terlambat` dan response scan nambah `diubah_dari_alfa: true`.
Jadi siswa gak kena alfa + terlambat sekaligus.

Efek di frontend:

- **Dashboard** `tidak_hadir` bakal naik drastis setelah jam 8 (semua yang belum scan masuk situ)
- **Riwayat** bakal muncul baris status `Tidak Hadir`, metode `sistem`

⚠️ **DashboardView baca `dashboard.alpha`** ([DashboardView.vue:264](../../frontend/src/views/DashboardView.vue#L264)).
Sebelumnya `GET /api/dashboard/ringkasan` **tidak pernah mengirim field `alpha`**, jadi kartu itu
**selalu nampilin 0**. **Udah dibetulin di backend** — sekarang kirim `alfa` **dan** `alpha`
(alias). Lihat bagian 4.3.

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
| `PUT /api/absensi/:absensi_id` | Ubah status/keterangan | Tombol "Edit" di tabel Riwayat (lihat 4.5) |
| `POST /api/notifikasi/kirim/:absensi_id` | Kirim WA manual | Tombol "Kirim WA" di Riwayat |
| `GET /api/notifikasi/setting` | Baca setting WA | Bisa buat nampilin status aktif/nonaktif |
| `PUT /api/notifikasi/setting` | **Ubah** WA otomatis ↔ manual | Toggle di halaman Pengaturan (lihat 4.6) |
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
5. **Teks jam di UI**: mana pun yang masih nulis **09:00** atau **06:00–12:00** harus
   diganti ke **06:00–08:00** (Hadir sampai 07:00). Kalau ada teks hardcoded soal
   "absen sampai jam 12", itu udah gak berlaku.

### 🟡 P1 — biar informasi gak ilang

5. **RiwayatView**: tampilkan `row.keterangan` di kolom Status — backend udah kirim
   ✅ (lihat 4.1), tinggal dipakai di UI
6. **RiwayatView**: ikon metode ngecek `row.metode === 'QR'`, padahal nilainya
   `scan`/`manual`/`sistem` — jadi ikon QR gak pernah muncul

> **DashboardView gak perlu diubah.** Kartu "Alpha" dulu selalu 0 karena field `alpha`
> gak ada di response — itu udah dibetulin dari backend ✅ (lihat 4.3). `?? 0` di
> [baris 264](../../frontend/src/views/DashboardView.vue#L264) boleh dibiarin.

### 🟢 P2 — fitur baru

7. Tombol Edit di Riwayat (`PUT /api/absensi/:id`) — lihat 4.5
8. Tombol "Kirim WA" di Riwayat (`POST /api/notifikasi/kirim/:absensi_id`)

---

## 4. Yang sudah dikerjakan backend

### 4.1 ✅ `GET /api/absensi` sekarang kirim `keterangan` + `metode` + `jam_absen` + `label_status`

Row `GET /api/absensi`, `GET /api/absensi/hari-ini`, `GET /api/absensi/siswa/:id`,
dan response scan/manual/edit sekarang semuanya pakai bentuk yang sama:

```json
{
  "absensi_id": "uuid",
  "peserta_didik_id": "56d41d62-...",
  "nisn": "3173959741",
  "nama": "ANNASYA AZRA IZZATUNNISA",
  "nama_rombel": "KELAS 3A",
  "tanggal": "2026-10-13",
  "waktu_absen": "2026-10-13T00:12:30.000Z",
  "jam_absen": "07:12",
  "status": "Tidak Hadir",
  "keterangan": "Alfa",
  "label_status": "Tidak Hadir (Alfa)",
  "metode": "sistem"
}
```

- `keterangan` isinya `Izin`/`Sakit`/`Alfa` kalau statusnya `Tidak Hadir`, selain itu `null`
- `metode` isinya `scan` / `manual` / `sistem`
- `jam_absen` = jam WIB siap tampil (string `HH:MM`) — **gak perlu format sendiri**, jadi
  masalah timezone di kolom jam Riwayat hilang kalau pakai field ini
- `label_status` = `status` yang udah digabung keterangan

**Yang perlu di frontend:** RiwayatView sekarang bisa nampilin keterangan biar Izin, Sakit,
dan Alfa gak kelihatan sama. Ikon "QR" di kolom metode
([baris 858](../../frontend/src/views/RiwayatView.vue#L858) ngecek `row.metode === 'QR'`)
masih gak match — nilainya sekarang `scan`/`manual`/`sistem`, bukan `QR`.

Saran tampilan kolom Status — tinggal pakai field yang udah disiapin:

```vue
{{ row.label_status }}
<!-- atau kalau mau warna beda per bagian: -->
{{ row.status === 'Tidak Hadir' && row.keterangan
     ? `Tidak Hadir — ${row.keterangan}`
     : row.status }}
```

Dan kolom jam cukup `{{ row.jam_absen }}` — gak usah `new Date().toLocaleTimeString()`
lagi, sekalian lolos dari masalah timezone di 2.6.

### 4.2 ✅ `GET /api/absensi` sekarang kirim `ringkasan`

5 kartu ringkasan di RiwayatView sekarang bisa render. Response nambah key `ringkasan`
dihitung dari **seluruh hasil filter**, bukan cuma 1 halaman:

```json
"ringkasan": {
  "total_siswa": 150,
  "hadir": 120,
  "terlambat": 14,
  "izin": 8,
  "sakit": 5,
  "tidak_hadir": 16,
  "alfa": 11
}
```

Nama field-nya **persis** yang dibaca [RiwayatView.vue](../../frontend/src/views/RiwayatView.vue):
`total_siswa`, `hadir`, `terlambat`, `izin`, `sakit`, `tidak_hadir`. Tambahan `alfa` buat kalau
mau bikin kartu terpisah.

Kartu "Izin / Sakit" di [baris 518](../../frontend/src/views/RiwayatView.vue#L518) jumblahin
`summary.izin + summary.sakit` client-side — itu tetap jalan, gak perlu diubah.

Label "Tanpa keterangan" di kartu Tidak Hadir
([baris 562](../../frontend/src/views/RiwayatView.vue#L562)) **sudah gak akurat** — sekarang
"Tidak Hadir" hampir selalu punya keterangan (Izin/Sakit/Alfa) dan itulah isi kartunya.

### 4.3 ✅ Dashboard sekarang kirim `alfa` + `alpha` + hitungan tidak hadir

`GET /api/dashboard/ringkasan` nambah beberapa field:

```json
{
  "tanggal": "2026-10-13",
  "total_siswa": 301,
  "hadir": 120, "terlambat": 14, "izin": 8, "sakit": 5, "alfa": 11,
  "alpha": 11,
  "tidak_hadir": 16,
  "total_tidak_hadir": 24,
  "sudah_absen": 134,
  "belum_absen": 143,
  "persentase_hadir": 39.9,
  "persentase_tidak_hadir": 8.0
}
```

Jadi kartu "Alpha" di [DashboardView.vue:264](../../frontend/src/views/DashboardView.vue#L264)
sekarang nampilin angka beneran, bukan 0 terus.

Arti tiap field — bedanya halus tapi penting:

| Field | Isi |
|---|---|
| `alfa` / `alpha` | yang **keterangannya** Alfa |
| `izin`, `sakit` | yang keterangannya Izin / Sakit (termasuk status lama) |
| `tidak_hadir` | **status** `Tidak Hadir` (semua keterangan digabung) — sama kayak `ringkasan.tidak_hadir` di Riwayat |
| `total_tidak_hadir` | `izin + sakit + alfa` |
| `sudah_absen` | `hadir + terlambat` |
| `belum_absen` | `total_siswa − sudah_absen − total_tidak_hadir` |

Hitungannya konsisten: `sudah_absen + total_tidak_hadir + belum_absen === total_siswa`.
Jadi bisa bikin kartu "Belum Absen" = siswa yang belum kena apa-apa hari ini.

Sekalian: `izin` dan `sakit` di dashboard sekarang ngegabungin status lama (`Izin`/`Sakit`)
**dan** bentuk baru (`Tidak Hadir` + keterangan), biar data lama tetap kehitung.

### 4.4 ✅ `GET /api/absensi` nambah filter `keterangan` & `search`

Dua query param baru:

| Param | Fungsi |
|---|---|
| `keterangan` | `Izin` / `Sakit` / `Alfa` — buat misahin yang berstatus "Tidak Hadir" |
| `search` | Cari **nama** atau **NISN**, case-insensitive, bisa sebagian |

```javascript
// cuma yang alfa
api.get('/api/absensi?status=Tidak%20Hadir&keterangan=Alfa')

// cari nama
api.get('/api/absensi?search=annasya')
```

> **Catatan penting:** RiwayatView sekarang udah ngeg-*kirim* `params.search`
> ([baris 1101–1103](../../frontend/src/views/RiwayatView.vue#L1101)) — minimal 3 huruf —
> tapi backend **dulu diam-diam ngabaikan** param itu, jadi search-nya gak ngefek sementara
> user ngira udah jalan. Sekarang udah beneran nyari. Coba tes: ketik nama siswa di kotak
> search Riwayat, hasilnya harus nyempit.

Filter `search` bisa digabung sama `kelas`/`status`/tanggal — semuanya dipakai bareng,
bukan saling nimpa.

### 4.5 Edit absensi: masih nunggu keputusan

Backend udah punya `PUT /api/absensi/:id` (Admin & Guru). Kasus utamanya: **alfa otomatis
diubah jadi izin** setelah siswa bawa surat.

Format body & response ada di [API_DOCUMENTATION.md](API_DOCUMENTATION.md) bagian 4.6.

**Pertanyaan buat frontend:** edit-nya di mana enaknya?

- Tombol di Riwayat (sebaris sama Hapus) — cuma bisa edit, gak bisa ubah jam
- Atau halaman detail absensi terpisah

Backend cuma nerima `status` + `keterangan`; `waktu_absen` & `metode` gak bisa diubah.

### 4.6 ✅ WA otomatis/manual sekarang bisa diganti dari UI

Dulu mode WA cuma bisa diubah lewat env (`WA_KIRIM_OTOMATIS`) yang butuh redeploy.
Sekarang tersimpan di **database per sekolah**, jadi admin bisa nge-toggle sendiri.

| Status | WA otomatis | WA manual |
|---|---|---|
| `Hadir` | ✅ kalau mode = otomatis | ✅ |
| `Terlambat` | ✅ kalau mode = otomatis | ✅ |
| `Tidak Hadir` (Izin/Sakit/Alfa) | ❌ sengaja gak otomatis | ✅ |

**Baca setting:**

```
GET /api/notifikasi/setting
```

```json
{
  "success": true,
  "data": {
    "wa_otomatis": true,
    "pilihan": { "otomatis": true, "manual": false },
    "dari_env": false
  }
}
```

`dari_env: true` artinya admin belum pernah nge-set dari UI, jadi yang dipakai masih
nilai awal dari env. Cocok buat nampilin badge "belum diatur".

**Ubah setting** (Admin & Kepala Sekolah):

```
PUT /api/notifikasi/setting
```

```json
{ "wa_otomatis": false }
```

atau versi yang lebih enak dibaca dari toggle UI:

```json
{ "mode": "manual" }
```

`mode` isinya `"otomatis"` atau `"manual"`. Response balikannya sama kayak GET.
Kalau body-nya kosong / nilainya ngawur → **400 VALIDATION_ERROR**. Harus salah satu,
jangan kirim dua-duanya.

**Saran UI:** toggle di halaman Pengaturan —
*"Kirim WA otomatis setelah absen"* → on = `otomatis`, off = `manual`.
Kalau `dari_env` masih `true`, tampilkan nilainya sebagai default dan kasih catatan
kecil bahwa admin belum pernah ngubah.

**Log WA** ada di `GET /api/notifikasi/log` (50 terakhir) kalau mau bikin halaman riwayat
pengiriman. ⚠️ `FONNTE_TOKEN` **belum diset di Vercel**, jadi semua pengiriman balas
`{ status: "gagal" }` (dan tetap tercatat di log). Selama token belum diisi, tombol
"Kirim WA" bakal selalu balas gagal — bukan bug, cuma belum dikonfigurasi.

---

## 5. Checklist Test Manual

Sebelum nganggep dua sisi udah klop, cek ini:

- [ ] **Scan jam 05:00 WIB** → ditolak 400, pesan nyebut "sebelum jam absen dibuka"
- [ ] **Scan jam 06:30 WIB** → sukses, status `Hadir`
- [ ] **Scan jam 07:30 WIB** → sukses, status `Terlambat`
- [ ] **Scan jam 08:00 WIB** → ditolak 400, pesan nyebut "sudah lewat jam absen"
- [ ] **Scan jam 10:00 WIB** → ditolak 400 (jam absen udah tutup jam 8)
- [ ] **Scan siswa yang sama 2x** → yang kedua 409 "sudah absen pukul HH:MM WIB"
- [ ] **Scan siswa yang udah kena alfa otomatis** (jam 07:30) → sukses jadi `Terlambat` + `diubah_dari_alfa`
- [ ] **Manual `Izin`** (cara lama) → tetap berhasil
- [ ] **Manual `Tidak Hadir` tanpa keterangan** → 400
- [ ] **Manual `Tidak Hadir` + keterangan `Alfa`** → berhasil
- [ ] **Jam di Riwayat** = jam WIB yang sama dengan jam scan beneran
- [ ] **Hapus absensi** (Admin) → berhasil, baris hilang
- [ ] **Riwayat nampilin keterangan** → baris Izin / Sakit / Alfa bisa dibedain
- [ ] **Kartu ringkasan Riwayat** muncul (dulu gak pernah render)
- [ ] **Kotak search Riwayat** beneran nyempit hasilnya
- [ ] **Kartu "Alpha" di Dashboard** nampilin angka, bukan 0
- [ ] **Filter `keterangan=Alfa`** → cuma nampilin yang alfa
- [ ] **PUT `/api/notifikasi/setting`** `{"mode":"manual"}` → scan berikutnya gak kirim WA otomatis

---

## 6. Yang Sudah Dites di Backend

Dites langsung ke DB produksi (data uji dibikin, terus dihapus lagi):

| Yang dites | Hasil |
|---|---|
| `GET /api/absensi` punya key `ringkasan` + row `keterangan`/`metode` | ✅ |
| Ringkasan kehitung bener: 4 data uji (1 alfa, 1 izin baru, 1 sakit baru, 1 izin lama) → izin=2, sakit=1, alfa=1, tidak_hadir=3 | ✅ |
| Filter `keterangan=Alfa` → cuma baris alfa | ✅ |
| `search` + `kelas` digabung → gak saling nimpa | ✅ |
| `GET /api/absensi/hari-ini` punya `keterangan`/`metode` | ✅ |
| Dashboard: 1 alfa + 1 izin → `alfa:1`, `alpha:1`, `izin` naik | ✅ |
| Scan di luar jam (jam 23:50 WIB) → 400 `OUTSIDE_ABSEN_HOURS` | ✅ |
| Scan menimpa alfa otomatis → jadi `Terlambat`, `diubah_dari_alfa: true` | ✅ |
| 409 tetap muncul kalau catatannya manual/scan | ✅ |
| DB balik ke kondisi awal (15 baris absensi, 4 log) | ✅ |

---

## 7. Ringkasan Aksi

| Siapa | Ngapain |
|---|---|
| **Frontend** | Fix 4 hal P0 (error code, opsi status manual, keterangan, timezone) + pakai field baru (`keterangan`, `ringkasan`, `alfa`) |
| **Backend** | ✅ Selesai: kirim `keterangan` + `metode`, `ringkasan`, `alfa`/`alpha`, filter `keterangan` & `search` |
| **Operator (kamu)** | Set `CRON_SECRET` + `FONNTE_TOKEN` di Vercel biar alfa & WA beneran jalan |
