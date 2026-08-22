# Tutorial: Pasang Project Tracking dari Nol (Repository Baru)

Tutorial ini untuk bikin **repository GitHub baru**, lalu website-nya online
gratis lewat **Render** (hosting) + **Neon** (database). Ikuti urutannya dari
atas ke bawah — total waktu sekitar 20-30 menit kalau belum punya akun sama
sekali.

Bahan yang dibutuhkan: file `proyektrack-app.zip` yang sudah saya kirim di
chat sebelumnya (extract dulu di komputer kamu sebelum mulai).

---

## Bagian 1 — Buat Repository GitHub Baru

1. Buka [github.com](https://github.com) → login (atau daftar akun baru
   kalau belum punya, gratis).
2. Klik tombol **+** di pojok kanan atas → **New repository**.
3. Isi:
   - **Repository name**: bebas, misalnya `proyektrack-rote-bpa-v2`
   - **Visibility**: pilih **Private** (supaya kode & data contoh tidak
     kelihatan publik) — atau Public juga boleh kalau tidak masalah.
   - JANGAN centang "Add a README file" (biar folder kosong dulu).
4. Klik **Create repository**.
5. Di halaman repo yang baru dibuat, klik **"uploading an existing file"**
   (link di tengah halaman).
6. Buka folder `proyektrack-app` hasil extract zip di komputer kamu — **drag
   & drop SEMUA isinya** (bukan foldernya, tapi isinya) ke halaman upload
   GitHub itu: file `server.js`, `db.js`, `package.json`, `package-lock.json`,
   `.gitignore`, `.env.example`, `README.md`, dan folder `public/` (lengkap
   dengan isinya — `index.html`, `app.js`, `assets/`, `vendor/`).
7. Tunggu semua file selesai ter-upload (progress bar di tiap file), lalu
   scroll ke bawah, klik **Commit changes**.

Repo GitHub kamu sekarang sudah berisi kode website ini.

> Catatan: JANGAN upload folder `node_modules` (memang tidak ada di dalam
> zip) — itu akan otomatis dibuatkan oleh Render saat build.

---

## Bagian 2 — Buat Database Gratis di Neon

1. Buka [neon.tech](https://neon.tech) → **Sign up** (bisa langsung pakai
   akun GitHub kamu, lebih cepat).
2. Setelah masuk dashboard, klik **Create a project** (atau otomatis
   diarahkan ke situ kalau ini project pertama).
3. Isi nama project bebas (misalnya `proyektrack-rote`), region pilih yang
   paling dekat (Singapore kalau ada), klik **Create project**.
4. Setelah project dibuat, cari bagian **Connection string** di dashboard
   (biasanya langsung tampil di halaman awal project, atau di menu
   **Connection Details**). Bentuknya seperti:
   ```
   postgresql://namauser:password@ep-xxxx-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
5. **Salin (copy) seluruh connection string itu** — akan dipakai di langkah
   berikutnya. Simpan sementara di notepad/catatan.

---

## Bagian 3 — Buat Web Service di Render

1. Buka [render.com](https://render.com) → **Get Started** / **Sign Up** —
   pilih **Sign up with GitHub** supaya langsung terhubung ke akun GitHub
   kamu.
2. Setelah masuk dashboard Render, klik **New +** (kanan atas) → **Web
   Service**.
3. Kalau diminta hubungkan GitHub, klik **Connect account** / **Configure
   account**, izinkan Render mengakses repository kamu (pilih repo
   `proyektrack-rote-bpa-v2` yang tadi dibuat, atau izinkan akses ke semua
   repo).
4. Pilih repository `proyektrack-rote-bpa-v2` dari daftar → klik **Connect**.
5. Di halaman setting Web Service, isi:
   - **Name**: bebas, ini akan jadi bagian dari URL website (misalnya
     `proyektrack-rote-bpa2` → nanti alamatnya
     `https://proyektrack-rote-bpa2.onrender.com`)
   - **Region**: pilih yang paling dekat (Singapore kalau ada)
   - **Branch**: `main` (biasanya sudah otomatis terisi)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: pilih **Free**
