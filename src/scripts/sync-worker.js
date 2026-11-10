// ── Worker sync Dapodik (dipanggil Vercel Cron) ──
//
// Masalah yang diselesaikan: sync 301 siswa butuh ±160 detik, padahal Vercel
// (plan Hobby) membunuh function di detik ke-10 (maxDuration: 10). Akibatnya
// sync dari frontend selalu 500 dan sync_log tertinggal berstatus "berjalan".
//
// Arsitekturnya sekarang:
//   1. POST /api/sync/dapodik  -> HANYA membuat sync_log "berjalan" berisi
//      param_json (npsn, url, token, tipe, filter), lalu langsung return.
//      Di bawah 1 detik, tidak mungkin kena timeout.
//   2. Cron tiap 1 menit (vercel.json) memanggil endpoint ini: mengangkat
//      SATU sync_log berstatus "berjalan" berumur >= 20 detik, memproses
//      SATU kelas dari daftar antrian, simpan progres, selesai.
//      Tiap invokasi <= 10 detik.
//   3. Frontend polling GET /status/:id yang sudah ada -- progres naik
//      bertahap per kelas, tanpa perubahan apa pun di frontend.
//
// Kunci anti dobel-jalan: updateMany bersyarat (status harus masih
// "menunggu"/"berjalan" DAN tahap sesuai ekspektasi). Kalau dua invokasi cron
// nyaris bersamaan, hanya satu yang berhasil mengklaim.

const prisma = require("../config/prisma");
const axios = require("axios");
const bcrypt = require("bcryptjs");

// Umur minimum job sebelum diangkat worker. Mencegah worker mengangkat job
// yang baru saja dibuat POST (respons POST-nya belum sampai ke klien) --
// klien berhak melihat status "menunggu" sekali dulu.
const UMUR_MINIMUM_MS = 20 * 1000;

// Umur maksimum job dianggap mati (mis. function di-kill di tengah jalan).
// Job "berjalan" lebih tua dari ini dianggap gagal, biar tidak zombi selamanya.
const UMUR_ZOMBI_MS = 15 * 60 * 1000;

async function panggilDapodik(baseUrl, endpoint, params, token) {
  const resp = await axios.get(`${baseUrl}/WebService/${endpoint}`, {
    params,
    headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "true" },
    timeout: 8000,
  });
  if (!resp.data.rows) throw new Error("Format response Dapodik tidak valid");
  return resp.data.rows;
}

// Proses SATU baris peserta didik. Return "baru" | "update" | null.
async function prosesSatuSiswa(row, sekolahId, syncId) {
  // NISN wajib & unik di DB, tapi Dapodik kadang mengirim null
  // (mis. siswa baru yang NISN-nya belum terbit).
  // Dipakai NIPD dulu, baru ID Dapodik, biar siswanya tetap masuk.
  const nisn = row.nisn ? String(row.nisn).trim()
    : String(row.nipd || "").trim() || `DAPODIK-${row.peserta_didik_id}`;

  const data = {
    sekolah_id: sekolahId,
    nisn,
    nipd: row.nipd || null,
    nama: row.nama,
    jenis_kelamin: row.jenis_kelamin,
    nama_rombel: row.nama_rombel || null,
    tingkat_pendidikan_id: row.tingkat_pendidikan_id || null,
    nomor_telepon_seluler: row.nomor_telepon_seluler || null,
    sync_id: syncId,
  };

  const ada = await prisma.siswa.findUnique({ where: { peserta_didik_id: row.peserta_didik_id } });
  if (ada) {
    await prisma.siswa.update({ where: { peserta_didik_id: row.peserta_didik_id }, data });
    return "update";
  }
  await prisma.siswa.create({ data: { peserta_didik_id: row.peserta_didik_id, ...data } });
  return "baru";
}

// Proses satu kelas: saring baris siswa milik kelas itu lalu upsert satu-satu.
async function prosesKelas(rows, kelas, sekolahId, syncId) {
  const barisKelas = rows.filter((r) => String(r.nama_rombel || "").trim().toUpperCase() === kelas);
  let baru = 0, update = 0, gagal = 0;
  const daftarGagal = [];

  for (const row of barisKelas) {
    try {
      const hasil = await prosesSatuSiswa(row, sekolahId, syncId);
      if (hasil === "baru") baru++;
      else if (hasil === "update") update++;
    } catch (err) {
      gagal++;
      if (daftarGagal.length < 20) {
        daftarGagal.push({
          peserta_didik_id: row.peserta_didik_id,
          nama: row.nama || null,
          nisn: row.nisn || null,
          alasan: String(err.message || err).split("\n").map((s) => s.trim()).filter(Boolean).pop()?.slice(0, 200) || "tidak diketahui",
        });
      }
    }
  }

  return { barisKelas: barisKelas.length, baru, update, gagal, daftarGagal };
}

