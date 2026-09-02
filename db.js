// Database layer: schema + seed data for Project Tracking (earthwork operations,
// kontrak/BOQ progress, Ritasi DT, BBM per-alat, Alat & Manpower tabulation,
// dokumen berpassword, foto proyek, chat internal, & login Pengelola berperan).
// Uses PostgreSQL (works with any Postgres host, incl. the free Neon tier)
// via a DATABASE_URL connection string in the environment.

require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

if (!process.env.DATABASE_URL) {
  console.error(
    "ERROR: DATABASE_URL belum diset. Buat file .env (lihat .env.example) atau set env var DATABASE_URL ke connection string Postgres kamu."
  );
  process.exit(1);
}

// node-postgres cetak warning "SECURITY WARNING: The SSL modes 'prefer',
// 'require', and 'verify-ca' are treated as aliases for 'verify-full'" kalau
// query param `sslmode=require` (dipakai default oleh Neon & kebanyakan host
// Postgres lain di connection string mereka) masih ada di connectionString —
// SSL-nya sendiri tetap kita atur manual lewat opsi `ssl` di bawah, jadi
// param sslmode di URL dibuang dulu supaya warning-nya tidak muncul (harmless,
// bukan error, tapi bikin log deploy jadi berisik/menyesatkan).
function stripSslModeParam(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch (err) {
    return url; // URL tidak valid/tidak bisa di-parse — biarkan apa adanya
  }
}

const pool = new Pool({
  connectionString: stripSslModeParam(process.env.DATABASE_URL),
  // Neon (and most hosted Postgres) require SSL; local Postgres does not.
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

const WEATHER_CONDITIONS = ["cerah", "berawan", "hujan_ringan", "hujan_lebat"];
const EQUIPMENT_STATUS_VALUES = ["Ready", "Perbaikan", "Standby"];
const FUEL_TYPES = ["masuk", "keluar"];
const DOC_FOLDERS = ["tagihan", "dwg", "baop", "geopdf"];
const ISU_KATEGORI_VALUES = ["internal", "eksternal", "k3"];
const ISU_STATUS_VALUES = ["berjalan", "selesai"];
const ISU_KEPARAHAN_VALUES = ["ringan", "sedang", "berat", "fatal"];

// Folder default Dokumen — dipakai sebagai seed awal tabel document_folders di
// bawah. Setelah live, Pemilik (owner) bisa menambah folder baru langsung dari
// website (lihat POST /api/doc-folders di server.js) tanpa perlu ubah kode ini.
const DEFAULT_DOC_FOLDERS = [
  { id: "tagihan", label: "Tagihan", icon: "🧾", protected: true, maxMb: 15, builtin: true },
  { id: "dwg", label: "Gambar DWG", icon: "📐", protected: true, maxMb: 15, builtin: true },
  { id: "baop", label: "BAOP", icon: "📋", protected: true, maxMb: 15, builtin: true },
  { id: "geopdf", label: "GeoPDF (Peta)", icon: "🗺️", protected: false, maxMb: 70, builtin: true },
];

/* ---------------------------------------------------------------------
   Migrasi dari skema lama (kalau ada) — versi sebelumnya (laporan harian
   alat/manpower digabung, tanpa kontrak/BOQ, tanpa Ritasi DT, tanpa login).
   Karena konsepnya berubah cukup besar, tabel lama yang sudah tidak dipakai
   di-drop supaya tidak konflik dengan skema baru di bawah.
--------------------------------------------------------------------- */
async function migrateFromOldSchema() {
  const { rows } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'equipment_logs'
    ) AS has_old_equipment_logs
  `);
  if (rows[0].has_old_equipment_logs) {
    console.log("Skema lama (isian alat/manpower harian) terdeteksi — mengganti ke skema baru (data demo lama akan diganti)...");
    await pool.query("DROP TABLE IF EXISTS equipment_logs CASCADE");
    await pool.query("DROP TABLE IF EXISTS production_reports CASCADE");
    await pool.query("DROP TABLE IF EXISTS fuel_logs CASCADE");
    await pool.query("DROP TABLE IF EXISTS weather_logs CASCADE");
    await pool.query("DROP TABLE IF EXISTS documents CASCADE");
    await pool.query("DROP TABLE IF EXISTS projects CASCADE");
  }
  // Skema super-lama (laporan progress/anggaran umum, sebelum earthwork edition).
  const { rows: rows2 } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'reports'
    ) AS has_ancient_reports
  `);
  if (rows2[0].has_ancient_reports) {
    await pool.query("DROP TABLE IF EXISTS reports CASCADE");
    await pool.query("DROP TABLE IF EXISTS projects CASCADE");
  }
}