6. Scroll ke bagian **Environment Variables**, klik **Add Environment
   Variable**, tambahkan dua variabel ini:

   | Key            | Value                                                        |
   |----------------|---------------------------------------------------------------|
   | `DATABASE_URL` | connection string dari Neon yang disalin di Bagian 2          |
   | `JWT_SECRET`   | string acak & rahasia, bebas ketik apa saja yang panjang (mis. `rote-bpa-2026-xK9mQpL3vN7wZ2yT8jR5`) — jangan dikasih tahu orang lain |

7. Klik **Create Web Service** di paling bawah.

Render akan mulai build otomatis (proses `npm install` lalu `npm start`) —
bisa dipantau lewat tab **Logs** di halaman service tersebut. Prosesnya
biasanya 2-5 menit. Kalau berhasil, di log akan muncul tulisan:
```
Seeded demo data: 1 proyek, akun pengelola demo, & password dokumen awal.
Project Tracking berjalan di http://localhost:....
```

---

## Bagian 4 — Buka & Coba Website

1. Setelah status di dashboard Render berubah jadi **Live** (lingkaran
   hijau), klik URL yang tertera di bagian atas halaman (format
   `https://nama-service-kamu.onrender.com`).
2. Website akan terbuka — coba klik-klik menu, pastikan data contoh muncul
   (1 proyek dengan data produksi, BBM, dll).
3. Coba login Pengelola (tombol 🔒 kanan atas) pakai salah satu akun demo:
   - `pemilik` / `pemilik123` (akses semua menu)
   - `bbm` / `bbm123` (akses menu BBM saja)
   - `alat` / `alat123` (akses menu Alat saja)
4. Coba tambah satu data (misalnya laporan produksi), lalu refresh halaman —
   pastikan datanya tidak hilang (berarti tersambung ke database dengan
   benar).

---

## Bagian 5 — WAJIB: Ganti Password Demo

Password di atas ( `pemilik123`, `bbm123`, `alat123`, dan password folder
Dokumen `Adminrote1`) cuma untuk demo/testing — **harus diganti** sebelum
dipakai sungguhan supaya orang lain tidak bisa login pakai password yang
sudah tertulis di chat ini.

1. Di komputer kamu (folder hasil extract zip tadi), jalankan (butuh
   [Node.js](https://nodejs.org) terpasang):
   ```bash
   npm install
   node -e "console.log(require('bcryptjs').hashSync('PASSWORD_BARU_KAMU', 10))"
   ```
   Ganti `PASSWORD_BARU_KAMU` dengan password baru pilihanmu. Perintah ini
   akan mencetak sederet teks acak (contoh:
   `$2a$10$N9qo8uLOickgx2ZMRZoMye...`) — itu adalah hash password barunya.
2. Buka dashboard Neon → project kamu → menu **SQL Editor**.
3. Untuk ganti password salah satu akun Pengelola, jalankan (ganti `<hash>`
   dengan hasil langkah 1, dan `<username>` dengan `pemilik`/`bbm`/`alat`):
   ```sql
   UPDATE accounts SET password_hash = '<hash>' WHERE username = '<username>';
   ```
   Ulangi untuk ketiga akun dengan password baru yang berbeda-beda.
4. Untuk ganti password folder Dokumen:
   ```sql
   UPDATE site_settings SET value = '<hash>' WHERE key = 'document_password_hash';
   ```
5. Password baru langsung aktif — tidak perlu restart/deploy ulang.

---

## Catatan Penting

- **Render tier gratis "tidur"** kalau 15 menit tidak ada yang akses —
  kunjungan pertama setelahnya akan lambat (30-60 detik) sebelum server
  menyala lagi. Ini bawaan hosting gratis, bukan masalah di kode.
- **Neon tier gratis** kapasitasnya 0.5GB — cukup untuk data teks dalam
  jumlah besar, tapi kalau upload banyak dokumen/foto berukuran besar bisa
  penuh lebih cepat. Bisa dicek sisa kapasitasnya di dashboard Neon.
- Kalau nanti mau pindah dari `proyektrack-rote-bpa.onrender.com` (yang
  lama) ke alamat baru ini sepenuhnya, tinggal bagikan URL baru ke tim kamu
  — atau kalau mau, repo yang lama bisa dihapus/diarsipkan.
- Kalau ada langkah yang error atau bingung di tengah jalan, kirim
  screenshot error-nya, saya bantu cek.