// Tambah hitungan progres ke sync_log (read-modify-write sederhana; dua cron
// tidak pernah memproses job yang sama berkat kunci klaim di langkahUtama).
async function tambahProgres(syncId, { total = 0, baru = 0, update = 0, gagal = 0, daftarGagal = null } = {}) {
  const log = await prisma.sync_log.findUnique({ where: { sync_id: syncId } });
  if (!log) return;
  let logError = log.log_error;
  if (daftarGagal && daftarGagal.length) {
    const lama = (() => { try { return JSON.parse(log.log_error || "[]"); } catch { return []; } })();
    logError = JSON.stringify([...lama, ...daftarGagal].slice(0, 20));
  }
  await prisma.sync_log.update({
    where: { sync_id: syncId },
    data: {
      total_data: log.total_data + total,
      data_baru: log.data_baru + baru,
      data_diperbarui: log.data_diperbarui + update,
      data_gagal: log.data_gagal + gagal,
      log_error: logError,
    },
  });
}

// ── Satu langkah worker: klaim & proses satu kelas ──
// Return ringkasan buat respons endpoint cron.
async function langkahUtama() {
  // 0. Tandai zombi: "berjalan" yang terlalu tua tanpa progres waktu selesai.
  const batasZombi = new Date(Date.now() - UMUR_ZOMBI_MS);
  await prisma.sync_log.updateMany({
    where: { status: "berjalan", waktu_mulai: { lt: batasZombi } },
    data: { status: "gagal", log_error: "Dihentikan otomatis: melebihi batas waktu worker." },
  });

  // 1. Klaim satu job. Syarat: status "berjalan" DAN masih di tahap awal
  //    ("menunggu" = belum ada yang proses, atau "tarik_siswa" = lanjutan).
  const kandidat = await prisma.sync_log.findFirst({
    where: {
      status: "berjalan",
      tahap: { in: ["menunggu", "tarik_siswa"] },
      waktu_mulai: { lte: new Date(Date.now() - UMUR_MINIMUM_MS) },
    },
    orderBy: { waktu_mulai: "asc" },
  });
  if (!kandidat) return { kerja: false, alasan: "tidak ada job yang menunggu" };

  const param = (() => {
    try { return JSON.parse(kandidat.param_json || "{}"); }
    catch { return {}; }
  })();
  if (!param.baseUrl || !param.token || !param.npsn) {
    await prisma.sync_log.update({
      where: { sync_id: kandidat.sync_id },
      data: { status: "gagal", log_error: "Parameter Dapodik hilang dari job." },
    });
    return { kerja: true, sync_id: kandidat.sync_id, hasil: "gagal: parameter tidak lengkap" };
  }

  // 2. Klaim atomik: tukar "menunggu" -> "tarik_siswa" dengan updateMany
  //    bersyarat. Kalau count = 0, job baru saja diklaim invokasi lain.
  let klaim;
  if (kandidat.tahap === "menunggu") {
    klaim = await prisma.sync_log.updateMany({
      where: { sync_id: kandidat.sync_id, tahap: "menunggu" },
      data: { tahap: "tarik_siswa" },
    });
    if (klaim.count === 0) return { kerja: false, alasan: "job diklaim invokasi lain" };
  }

  // 3. Tarik SEMUA siswa sekali (satu GET, cepat), lalu simpan daftar kelas
  //    yang harus diproses di kelas_proses (string), tapi PROSES satu kelas
  //    saja per invokasi. Urutan antrian disimpan di kolom kelas_proses:
  //    isi = daftar kelas yang BELUM diproses, kelas pertama = yang dikerjakan.
  const semua = await panggilDapodik(param.baseUrl, "getPesertaDidik", { npsn: param.npsn }, param.token);

  // Susun antrian kelas dari filter (kalau ada) atau dari data Dapodik.
  const petaKelas = new Map();
  for (const r of semua) {
    const k = String(r.nama_rombel || "").trim();
    if (!k) continue;
    petaKelas.set(k.toUpperCase(), k); // simpan ejaan asli Dapodik
  }
  let antrian;
  if (param.filterKelas && param.filterKelas.length) {
    antrian = param.filterKelas.filter((k) => petaKelas.has(k));
  } else {
    antrian = [...petaKelas.keys()].sort();
  }

  const logNow = await prisma.sync_log.findUnique({ where: { sync_id: kandidat.sync_id } });
  const sisaSebelumnya = logNow.kelas_proses ? logNow.kelas_proses.split("||").filter(Boolean) : null;
  const antrianEfektif = sisaSebelumnya || antrian;

  if (!antrianEfektif.length) {
    // Tidak ada kelas -- langsung selesai (mungkin filter salah semua).
    await prisma.sync_log.update({
      where: { sync_id: kandidat.sync_id },
      data: { status: "berhasil", tahap: "selesai", waktu_selesai: new Date() },
    });
    return { kerja: true, sync_id: kandidat.sync_id, hasil: "selesai (tidak ada kelas)" };
  }

  // 4. Proses kelas berikutnya BERULANG sampai selesai atau waktu hampir habis.
  //    Vercel Hobby: maxDuration 60s (vercel.json) & cron hanya boleh harian,
  //    jadi SATU invokasi harus sanggup menyelesaikan seluruh sync. Budget
  //    50s disisakan 10s untuk pengguna+rombel+respons.
  const MULAI = Date.now();
  const BUDGET_MS = 50 * 1000;
  const catatan = [];
  let sisa = antrianEfektif;

  while (sisa.length > 0 && Date.now() - MULAI < BUDGET_MS) {
    const kelasIni = sisa[0];
    const hasil = await prosesKelas(semua, kelasIni, kandidat.sekolah_id, kandidat.sync_id);
    await tambahProgres(kandidat.sync_id, {
      total: hasil.barisKelas, baru: hasil.baru, update: hasil.update,
      gagal: hasil.gagal, daftarGagal: hasil.daftarGagal,
    });
    catatan.push(`kelas ${kelasIni}: +${hasil.baru} baru, ${hasil.update} update, ${hasil.gagal} gagal`);
    sisa = sisa.slice(1);

    if (sisa.length > 0) {
      // Simpan sisa antrian SETIAP kelas -- kalau function tetap di-kill
      // (mis. cold start makan waktu), job tidak bolong dari awal lagi.
      await prisma.sync_log.update({
        where: { sync_id: kandidat.sync_id },
        data: { kelas_proses: sisa.join("||") },
      });
    }
  }

  // 5. Masih ada sisa dan waktu habis -> serahkan ke invokasi berikutnya.
  //    (Pada praktiknya dengan 301 siswa / 12 kelas, satu invokasi 60s cukup.)
  if (sisa.length > 0) {
    return {
      kerja: true, sync_id: kandidat.sync_id,
      hasil: catatan.join("; ") + `; WAKTU HABIS, sisa ${sisa.length} kelas (cron berikutnya lanjut)`,
    };
  }

  // Semua kelas selesai. Lanjut pengguna & rombel kalau tipenya "all".
  if (param.tipe === "pengguna" || param.tipe === "all") {
    const users = await panggilDapodik(param.baseUrl, "getPengguna", { npsn: param.npsn }, param.token);
    const hash = await bcrypt.hash("dapodik123", 12);
    let baruU = 0, gagalU = 0;
    for (const row of users) {
      try {
        const peran = row.peran_id_str;
        if (!["PTK", "Wali Kelas", "Kepala Sekolah"].includes(peran)) continue;
        const role = peran === "Kepala Sekolah" ? "Kepala Sekolah" : "Guru";
        const ada = await prisma.users.findUnique({ where: { username: row.username } });
        if (!ada) {
          await prisma.users.create({
            data: {
              sekolah_id: kandidat.sekolah_id,
              username: row.username,
              password_hash: hash,
              nama: row.nama,
              peran_id_str: role,
              ptk_id: row.ptk_id || null,
            },
          });
          baruU++;
        }
      } catch { gagalU++; }
    }
    catatan.push(`; pengguna +${baruU} baru, ${gagalU} gagal`);
  }

  if (param.tipe === "rombongan_belajar" || param.tipe === "all") {
    const rombelRows = await panggilDapodik(param.baseUrl, "getRombonganBelajar", { npsn: param.npsn }, param.token);
    let cocok = 0, gagalR = 0;
    for (const row of rombelRows) {
      try {
        if (!row.ptk_id || !row.nama) continue;
        const user = await prisma.users.findFirst({ where: { ptk_id: row.ptk_id } });
        if (user && user.peran_id_str === "Guru") {
          const kelasSekarang = user.nama_rombel || "";
          const kelasList = kelasSekarang.split(", ").filter(Boolean);
          if (!kelasList.includes(row.nama)) kelasList.push(row.nama);
          await prisma.users.update({
            where: { pengguna_id: user.pengguna_id },
            data: { nama_rombel: kelasList.join(", ") },
          });
          cocok++;
        }
      } catch { gagalR++; }
    }
    catatan.push(`; rombel ${cocok} cocok, ${gagalR} gagal`);
  }

  await prisma.sync_log.update({
    where: { sync_id: kandidat.sync_id },
    data: { status: "berhasil", tahap: "selesai", kelas_proses: null, waktu_selesai: new Date() },
  });

  return { kerja: true, sync_id: kandidat.sync_id, hasil: catatan.join("; ") + "; SELESAI" };
}

module.exports = { langkahUtama, UMUR_MINIMUM_MS, UMUR_ZOMBI_MS };