async function initSchema() {
  await migrateFromOldSchema();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Item BOQ / kontrak — satu-satunya sumber "Jenis Pekerjaan" di Produksi Harian.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kontrak_items (
      id             SERIAL PRIMARY KEY,
      project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      no             INTEGER NOT NULL,
      uraian         TEXT NOT NULL,
      satuan         TEXT NOT NULL,
      volume_kontrak DOUBLE PRECISION NOT NULL,
      bobot_persen   DOUBLE PRECISION,
      notes          TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_kontrak_project ON kontrak_items(project_id);`);

  // Produksi Harian — volume tiap item kontrak per tanggal.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_reports (
      id               SERIAL PRIMARY KEY,
      project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kontrak_item_id  INTEGER REFERENCES kontrak_items(id) ON DELETE SET NULL,
      date             TEXT NOT NULL,
      volume           DOUBLE PRECISION NOT NULL,
      unit             TEXT,
      zona             TEXT,
      equipment_types  JSONB NOT NULL DEFAULT '[]',
      equipment        TEXT,
      notes            TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_production_project ON production_reports(project_id);`);

  // Ritasi Dump Truck — SENGAJA tidak ikut dijumlahkan ke progress kontrak.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ritasi_dt (
      id              SERIAL PRIMARY KEY,
      project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date            TEXT NOT NULL,
      unit            TEXT NOT NULL,
      kontrak_item_id INTEGER REFERENCES kontrak_items(id) ON DELETE SET NULL,
      count           INTEGER NOT NULL,
      capacity        DOUBLE PRECISION NOT NULL,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ritasi_project ON ritasi_dt(project_id);`);

  // BBM — masuk (pengiriman) & keluar (pemakaian per alat).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fuel_logs (
      id         SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date       TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN ('masuk','keluar')),
      equipment  TEXT NOT NULL,
      liters     DOUBLE PRECISION NOT NULL,
      notes      TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_fuel_project ON fuel_logs(project_id);`);

  // Alat — tabulasi status per unit (bukan isian harian).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS equipment_status (
      id         SERIAL PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      nama       TEXT NOT NULL,
      jenis      TEXT NOT NULL,
      status     TEXT NOT NULL CHECK (status IN ('Ready','Perbaikan','Standby')),
      notes      TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_equipment_status_project ON equipment_status(project_id);`);

  // Manpower — tabulasi jumlah orang per jabatan (bukan isian harian).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS manpower_roster (
      id            SERIAL PRIMARY KEY,
      project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      jabatan       TEXT NOT NULL,
      jumlah_orang  INTEGER NOT NULL,
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_manpower_project ON manpower_roster(project_id);`);

  // Cuaca (laporan harian manual — widget cuaca live per-jam terpisah, langsung ke Open-Meteo).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weather_logs (
      id           SERIAL PRIMARY KEY,
      project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date         TEXT NOT NULL,
      condition    TEXT NOT NULL CHECK (condition IN ('cerah','berawan','hujan_ringan','hujan_lebat')),
      rainfall_mm  DOUBLE PRECISION,
      hours_lost   DOUBLE PRECISION,
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_weather_project ON weather_logs(project_id);`);

  // Rencana Kurva-S — titik target progres kumulatif (%) per tanggal, diisi
  // manual atau lewat upload Excel (sheet "Kurva S"). Dibandingkan dengan
  // realisasi (dihitung otomatis dari Produksi Harian) di grafik Kurva-S
  // pada menu Realisasi Progres S.d ini.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rencana_progress (
      id             SERIAL PRIMARY KEY,
      project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date           TEXT NOT NULL,
      target_percent DOUBLE PRECISION NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rencana_project ON rencana_progress(project_id);`);

  // Saldo Awal BBM — satu nilai (Liter) per proyek, dipakai sebagai dasar
  // perhitungan "Sisa Stok" kalau proyek sudah punya stok BBM sebelum data
  // di menu BBM mulai dicatat di website ini.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fuel_opening_balance (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      saldo      DOUBLE PRECISION NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Folder Dokumen — dulunya daftar tetap (tagihan/dwg/baop/geopdf) yang
  // ditulis langsung di kode; sekarang jadi tabel supaya Pemilik (owner) bisa
  // bikin folder baru sendiri dari website tanpa perlu ubah kode lagi.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_folders (
      id         TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      icon       TEXT NOT NULL DEFAULT '📁',
      protected  BOOLEAN NOT NULL DEFAULT false,
      max_mb     INTEGER NOT NULL DEFAULT 15,
      builtin    BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  for (let i = 0; i < DEFAULT_DOC_FOLDERS.length; i++) {
    const f = DEFAULT_DOC_FOLDERS[i];
    await pool.query(
      `INSERT INTO document_folders (id, label, icon, protected, max_mb, builtin, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [f.id, f.label, f.icon, f.protected, f.maxMb, f.builtin, i]
    );
  }

  // Dokumen (Tagihan/DWG/BAOP/GeoPDF/dst) — disimpan langsung di database.
  // Kolom "folder" dulunya dibatasi CHECK ke 4 nilai tetap; sekarang folder
  // bisa bertambah lewat document_folders di atas, jadi constraint lama itu
  // (kalau ada, dari deployment sebelumnya) di-drop supaya folder baru bisa dipakai.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id          SERIAL PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      folder      TEXT NOT NULL,
      filename    TEXT NOT NULL,
      filetype    TEXT NOT NULL,
      filesize    INTEGER NOT NULL,
      description TEXT,
      file_data   BYTEA NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_folder_check;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);`);

  // Isu Eksternal & Internal — catatan isu/kendala yang sedang berjalan
  // selama masa kerja proyek (isu sosial masyarakat, pembebasan lahan,
  // keterlambatan desain, dll), lengkap dengan foto bukti opsional.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS isu_reports (
      id          SERIAL PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date        TEXT NOT NULL,
      kategori    TEXT NOT NULL CHECK (kategori IN ('internal','eksternal','k3')),
      status      TEXT NOT NULL CHECK (status IN ('berjalan','selesai')),
      judul       TEXT NOT NULL,
      deskripsi   TEXT,
      tindakan_perbaikan TEXT,
      keparahan   TEXT CHECK (keparahan IS NULL OR keparahan IN ('ringan','sedang','berat','fatal')),
      foto_mime   TEXT,
      foto_data   BYTEA,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Migrasi untuk instalasi lama (tabel isu_reports sudah ada dari versi
  // sebelumnya, sebelum kategori "k3" + kolom keparahan/tindakan ada).
  await pool.query(`ALTER TABLE isu_reports ADD COLUMN IF NOT EXISTS tindakan_perbaikan TEXT;`);
  await pool.query(`ALTER TABLE isu_reports ADD COLUMN IF NOT EXISTS keparahan TEXT;`);
  await pool.query(`ALTER TABLE isu_reports DROP CONSTRAINT IF EXISTS isu_reports_kategori_check;`);
  await pool.query(`ALTER TABLE isu_reports ADD CONSTRAINT isu_reports_kategori_check CHECK (kategori IN ('internal','eksternal','k3'));`);
  await pool.query(`ALTER TABLE isu_reports DROP CONSTRAINT IF EXISTS isu_reports_keparahan_check;`);
  await pool.query(`ALTER TABLE isu_reports ADD CONSTRAINT isu_reports_keparahan_check CHECK (keparahan IS NULL OR keparahan IN ('ringan','sedang','berat','fatal'));`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_isu_project ON isu_reports(project_id);`);

  // Foto proyek (bisa lebih dari 1, ditampilkan bergeser di Beranda).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_photos (
      id          SERIAL PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      mime        TEXT NOT NULL,
      file_data   BYTEA NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_photos_project ON project_photos(project_id);`);

  // Live Chat — pengunjung (tanpa login) bisa mulai sesi obrolan baru, Pengelola
  // (akun manapun) melihat semua sesi sebagai inbox dan bisa membalas satu-satu.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id               SERIAL PRIMARY KEY,
      visitor_name     TEXT NOT NULL DEFAULT 'Pengunjung',
      pengelola_unread BOOLEAN NOT NULL DEFAULT false,
      visitor_unread   BOOLEAN NOT NULL DEFAULT false,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id          SERIAL PRIMARY KEY,
      session_id  INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      from_role   TEXT NOT NULL CHECK (from_role IN ('visitor','pengelola','bot')),
      from_name   TEXT NOT NULL,
      message     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Migrasi dari versi lama (chat_messages tanpa session_id/from_role) — kalau
  // kolomnya belum ada, berarti tabel lama; tambahkan kolom baru + 1 sesi
  // default supaya pesan lama tidak hilang.
  const chatColCheck = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='chat_messages' AND column_name='session_id'`);
  if (!chatColCheck.rows.length) {
    await pool.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE;`);
    await pool.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS from_role TEXT;`);
    const { rows: oldRows } = await pool.query(`SELECT COUNT(*)::int AS n FROM chat_messages WHERE session_id IS NULL`);
    if (oldRows[0].n > 0) {
      const { rows: seeded } = await pool.query(`INSERT INTO chat_sessions (visitor_name) VALUES ('Pesan Lama') RETURNING id`);
      await pool.query(`UPDATE chat_messages SET session_id=$1, from_role='visitor' WHERE session_id IS NULL`, [seeded[0].id]);
    }
    await pool.query(`ALTER TABLE chat_messages ALTER COLUMN session_id SET NOT NULL;`);
    await pool.query(`ALTER TABLE chat_messages ALTER COLUMN from_role SET NOT NULL;`);
    await pool.query(`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_from_role_check;`);
    await pool.query(`ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_from_role_check CHECK (from_role IN ('visitor','pengelola','bot'));`);
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);`);

  // Akun Pengelola — login sungguhan (password di-hash bcrypt), hak akses per role.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('owner','bbm','alat')),
      label         TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Pengaturan situs (password folder Dokumen, dll) — value password disimpan hash.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Master Alat (daftar armada) — dulunya daftar tetap yang ditulis langsung di
  // kode frontend; sekarang jadi tabel supaya Pemilik/akun Alat bisa menambah
  // alat baru sendiri dari website. Daftar ini yang jadi sumber pilihan (select)
  // di form BBM, Ritasi DT, dan tabulasi Alat — begitu alat ditambah di sini,
  // otomatis muncul di semua dropdown itu tanpa perlu ubah kode lagi.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS equipment_master (
      id         SERIAL PRIMARY KEY,
      nama       TEXT NOT NULL,
      jenis      TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Nama alat unik (case-insensitive) supaya tidak ada dua entri "Sany DT-70"
  // yang cuma beda huruf besar/kecil di dropdown.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_master_nama ON equipment_master (lower(nama));`);
}

