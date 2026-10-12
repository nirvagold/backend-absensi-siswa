# Sinkronisasi Backend ↔ Frontend

Dokumen ini buat tim frontend. Isinya: **apa yang berubah di backend**, **endpoint barunya**,
dan **apa yang perlu disesuaikan di frontend** biar dua-duanya klop.

Terakhir diperbarui: 2026-10-13 (setelah commit `c99f705` + `9dad209`, ditambah
field baru backend: `keterangan`, `metode`, `ringkasan`, `alfa`/`alpha`, filter `keterangan` & `search`).

Base URL tetap sama: `https://backend-absensi-siswa-mu.vercel.app`

---

## 1. Ringkasan Perubahan

| # | Perubahan | Dampak ke frontend |
|---|-----------|-------------------|
| 1 | **Scan di luar jam sekolah ditolak** (400) | 🔴 **Wajib** — ScannerView harus nangkep error code baru |
| 2 | **Status scan otomatis** Hadir/Terlambat dari jam | 🟢 Aman — ScannerView udah baca `rows.status` |
| 3 | **Alfa otomatis** jam 09:00 WIB | ✅ **Beres** — dashboard `alfa`/`alpha` udah dikirim |
| 4 | **"Tidak Hadir" wajib keterangan** Izin/Sakit/Alfa | 🔴 **Wajib** — ManualAbsensiView sekarang bakal ditolak 400 |
| 5 | **Edit absensi** `PUT /api/absensi/:id` | 🟢 Endpoint baru, belum ada UI-nya |
| 6 | **WA otomatis/manual** | 🟢 Endpoint baru, belum ada UI-nya |
| 7 | **Zona waktu WIB** di semua hari/jam | 🟡 Perlu — format jam di frontend belum set timezone |
| 8 | **`GET /api/absensi` nambah `keterangan`, `metode`, `ringkasan`** | ✅ **Beres** — tinggal dipakai di UI |
| 9 | **Filter baru** `keterangan` + `search` | ✅ **Beres** — search Riwayat yang dulu gak jalan, sekarang jalan |

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

### 4.1 ✅ `GET /api/absensi` sekarang kirim `keterangan` + `metode`

Row `GET /api/absensi` dan `GET /api/absensi/hari-ini` sekarang punya 2 field tambahan:

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
  "keterangan": "Alfa",
  "metode": "sistem"
}
```

`keterangan` isinya `Izin`/`Sakit`/`Alfa` kalau statusnya `Tidak Hadir`, selain itu `null`.
`metode` isinya `scan` / `manual` / `sistem`.

**Yang perlu di frontend:** RiwayatView sekarang bisa nampilin keterangan biar Izin, Sakit,
dan Alfa gak kelihatan sama. Ikon "QR" di kolom metode
([baris 858](../../frontend/src/views/RiwayatView.vue#L858) ngecek `row.metode === 'QR'`)
masih gak match — nilainya sekarang `scan`/`manual`/`sistem`, bukan `QR`.

Saran tampilan kolom Status:

```js
// ganti {{ row.status }} jadi:
row.status === 'Tidak Hadir' && row.keterangan
  ? `Tidak Hadir — ${row.keterangan}`
  : row.status
```

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

### 4.3 ✅ Dashboard sekarang kirim `alfa` + `alpha`

`GET /api/dashboard/ringkasan` nambah 2 field (isinya sama, alias dobel):

```json
"alfa": 7, "alpha": 7
```

Jadi kartu "Alpha" di [DashboardView.vue:264](../../frontend/src/views/DashboardView.vue#L264)
sekarang nampilin angka beneran, bukan 0 terus.

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

### 4.6 Rencana WA otomatis

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
- [ ] **Riwayat nampilin keterangan** → baris Izin / Sakit / Alfa bisa dibedain
- [ ] **Kartu ringkasan Riwayat** muncul (dulu gak pernah render)
- [ ] **Kotak search Riwayat** beneran nyempit hasilnya
- [ ] **Kartu "Alpha" di Dashboard** nampilin angka, bukan 0
- [ ] **Filter `keterangan=Alfa`** → cuma nampilin yang alfa

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
