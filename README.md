# Project Tracking — Proyek Pulau Rote K-SIGN Tahap 2 NK-BPA

Website monitoring pekerjaan tanah (earthwork) proyek konstruksi — Produksi
Harian per item kontrak (BOQ), Ritasi Dump Truck, BBM (masuk/keluar per
alat, upload rekap dari Excel, Saldo Awal BBM, + download rekap Excel),
Alat (tabulasi status per unit), Manpower (tabulasi per jabatan), Cuaca
(laporan manual + widget cuaca live per-jam via Open-Meteo), Dokumen (folder
Tagihan/DWG/BAOP berpassword + GeoPDF bebas, dan owner bisa bikin folder
baru sendiri langsung dari website), Isu Eksternal & Internal (catatan
isu/kendala yang sedang berjalan, dengan foto bukti JPG/PNG/JPEG/HEIC,
otomatis muncul jadi pemberitahuan di Beranda selama masih berstatus
"Berjalan"), foto proyek (lebih dari 1, bisa digeser), Realisasi Progres
terhadap kontrak (dengan grafik Kurva-S Rencana vs Realisasi — titik rencana
diisi manual atau upload dari Excel), dan Chat Internal. Menu disembunyikan
di balik tombol ☰ di kanan atas topbar. Tema gelap. Data tersimpan permanen
di database PostgreSQL — bisa dipakai lokal atau di-online-kan gratis lewat
Render (hosting) + Neon (database).

> **Update terbaru:** sebelumnya BBM cuma bisa diisi manual (belum bisa upload
> rekap dari Excel), Saldo Awal BBM belum ada, dan grafik Kurva-S (Rencana vs
> Realisasi progres) di menu Realisasi Progres S.d ini juga belum ada. Ketiga
> fitur ini sudah ditambahkan — lihat bagian "Ringkasan API" di bawah untuk
> endpoint barunya.

## Login Pengelola & hak akses

Website punya 3 jenis akun Pengelola (tombol 🔒 di kanan atas topbar), semua
divalidasi di server (password di-hash, bukan disimpan polos):

| Username  | Password (demo — GANTI setelah live) | Akses                     |
|-----------|----------------------------------------|----------------------------|
| `pemilik` | `pemilik123`                           | Semua menu                 |
| `bbm`     | `bbm123`                                | Cuma menu BBM               |
| `alat`    | `alat123`                               | Cuma menu Alat               |

Orang yang **tidak login** (pengunjung) tetap bisa lihat semua menu & download
semua data (termasuk rekap Excel BBM dan dokumen di folder yang tidak
dipassword), tapi tidak bisa tambah/edit/hapus apa pun.

Folder Dokumen "Tagihan", "Gambar DWG", dan "BAOP" dilindungi password
terpisah (default: `Adminrote1`, lihat/ganti lewat tabel `site_settings` di
database — kolom `key = 'document_password_hash'`, isinya hash bcrypt).
Folder "GeoPDF (Peta)" sengaja tidak dipassword supaya gampang diakses di
lapangan. Tab "Chat Internal" (tombol 💬 pojok kanan bawah) memakai login
Pengelola yang sama — siapa pun yang login (akun mana pun) bisa baca semua
pesan masuk.

**PENTING — sebelum website ini benar-benar dipakai publik:** ganti ketiga
password demo di atas dan password folder Dokumen. Caranya lewat SQL
langsung ke database (lihat bagian "Ganti password" di bawah), karena belum
ada halaman UI untuk itu.

## Menjalankan di komputer sendiri