/* ---------------------------------------------------------------------
   Isi Master Alat pertama kali dari daftar armada bawaan. Dipisah dari
   seedIfEmpty() supaya database lama (yang proyeknya sudah terisi) tetap
   kebagian daftar armada awal saat update ini dipasang.
--------------------------------------------------------------------- */
async function seedEquipmentMasterIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM equipment_master");
  if (rows[0].n > 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let i = 0;
    for (const a of ALAT_MASTER_LIST) {
      await client.query(
        `INSERT INTO equipment_master (nama, jenis, sort_order) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [a.nama, a.jenis, i++]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/* ---------------------------------------------------------------------
   Menyusulkan alat baru ke database yang SUDAH terisi.
   seedEquipmentMasterIfEmpty() di atas cuma jalan kalau tabel masih kosong,
   jadi alat yang ditambahkan ke ALAT_MASTER_LIST setelah server dipakai
   tidak akan pernah masuk. Fungsi ini menutup celah itu: setiap boot, semua
   nama di ALAT_MASTER_LIST dicoba di-insert; yang sudah ada dilewati oleh
   ON CONFLICT DO NOTHING (index unik lower(nama)), jadi aman diulang dan
   tidak pernah membuat entri dobel. Alat baru dapat sort_order paling akhir
   supaya urutan daftar armada yang lama tidak berubah.
--------------------------------------------------------------------- */
async function syncEquipmentMasterAdditions() {
  const { rows } = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1)::int AS max FROM equipment_master"
  );
  let i = rows[0].max + 1;
  for (const a of ALAT_MASTER_LIST) {
    const r = await pool.query(
      `INSERT INTO equipment_master (nama, jenis, sort_order)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,
      [a.nama, a.jenis, i]
    );
    if (r.rowCount) i++;
  }
}

