const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Buat sekolah
  const sekolah = await prisma.sekolah.upsert({
    where: { npsn: "20208854" },
    update: {},
    create: {
      npsn: "20208854",
      nama: "SDN 2 Garumukti",
      alamat_jalan: "Kp. Cileuleuy",
      rt: "5",
      rw: "5",
      desa_kelurahan: "Garumukti",
      kecamatan: "Kec. Pamulihan",
      kabupaten_kota: "Kab. Garut",
      provinsi: "Prov. Jawa Barat",
      kode_pos: "44168",
      nomor_telepon: "081323696747",
      email: "sdn2garumukti@gmail.com",
      bentuk_pendidikan_id_str: "SD",
      status_sekolah_str: "Negeri",
    },
  });

  console.log(`✅ Sekolah: ${sekolah.nama}`);

  // Buat user admin
  const password = await bcrypt.hash("admin123", 12);
  const admin = await prisma.users.upsert({
    where: { username: "admin@sekolah.sch.id" },
    update: {},
    create: {
      sekolah_id: sekolah.sekolah_id,
      username: "admin@sekolah.sch.id",
      password_hash: password,
      nama: "Admin SDN 2 Garumukti",
      peran_id_str: "Admin",
    },
  });

  console.log(`✅ Admin: ${admin.username} / admin123`);

  // Buat user guru
  const passGuru = await bcrypt.hash("guru123", 12);
  const guru = await prisma.users.upsert({
    where: { username: "guru@sekolah.sch.id" },
    update: {},
    create: {
      sekolah_id: sekolah.sekolah_id,
      username: "guru@sekolah.sch.id",
      password_hash: passGuru,
      nama: "Guru SDN 2 Garumukti",
      peran_id_str: "Guru",
      nama_rombel: "KELAS 3A",
    },
  });

  console.log(`✅ Guru: ${guru.username} / guru123`);

  console.log("🎉 Seeding selesai!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding gagal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());