Butuh [Node.js](https://nodejs.org) versi 18 ke atas, dan sebuah database
PostgreSQL (bisa Postgres lokal, atau gratis lewat [Neon](https://neon.tech)).

```bash
npm install
cp .env.example .env
# edit .env, isi DATABASE_URL (connection string Postgres) dan JWT_SECRET
# (string acak/rahasia — WAJIB diisi, jangan pakai contoh di .env.example)
npm start
```

Lalu buka **http://localhost:3000** di browser. Tabel, akun Pengelola demo,
dan data contoh (1 proyek) otomatis dibuat saat pertama kali server
dijalankan.

> Kalau kamu update dari versi sebelumnya (skema laporan harian alat/manpower
> yang lebih sederhana, tanpa kontrak/BOQ/Ritasi DT/login): server otomatis
> mendeteksi skema lama saat pertama kali jalan, menghapus tabel lama, lalu
> membuat skema baru + data contoh baru. Data lama akan hilang — ini
> disengaja karena konsepnya berubah cukup besar.

## Deploy online gratis (Render + Neon)

Ringkasan langkah:

1. **GitHub** — buat repository baru (atau update repository yang sudah ada),
   upload/replace semua file proyek ini.
2. **Neon** (database) — buat akun di [neon.tech](https://neon.tech), buat
   project baru, salin **connection string**-nya.
3. **Render** (hosting) — buat **Web Service** baru dari repository GitHub
   tadi:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variable `DATABASE_URL` = connection string dari Neon
   - Environment Variable `JWT_SECRET` = string acak & rahasia (mis. hasil
     `openssl rand -hex 32`) — **wajib diisi**, tanpa ini server tidak mau
     jalan (demi keamanan login).
4. Render akan build & jalankan otomatis. URL publik muncul di dashboard
   Render (formatnya `https://nama-app.onrender.com`).
5. Setelah live, segera ganti password akun Pengelola & password folder
   Dokumen dari nilai demo (lihat bagian "Ganti password" di bawah).

Catatan tier gratis:
- Render free web service "tidur" setelah 15 menit tidak diakses — request
  pertama setelah itu akan lambat (±30-60 detik) sebelum server menyala lagi.
- Neon free database tidak ada batas waktu/kedaluwarsa (0.5GB storage), tapi
  compute-nya scale-to-zero setelah 5 menit idle (otomatis menyala lagi saat
  diakses, data tidak hilang). Perhatikan kapasitas 0.5GB kalau banyak upload
  dokumen/foto — semuanya disimpan langsung di database.

## Ganti password (akun Pengelola & folder Dokumen)

Belum ada halaman UI untuk ganti password, jadi dilakukan lewat SQL langsung
ke database (via dashboard Neon → "SQL Editor", atau `psql`). Password baru
harus di-hash bcrypt dulu — cara paling gampang, jalankan ini sekali di
komputer kamu (butuh Node.js + folder proyek ini):

```bash
node -e "console.log(require('bcryptjs').hashSync('PASSWORD_BARU_DISINI', 10))"
```

Salin hasilnya, lalu jalankan SQL berikut (ganti `<hash>` dan `<username>`):

```sql
-- Ganti password salah satu akun Pengelola:
UPDATE accounts SET password_hash = '<hash>' WHERE username = '<username>';

-- Ganti password folder Dokumen (Tagihan/DWG/BAOP):
UPDATE site_settings SET value = '<hash>' WHERE key = 'document_password_hash';
```

## Struktur proyek

```
proyektrack-app/
├── server.js          # Express server + REST API + auth (login, upload, download)
├── db.js              # Koneksi database, skema, migrasi skema lama, & data contoh
├── package.json
├── .env.example        # Contoh isi file .env (DATABASE_URL, JWT_SECRET, PORT)
├── public/
│   ├── index.html
│   ├── app.js
│   ├── assets/bpa-logo.png
│   └── vendor/            # Chart.js & SheetJS (xlsx), disertakan langsung (tanpa perlu internet)
```

## Ringkasan API

Semua endpoint mengembalikan/menerima JSON, kecuali upload/download file
(`multipart/form-data` untuk upload, binary untuk download). Endpoint
tambah/ubah/hapus data (`POST`/`PUT`/`DELETE`, selain `/api/login`,
`/api/documents/unlock`, dan `/api/chat` POST) butuh login Pengelola dengan
role yang sesuai — kalau tidak, server balas `401`/`403`.

| Method | Endpoint                          | Keterangan |
|--------|------------------------------------|------------|
| GET    | `/api/bootstrap`                   | Semua data awal (proyek, kontrak, produksi, ritasi, BBM, alat, manpower, cuaca, dokumen, foto, isu, rencana Kurva-S, Saldo Awal BBM, sesi login) |
| POST   | `/api/login`                       | `{ username, password }` → set cookie sesi |
| POST   | `/api/logout`                      | Hapus cookie sesi |
| GET    | `/api/session`                     | Cek status login saat ini |
| POST   | `/api/documents/unlock`            | `{ password }` → buka folder Dokumen berpassword |
| GET/POST/PUT/DELETE | `/api/kontrak[/:id]`  | Item BOQ/kontrak (owner) |
| GET/POST/PUT/DELETE | `/api/production[/:id]` | Produksi Harian (owner) |
| GET/POST/PUT/DELETE | `/api/ritasi[/:id]`   | Ritasi DT (owner) |
| GET/POST/PUT/DELETE | `/api/fuel[/:id]`     | BBM masuk/keluar (owner atau akun bbm) |
| POST   | `/api/fuel/bulk-replace`           | Upload rekap BBM dari Excel — `{ projectId, periodStart, periodEnd, records[] }`, mengganti data BBM proyek ini di rentang tanggal tsb (owner atau akun bbm) |
| PUT    | `/api/fuel-saldo-awal`             | Simpan Saldo Awal BBM — `{ projectId, saldo }` (owner atau akun bbm) |
| GET/POST/PUT/DELETE | `/api/equipment[/:id]`| Status Alat (owner atau akun alat) |
| GET/POST/PUT/DELETE | `/api/manpower[/:id]` | Manpower (owner) |
| GET/POST/PUT/DELETE | `/api/weather[/:id]`  | Cuaca harian manual (owner) |
| POST   | `/api/documents`                   | Upload dokumen (`projectId`, `folder`, `file`, `description`) — owner |
| GET    | `/api/documents/:id/file`          | Download dokumen (butuh unlock kalau folder berpassword) |
| DELETE | `/api/documents/:id`               | Hapus dokumen (owner) |
| POST   | `/api/doc-folders`                 | Bikin folder Dokumen baru (`label`, `icon`, `maxMb`, `protected`) — owner |
| DELETE | `/api/doc-folders/:id`              | Hapus folder custom (bukan bawaan, dan harus kosong) — owner |
| GET/POST/PUT/DELETE | `/api/isu[/:id]`      | Isu Eksternal & Internal, `POST`/`PUT` bisa sertakan file `foto` (JPG/PNG/JPEG/HEIC) — owner |
| POST/DELETE | `/api/rencana[/:id]`         | Titik Rencana Kurva-S — `POST { projectId, date, targetPercent }` (menimpa titik lama di tanggal yang sama), `DELETE /:id` (owner) |
| POST   | `/api/rencana/bulk-replace`        | Upload Kurva-S dari Excel — `{ projectId, points[] }`, mengganti SEMUA titik rencana proyek ini (owner) |
| GET    | `/api/isu/:id/photo`               | Ambil foto bukti isu |
| POST   | `/api/photos`                      | Upload foto proyek (`projectId`, `files[]`) — owner |
| GET    | `/api/photos/:id/file`             | Ambil file foto |
| POST   | `/api/chat`                        | Kirim pesan chat internal (siapa saja) |
| GET    | `/api/chat`                        | Baca semua pesan (butuh login Pengelola, akun mana pun) |

**Catatan foto HEIC (Isu & foto proyek):** file HEIC disimpan & di-serve apa
adanya (tidak dikonversi otomatis ke JPEG). Kebanyakan browser modern (Chrome,
Safari terbaru) bisa menampilkannya, tapi sebagian browser lama/Android
mungkin tidak bisa preview-nya langsung — filenya tetap tersimpan aman dan
tetap bisa didownload/dibuka lewat aplikasi lain. Kalau ini jadi masalah,
solusinya nanti bisa ditambah konversi otomatis ke JPEG di server (butuh
library tambahan seperti `sharp`).

## Backup data

Neon dan sebagian besar hosting Postgres punya fitur backup/point-in-time-restore
bawaan di dashboard mereka — cek pengaturan project Neon kamu.