/* ---------------------------------------------------------------------
   Seed data awal (hanya kalau tabel masih kosong) — sama seperti versi
   preview: 1 proyek (Proyek Pulau Rote K-SIGN Tahap 2 NK-BPA), item BOQ
   dari dokumen kontrak, daftar 48 alat/armada, & 20 jabatan personil.
--------------------------------------------------------------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260813);
const rand = (min, max) => min + rng() * (max - min);
const randInt = (min, max) => Math.round(rand(min, max));
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const PROJECTS = [{ id: "p1", name: "Proyek Pulau Rote K-SIGN Tahap 2 NK-BPA" }];

const ALAT_MASTER_LIST = [
  { nama: "Bulldozer BD-07", jenis: "Bulldozer" },
  { nama: "Bulldozer BD-08", jenis: "Bulldozer" },
  { nama: "Hitachi BR-01", jenis: "Bulldozer" },
  { nama: "Sakai WBR-02", jenis: "Vibro Roller" },
  { nama: "Bomag CVR-04", jenis: "Vibro Roller" },
  { nama: "Bomag CVR-05", jenis: "Vibro Roller" },
  { nama: "Bomag CVR-06", jenis: "Vibro Roller" },
  { nama: "Bomag CVR-07", jenis: "Vibro Roller" },
  { nama: "HINO DT-26", jenis: "Dump Truck" },
  { nama: "Hanvan DT-62", jenis: "Dump Truck" },
  { nama: "Hanvan DT-63", jenis: "Dump Truck" },
  { nama: "Hanvan DT-64", jenis: "Dump Truck" },
  { nama: "Hanvan DT-65", jenis: "Dump Truck" },
  { nama: "Hanvan DT-66", jenis: "Dump Truck" },
  { nama: "Hanvan DT-67", jenis: "Dump Truck" },
  { nama: "Sany DT-69", jenis: "Dump Truck" },
  { nama: "Sany DT-70", jenis: "Dump Truck" },
  { nama: "Sany DT-71", jenis: "Dump Truck" },
  { nama: "Sany DT-72", jenis: "Dump Truck" },
  { nama: "Sany DT-73", jenis: "Dump Truck" },
  { nama: "Sany DT-74", jenis: "Dump Truck" },
  { nama: "Sany DT-75", jenis: "Dump Truck" },
  { nama: "Sany DT-76", jenis: "Dump Truck" },
  { nama: "Sany DT-77", jenis: "Dump Truck" },
  { nama: "ZAXIS 200 (E-26)", jenis: "Excavator" },
  { nama: "ZAXIS 200 (E-27)", jenis: "Excavator" },
  { nama: "ZAXIS 200 (E-28)", jenis: "Excavator" },
  { nama: "ZAXIS 350 (E-31)", jenis: "Excavator" },
  { nama: "ZAXIS 350 (E-33)", jenis: "Excavator" },
  { nama: "ZAXIS 350 (E-34)", jenis: "Excavator" },
  { nama: "ZAXIS 350 (E-35)", jenis: "Excavator" },
  { nama: "ZAXIS 70 (E-38)", jenis: "Excavator" },
  { nama: "ZAXIS 70 (E-39)", jenis: "Excavator" },
  { nama: "ZAXIS 70 (E-40)", jenis: "Excavator" },
  { nama: "ZAXIS 70 (E-41)", jenis: "Excavator" },
  { nama: "ZAXIS 70 (E-42)", jenis: "Excavator" },
  { nama: "ZAXIS 70 (E-43)", jenis: "Excavator" },
  { nama: "Genset 45 kva G85", jenis: "Lainnya" },
  { nama: "Genset Yanmar TS 230", jenis: "Lainnya" },
  { nama: "Triton Single BK 8608 ES", jenis: "Lainnya" },
  { nama: "Triton Double BK 8901 FE", jenis: "Lainnya" },
  { nama: "Hilux Double BK 8240 GO", jenis: "Lainnya" },
  { nama: "L300 BK 8064 GZ", jenis: "Lainnya" },
  { nama: "Dutro FT-01 DT-59", jenis: "Dump Truck" },
  { nama: "Dutro Gresing DT-33", jenis: "Dump Truck" },
  { nama: "MESIN KOMPRESOR PISPOT", jenis: "Lainnya" },
  { nama: "Dutro MH DT-58", jenis: "Dump Truck" },
  { nama: "Dutro MH DT-59", jenis: "Dump Truck" },
  { nama: "MTX 6800 S G-90", jenis: "Lainnya" },
  { nama: "MTX 6800 S G-91", jenis: "Lainnya" },
  { nama: "MTX 6800 S G-92", jenis: "Lainnya" },
  { nama: "MTX 6800 S G-93", jenis: "Lainnya" },
  { nama: "MTX 6800 S G-94", jenis: "Lainnya" },
];
const DT_UNIT_LIST = ALAT_MASTER_LIST.filter((a) => a.jenis === "Dump Truck").map((a) => a.nama);
const FUEL_EQUIPMENT = ALAT_MASTER_LIST.map((a) => a.nama);
const FUEL_SOURCES = ["Pengiriman SPBU Industri Rote", "Pengiriman Depo BBM Pusat", "Tangki Mobile Supplier PT Sumber Energi"];

const JABATAN_POOL = [
  { jabatan: "Project Manager", jumlah: 1 }, { jabatan: "Site Manager", jumlah: 1 },
  { jabatan: "HRD", jumlah: 1 }, { jabatan: "Admin", jumlah: 1 },
  { jabatan: "Site Engineer", jumlah: 1 }, { jabatan: "HSE", jumlah: 2 },
  { jabatan: "Surveyor", jumlah: 2 }, { jabatan: "Ass. Surveyor", jumlah: 1 },
  { jabatan: "Supervisor", jumlah: 2 }, { jabatan: "Driver Sarana", jumlah: 1 },
  { jabatan: "Logistik", jumlah: 1 }, { jabatan: "Fuel Man", jumlah: 1 },
  { jabatan: "Mekanik", jumlah: 2 }, { jabatan: "Ass. Mekanik", jumlah: 2 },
  { jabatan: "Helper Mekanik", jumlah: 2 }, { jabatan: "Welder", jumlah: 2 },
  { jabatan: "Operator Excavator", jumlah: 10 }, { jabatan: "Operator Bulldozer", jumlah: 2 },
  { jabatan: "Operator Compactor", jumlah: 4 }, { jabatan: "Driver Dump Truck", jumlah: 15 },
];

const KONTRAK_SEED_ITEMS = [
  { no: 1, uraian: "Clearing dan stripping", satuan: "M2", volumeKontrak: 657364.11, bobotPersen: 8.466525 },
  { no: 2, uraian: "Penggalian tanah biasa dan pengangkutan tanah dengan jarak 0 – 1 km", satuan: "M3", volumeKontrak: 245278.00, bobotPersen: 33.260384 },
  { no: 3, uraian: "Galian batu lunak", satuan: "M3", volumeKontrak: 11038.00, bobotPersen: 2.152769 },
  { no: 4, uraian: "Penghamparan dan pemadatan tanah biasa", satuan: "M3", volumeKontrak: 215587.00, bobotPersen: 18.643249 },
  { no: 5, uraian: "Pembuatan tanggul", satuan: "M3", volumeKontrak: 83535.00, bobotPersen: 14.293961 },
  { no: 6, uraian: "Mobilisasi dan Demobilisasi", satuan: "Ls", volumeKontrak: 1.00, bobotPersen: 23.183111 },
];

const ZONA = ["STA 0+000 - 0+500", "STA 0+500 - 1+000", "STA 1+000 - 1+500", "Blok A", "Blok B", "Blok C", "Zona Utara", "Zona Selatan"];
const PRODUCTION_NOTES = ["Cuaca mendukung, produksi lancar", "Tertunda karena hujan siang hari", "Alat utama sempat maintenance ringan", "Akses jalan kerja licin, produksi melambat", "", "", "", ""];
const EQUIPMENT_POOL = ["Excavator PC200", "Excavator PC300", "Bulldozer D65", "Bulldozer D85", "Dump Truck 10 unit", "Vibro Roller", "Motor Grader", "Chainsaw crew 8 orang"];
const EQUIPMENT_TYPE_OPTIONS = ["Excavator", "Bulldozer", "Dump Truck", "Vibro Roller", "Motor Grader", "Compactor", "Crane", "Chainsaw/Alat Land Clearing"];
const WEATHER_NOTES = ["Hujan turun sore hari", "Mendung sepanjang hari, tidak ada hujan", "Cuaca cerah penuh", "Hujan deras menghentikan pekerjaan galian", ""];

const TODAY = new Date();
function iso(d) { return d.toISOString().slice(0, 10); }

async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM projects");
  if (rows[0].n > 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const p of PROJECTS) {
      await client.query("INSERT INTO projects (id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING", [p.id, p.name]);

      // Kontrak (BOQ)
      const kontrakIds = [];
      for (const item of KONTRAK_SEED_ITEMS) {
        const { rows: r } = await client.query(
          `INSERT INTO kontrak_items (project_id, no, uraian, satuan, volume_kontrak, bobot_persen, notes)
           VALUES ($1,$2,$3,$4,$5,$6,'') RETURNING id`,
          [p.id, item.no, item.uraian, item.satuan, item.volumeKontrak, item.bobotPersen]
        );
        kontrakIds.push({ id: r[0].id, ...item });
      }
      const dailyItems = kontrakIds.filter((k) => k.satuan.toLowerCase() !== "ls");
      const days = 21;

      // Produksi Harian (21 hari terakhir)
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(TODAY); d.setDate(d.getDate() - i);
        const activeCount = rng() < 0.5 ? 1 : 2;
        for (let c = 0; c < activeCount; c++) {
          const item = pick(dailyItems);
          const dailyVolume = Math.round(rand(0.001, 0.01) * item.volumeKontrak * 10) / 10;
          const typeCount = rng() < 0.5 ? 1 : 2;
          const equipmentTypes = [];
          for (let t = 0; t < typeCount; t++) { const et = pick(EQUIPMENT_TYPE_OPTIONS); if (!equipmentTypes.includes(et)) equipmentTypes.push(et); }
          await client.query(
            `INSERT INTO production_reports (project_id, kontrak_item_id, date, volume, unit, zona, equipment_types, equipment, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [p.id, item.id, iso(d), dailyVolume, item.satuan, pick(ZONA), JSON.stringify(equipmentTypes), pick(EQUIPMENT_POOL), pick(PRODUCTION_NOTES)]
          );
        }
      }
      // Item lump-sum sekali di awal proyek
      for (const item of kontrakIds.filter((k) => k.satuan.toLowerCase() === "ls")) {
        const d = new Date(TODAY); d.setDate(d.getDate() - (days - 1));
        await client.query(
          `INSERT INTO production_reports (project_id, kontrak_item_id, date, volume, unit, zona, equipment_types, equipment, notes)
           VALUES ($1,$2,$3,$4,$5,'',  '[]', '', $6)`,
          [p.id, item.id, iso(d), item.volumeKontrak, item.satuan, "Mobilisasi alat & personel awal proyek"]
        );
      }

      // Ritasi DT (21 hari terakhir)
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(TODAY); d.setDate(d.getDate() - i);
        const tripsToday = randInt(2, 5);
        for (let j = 0; j < tripsToday; j++) {
          const capacity = pick([5, 6, 8, 10]);
          const itemRef = rng() < 0.7 ? pick(dailyItems).id : null;
          await client.query(
            `INSERT INTO ritasi_dt (project_id, date, unit, kontrak_item_id, count, capacity, notes)
             VALUES ($1,$2,$3,$4,$5,$6,'')`,
            [p.id, iso(d), pick(DT_UNIT_LIST), itemRef, randInt(4, 18), capacity]
          );
        }
      }

      // BBM (21 hari terakhir)
      let sinceDelivery = 0;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(TODAY); d.setDate(d.getDate() - i);
        if (sinceDelivery === 0) {
          await client.query(
            `INSERT INTO fuel_logs (project_id, date, type, equipment, liters, notes) VALUES ($1,$2,'masuk',$3,$4,'')`,
            [p.id, iso(d), pick(FUEL_SOURCES), Math.round(rand(1500, 2600))]
          );
        }
        const entries = randInt(2, 4);
        for (let j = 0; j < entries; j++) {
          await client.query(
            `INSERT INTO fuel_logs (project_id, date, type, equipment, liters, notes) VALUES ($1,$2,'keluar',$3,$4,'')`,
            [p.id, iso(d), pick(FUEL_EQUIPMENT), Math.round(rand(35, 220))]
          );
        }
        sinceDelivery = (sinceDelivery + 1) % 5;
      }

      // Alat — tabulasi status, satu baris per unit ALAT_MASTER_LIST
      for (const a of ALAT_MASTER_LIST) {
        const roll = rng();
        const status = roll < 0.78 ? "Ready" : roll < 0.93 ? "Perbaikan" : "Standby";
        const notes = status === "Perbaikan" ? "Dalam perbaikan/maintenance di workshop" : status === "Standby" ? "Standby, belum dioperasikan" : "";
        await client.query(
          `INSERT INTO equipment_status (project_id, nama, jenis, status, notes) VALUES ($1,$2,$3,$4,$5)`,
          [p.id, a.nama, a.jenis, status, notes]
        );
      }

      // Manpower — tabulasi jumlah orang per jabatan
      for (const j of JABATAN_POOL) {
        await client.query(
          `INSERT INTO manpower_roster (project_id, jabatan, jumlah_orang, notes) VALUES ($1,$2,$3,'')`,
          [p.id, j.jabatan, j.jumlah]
        );
      }

      // Cuaca (21 hari terakhir)
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(TODAY); d.setDate(d.getDate() - i);
        const condition = pick(WEATHER_CONDITIONS);
        const isRain = condition === "hujan_ringan" || condition === "hujan_lebat";
        await client.query(
          `INSERT INTO weather_logs (project_id, date, condition, rainfall_mm, hours_lost, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
          [p.id, iso(d), condition, isRain ? Math.round(rand(2, 60) * 10) / 10 : 0, isRain ? Math.round(rand(0.5, condition === "hujan_lebat" ? 6 : 2) * 10) / 10 : 0, pick(WEATHER_NOTES)]
        );
      }

      // Dokumen contoh (isi file cuma teks placeholder, bukan file asli)
      const DOC_SAMPLES = {
        tagihan: [{ filename: "Invoice-Sewa-Alat-Agustus.pdf", filetype: "pdf", description: "Tagihan sewa alat berat bulan Agustus" }],
        dwg: [{ filename: "Layout-CutFill-ZonaA-Rev2.dwg", filetype: "dwg", description: "Gambar kerja cut & fill zona A rev.2" }],
        baop: [{ filename: "BAOP-Galian-Minggu3.pdf", filetype: "pdf", description: "Berita acara opname pekerjaan galian minggu ke-3" }],
        geopdf: [{ filename: "Peta-Progress-Area-Kerja.pdf", filetype: "pdf", description: "GeoPDF peta progress area kerja" }],
      };
      for (const folder of DOC_FOLDERS) {
        for (const s of DOC_SAMPLES[folder]) {
          const buf = Buffer.from("Contoh dokumen awal — " + s.filename);
          await client.query(
            `INSERT INTO documents (project_id, folder, filename, filetype, filesize, description, file_data)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [p.id, folder, s.filename, s.filetype, buf.length, s.description, buf]
          );
        }
      }
    }

    // Live Chat contoh — 1 sesi obrolan dari pengunjung contoh
    const { rows: chatSeed } = await client.query(
      `INSERT INTO chat_sessions (visitor_name) VALUES ('Tim Lapangan') RETURNING id`
    );
    await client.query(
      `INSERT INTO chat_messages (session_id, from_role, from_name, message, created_at) VALUES
       ($1, 'visitor', 'Tim Lapangan', 'Selamat pagi, mohon info jadwal pengiriman BBM minggu ini.', now() - interval '2 hours')`,
      [chatSeed[0].id]
    );

    // Akun Pengelola demo (password di-hash — SEBAIKNYA DIGANTI setelah live).
    const demoAccounts = [
      { username: "pemilik", password: "pemilik123", role: "owner", label: "Pemilik (Akses Semua Menu)" },
      { username: "bbm", password: "bbm123", role: "bbm", label: "Pengelola BBM" },
      { username: "alat", password: "alat123", role: "alat", label: "Pengelola Alat" },
    ];
    for (const acc of demoAccounts) {
      const hash = await bcrypt.hash(acc.password, 10);
      await client.query(
        `INSERT INTO accounts (username, password_hash, role, label) VALUES ($1,$2,$3,$4)
         ON CONFLICT (username) DO NOTHING`,
        [acc.username, hash, acc.role, acc.label]
      );
    }

    // Password folder Dokumen (Tagihan/DWG/BAOP) — SEBAIKNYA DIGANTI setelah live.
    const docPasswordHash = await bcrypt.hash("Adminrote1", 10);
    await client.query(
      `INSERT INTO site_settings (key, value) VALUES ('document_password_hash', $1)
       ON CONFLICT (key) DO NOTHING`,
      [docPasswordHash]
    );

    await client.query("COMMIT");
    console.log("Seeded demo data:", PROJECTS.length, "proyek, akun pengelola demo, & password dokumen awal.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function init() {
  await initSchema();
  await seedIfEmpty();
  await seedEquipmentMasterIfEmpty();
  await syncEquipmentMasterAdditions();
}

module.exports = {
  pool, init,
  WEATHER_CONDITIONS, EQUIPMENT_STATUS_VALUES, FUEL_TYPES, DOC_FOLDERS,
  ISU_KATEGORI_VALUES, ISU_STATUS_VALUES, ISU_KEPARAHAN_VALUES, DEFAULT_DOC_FOLDERS,
  ALAT_MASTER_LIST, DT_UNIT_LIST, JABATAN_POOL,
};
