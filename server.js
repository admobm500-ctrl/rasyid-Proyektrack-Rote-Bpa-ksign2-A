const path = require("path");
const express = require("express");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { pool, init, WEATHER_CONDITIONS, ISU_KATEGORI_VALUES, ISU_STATUS_VALUES, ISU_KEPARAHAN_VALUES } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error(
    "ERROR: JWT_SECRET belum diset. Set env var JWT_SECRET (string acak/rahasia) supaya login Pengelola aman — lihat .env.example."
  );
  process.exit(1);
}
const IS_LOCAL = process.env.DATABASE_URL.includes("localhost");

const MAX_DOC_MB_DEFAULT = 15;
const MAX_PHOTO_MB = 12;
// Foto bukti Isu boleh JPG/PNG/JPEG/HEIC (termasuk foto langsung dari iPhone) —
// beberapa browser/OS melaporkan mimetype HEIC secara tidak konsisten (kadang
// kosong/"application/octet-stream"), jadi validasi juga jatuh ke ekstensi file.
const MAX_ISU_PHOTO_MB = 12;
const ISU_FOTO_EXT_RE = /\.(jpe?g|png|heic|heif)$/i;

const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 70 * 1024 * 1024 } });
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\//.test(file.mimetype);
    cb(ok ? null : new Error("File foto harus berupa gambar."), ok);
  },
});
const uploadIsuPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ISU_PHOTO_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\//.test(file.mimetype) || ISU_FOTO_EXT_RE.test(file.originalname || "");
    cb(ok ? null : new Error("Foto bukti harus berupa gambar (JPG, JPEG, PNG, atau HEIC)."), ok);
  },
});

/* ---------------------------------------------------------------------
   Folder Dokumen — dulunya daftar tetap, sekarang tabel document_folders
   (lihat db.js) supaya Pemilik (owner) bisa bikin folder baru dari website.
   Query kecil & jarang berubah, jadi diambil langsung tiap dibutuhkan
   (tidak di-cache) supaya folder baru langsung kepakai tanpa restart server.
--------------------------------------------------------------------- */
async function loadDocFolders() {
  const { rows } = await pool.query("SELECT * FROM document_folders ORDER BY sort_order, created_at");
  return rows.map(rowToDocFolder);
}
async function findDocFolder(id) {
  const { rows } = await pool.query("SELECT * FROM document_folders WHERE id=$1", [id]);
  return rows[0] ? rowToDocFolder(rows[0]) : null;
}
function slugifyFolderId(name) {
  return String(name || "")
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "folder";
}

app.use(express.json());
app.use(cookieParser());

/* ---------------------------------------------------------------------
   Auth — login Pengelola (owner/bbm/alat) via JWT httpOnly cookie, dan
   unlock password folder Dokumen (independen dari login Pengelola —
   sama seperti versi preview, pengunjung yang tahu passwordnya juga
   bisa buka folder terkunci tanpa perlu login Pengelola).
--------------------------------------------------------------------- */
const SESSION_COOKIE = "pt_session";
const DOCS_COOKIE = "pt_docs";
const WRITE_ROLES = {
  kontrak: ["owner"], production: ["owner"], ritasi: ["owner"],
  fuel: ["owner", "bbm"], equipment: ["owner", "alat"],
  manpower: ["owner"], weather: ["owner"], documents: ["owner"], photos: ["owner"],
  isu: ["owner"], docFolders: ["owner"], rencana: ["owner"],
  fuelOpeningBalance: ["owner", "bbm"],
};

function readSession(req) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET);
    return { role: p.role, label: p.label };
  } catch { return null; }
}
function readDocsUnlocked(req) {
  const token = req.cookies && req.cookies[DOCS_COOKIE];
  if (!token) return false;
  try { return !!jwt.verify(token, JWT_SECRET).docsUnlocked; } catch { return false; }
}
app.use((req, res, next) => {
  req.session = readSession(req);
  req.docsUnlocked = readDocsUnlocked(req);
  next();
});

function requireWrite(resource) {
  return (req, res, next) => {
    const role = req.session && req.session.role;
    if (!role) return res.status(401).json({ error: "Login sebagai Pengelola diperlukan untuk mengubah data ini." });
    if (!WRITE_ROLES[resource].includes(role)) return res.status(403).json({ error: "Akun ini tidak punya akses untuk mengubah data " + resource + "." });
    next();
  };
}

app.post("/api/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Username & password wajib diisi." });
    const { rows } = await pool.query("SELECT * FROM accounts WHERE username = $1", [String(username).trim().toLowerCase()]);
    const acc = rows[0];
    const ok = acc && (await bcrypt.compare(password, acc.password_hash));
    if (!ok) return res.status(401).json({ error: "Username atau password salah." });
    const token = jwt.sign({ role: acc.role, label: acc.label }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: !IS_LOCAL, maxAge: 7 * 24 * 3600 * 1000 });
    res.json({ role: acc.role, label: acc.label });
  } catch (err) { next(err); }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get("/api/session", (req, res) => {
  res.json(req.session || { role: null, label: null });
});

app.post("/api/documents/unlock", async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: "Password wajib diisi." });
    const { rows } = await pool.query("SELECT value FROM site_settings WHERE key = 'document_password_hash'");
    const hash = rows[0] && rows[0].value;
    const ok = hash && (await bcrypt.compare(password, hash));
    if (!ok) return res.status(401).json({ error: "Password salah. Coba lagi." });
    const token = jwt.sign({ docsUnlocked: true }, JWT_SECRET, { expiresIn: "12h" });
    res.cookie(DOCS_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: !IS_LOCAL, maxAge: 12 * 3600 * 1000 });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Helpers
--------------------------------------------------------------------- */
async function assertProjectExists(projectId) {
  const { rows } = await pool.query("SELECT id FROM projects WHERE id = $1", [projectId]);
  return rows.length > 0;
}
function numOrNull(v) { return v === "" || v === undefined || v === null ? null : Number(v); }

function rowToKontrak(r) {
  return { id: r.id, projectId: r.project_id, no: r.no, uraian: r.uraian, satuan: r.satuan, volumeKontrak: Number(r.volume_kontrak), bobotPersen: r.bobot_persen != null ? Number(r.bobot_persen) : null, notes: r.notes || "" };
}
function rowToProduction(r) {
  return { id: r.id, projectId: r.project_id, kontrakItemId: r.kontrak_item_id, date: r.date, volume: Number(r.volume), unit: r.unit, zona: r.zona || "", equipmentTypes: r.equipment_types || [], equipment: r.equipment || "", notes: r.notes || "" };
}
function rowToRitasi(r) {
  return { id: r.id, projectId: r.project_id, date: r.date, unit: r.unit, kontrakItemId: r.kontrak_item_id, count: r.count, capacity: Number(r.capacity), notes: r.notes || "" };
}
function rowToFuel(r) {
  return { id: r.id, projectId: r.project_id, date: r.date, type: r.type, equipment: r.equipment, liters: Number(r.liters), notes: r.notes || "" };
}
function rowToEquipment(r) {
  return { id: r.id, projectId: r.project_id, nama: r.nama, jenis: r.jenis, status: r.status, notes: r.notes || "" };
}
function rowToManpower(r) {
  return { id: r.id, projectId: r.project_id, jabatan: r.jabatan, jumlahOrang: r.jumlah_orang, notes: r.notes || "" };
}
function rowToWeather(r) {
  return { id: r.id, projectId: r.project_id, date: r.date, condition: r.condition, rainfallMm: r.rainfall_mm != null ? Number(r.rainfall_mm) : 0, hoursLost: r.hours_lost != null ? Number(r.hours_lost) : 0, notes: r.notes || "" };
}
function rowToDocument(r) {
  return { id: r.id, projectId: r.project_id, folder: r.folder, filename: r.filename, filetype: r.filetype, filesize: r.filesize, description: r.description || "", uploadedAt: r.uploaded_at, blobUrl: `/api/documents/${r.id}/file` };
}
function rowToChatMessage(r) {
  return { id: r.id, sessionId: r.session_id, from: r.from_role, authorName: r.from_name, text: r.message, createdAt: r.created_at };
}
function rowToChatSession(r) {
  return { id: r.id, visitorName: r.visitor_name, pengelolaUnread: !!r.pengelola_unread, visitorUnread: !!r.visitor_unread, createdAt: r.created_at };
}
function rowToIsu(r) {
  return {
    id: r.id, projectId: r.project_id, date: r.date, kategori: r.kategori, status: r.status,
    judul: r.judul, deskripsi: r.deskripsi || "",
    tindakanPerbaikan: r.tindakan_perbaikan || "",
    keparahan: r.keparahan || null,
    foto: r.foto_mime ? `/api/isu/${r.id}/photo` : null,
    createdAt: r.created_at,
  };
}
function rowToDocFolder(r) {
  return { id: r.id, label: r.label, icon: r.icon, protected: r.protected, maxMb: r.max_mb, builtin: r.builtin };
}
function rowToRencana(r) {
  return { id: r.id, projectId: r.project_id, date: r.date, targetPercent: Number(r.target_percent) };
}

/* ---------------------------------------------------------------------
   Bootstrap — satu payload gabungan dipakai saat halaman dibuka, supaya
   frontend tidak perlu banyak round-trip (mirip pola data seed di preview).
--------------------------------------------------------------------- */
app.get("/api/bootstrap", async (req, res, next) => {
  try {
    const [projects, kontrak, production, ritasi, fuel, equipment, manpower, weather, documents, photos, isu, docFolders, rencana, fuelOpeningBalance] = await Promise.all([
      pool.query("SELECT id, name FROM projects ORDER BY created_at"),
      pool.query("SELECT * FROM kontrak_items ORDER BY project_id, no"),
      pool.query("SELECT * FROM production_reports ORDER BY date DESC, id DESC"),
      pool.query("SELECT * FROM ritasi_dt ORDER BY date DESC, id DESC"),
      pool.query("SELECT * FROM fuel_logs ORDER BY date DESC, id DESC"),
      pool.query("SELECT * FROM equipment_status ORDER BY id"),
      pool.query("SELECT * FROM manpower_roster ORDER BY id"),
      pool.query("SELECT * FROM weather_logs ORDER BY date DESC, id DESC"),
      pool.query("SELECT id, project_id, folder, filename, filetype, filesize, description, uploaded_at FROM documents ORDER BY uploaded_at DESC"),
      pool.query("SELECT id, project_id FROM project_photos ORDER BY id"),
      pool.query("SELECT id, project_id, date, kategori, status, judul, deskripsi, tindakan_perbaikan, keparahan, foto_mime, created_at FROM isu_reports ORDER BY date DESC, id DESC"),
      pool.query("SELECT * FROM document_folders ORDER BY sort_order, created_at"),
      pool.query("SELECT * FROM rencana_progress ORDER BY project_id, date"),
      pool.query("SELECT project_id, saldo FROM fuel_opening_balance"),
    ]);
    const photosByProject = {};
    photos.rows.forEach((p) => {
      (photosByProject[p.project_id] = photosByProject[p.project_id] || []).push({ id: p.id, url: `/api/photos/${p.id}/file` });
    });
    const fuelOpeningBalanceByProject = {};
    fuelOpeningBalance.rows.forEach((r) => { fuelOpeningBalanceByProject[r.project_id] = Number(r.saldo); });
    res.json({
      session: req.session || { role: null, label: null },
      docsUnlocked: !!req.docsUnlocked,
      projects: projects.rows,
      kontrak: kontrak.rows.map(rowToKontrak),
      production: production.rows.map(rowToProduction),
      ritasi: ritasi.rows.map(rowToRitasi),
      fuel: fuel.rows.map(rowToFuel),
      equipment: equipment.rows.map(rowToEquipment),
      manpower: manpower.rows.map(rowToManpower),
      weather: weather.rows.map(rowToWeather),
      documents: documents.rows.map(rowToDocument),
      photos: photosByProject,
      isu: isu.rows.map(rowToIsu),
      docFolders: docFolders.rows.map(rowToDocFolder),
      rencana: rencana.rows.map(rowToRencana),
      fuelOpeningBalance: fuelOpeningBalanceByProject,
    });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Kontrak (BOQ)
--------------------------------------------------------------------- */
app.post("/api/kontrak", requireWrite("kontrak"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.projectId || !(await assertProjectExists(b.projectId))) errors.push("projectId tidak valid");
    if (!b.uraian) errors.push("uraian wajib diisi");
    if (!b.satuan) errors.push("satuan wajib diisi");
    const no = Number(b.no), vol = Number(b.volumeKontrak);
    if (!Number.isFinite(no)) errors.push("no harus angka");
    if (!Number.isFinite(vol) || vol < 0) errors.push("volumeKontrak harus angka >= 0");
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    const { rows } = await pool.query(
      `INSERT INTO kontrak_items (project_id, no, uraian, satuan, volume_kontrak, bobot_persen, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.projectId, no, b.uraian, b.satuan, vol, numOrNull(b.bobotPersen), b.notes || ""]
    );
    res.status(201).json(rowToKontrak(rows[0]));
  } catch (err) { next(err); }
});
app.put("/api/kontrak/:id", requireWrite("kontrak"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE kontrak_items SET no=$1, uraian=$2, satuan=$3, volume_kontrak=$4, bobot_persen=$5, notes=$6 WHERE id=$7 RETURNING *`,
      [Number(b.no), b.uraian, b.satuan, Number(b.volumeKontrak), numOrNull(b.bobotPersen), b.notes || "", Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Item kontrak tidak ditemukan." });
    res.json(rowToKontrak(rows[0]));
  } catch (err) { next(err); }
});
app.delete("/api/kontrak/:id", requireWrite("kontrak"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM kontrak_items WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Item kontrak tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Produksi Harian
--------------------------------------------------------------------- */
app.post("/api/production", requireWrite("production"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.projectId || !(await assertProjectExists(b.projectId))) errors.push("projectId tidak valid");
    if (!b.date) errors.push("date wajib diisi");
    const volume = Number(b.volume);
    if (!Number.isFinite(volume) || volume < 0) errors.push("volume harus angka >= 0");
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    const { rows } = await pool.query(
      `INSERT INTO production_reports (project_id, kontrak_item_id, date, volume, unit, zona, equipment_types, equipment, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.projectId, numOrNull(b.kontrakItemId), b.date, volume, b.unit || "", b.zona || "", JSON.stringify(b.equipmentTypes || []), b.equipment || "", b.notes || ""]
    );
    res.status(201).json(rowToProduction(rows[0]));
  } catch (err) { next(err); }
});
app.put("/api/production/:id", requireWrite("production"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE production_reports SET kontrak_item_id=$1, date=$2, volume=$3, unit=$4, zona=$5, equipment_types=$6, equipment=$7, notes=$8 WHERE id=$9 RETURNING *`,
      [numOrNull(b.kontrakItemId), b.date, Number(b.volume), b.unit || "", b.zona || "", JSON.stringify(b.equipmentTypes || []), b.equipment || "", b.notes || "", Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Laporan tidak ditemukan." });
    res.json(rowToProduction(rows[0]));
  } catch (err) { next(err); }
});
app.delete("/api/production/:id", requireWrite("production"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM production_reports WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Laporan tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Ritasi DT
--------------------------------------------------------------------- */
app.post("/api/ritasi", requireWrite("ritasi"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.projectId || !(await assertProjectExists(b.projectId))) errors.push("projectId tidak valid");
    if (!b.date) errors.push("date wajib diisi");
    if (!b.unit) errors.push("unit wajib diisi");
    const count = Number(b.count), capacity = Number(b.capacity);
    if (!Number.isFinite(count) || count < 0) errors.push("count harus angka >= 0");
    if (!Number.isFinite(capacity) || capacity < 0) errors.push("capacity harus angka >= 0");
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    const { rows } = await pool.query(
      `INSERT INTO ritasi_dt (project_id, date, unit, kontrak_item_id, count, capacity, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.projectId, b.date, b.unit, numOrNull(b.kontrakItemId), count, capacity, b.notes || ""]
    );
    res.status(201).json(rowToRitasi(rows[0]));
  } catch (err) { next(err); }
});
app.put("/api/ritasi/:id", requireWrite("ritasi"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE ritasi_dt SET date=$1, unit=$2, kontrak_item_id=$3, count=$4, capacity=$5, notes=$6 WHERE id=$7 RETURNING *`,
      [b.date, b.unit, numOrNull(b.kontrakItemId), Number(b.count), Number(b.capacity), b.notes || "", Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Data ritasi tidak ditemukan." });
    res.json(rowToRitasi(rows[0]));
  } catch (err) { next(err); }
});
app.delete("/api/ritasi/:id", requireWrite("ritasi"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM ritasi_dt WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Data ritasi tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   BBM
--------------------------------------------------------------------- */
app.post("/api/fuel", requireWrite("fuel"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.projectId || !(await assertProjectExists(b.projectId))) errors.push("projectId tidak valid");
    if (!b.date) errors.push("date wajib diisi");
    if (!["masuk", "keluar"].includes(b.type)) errors.push("type harus masuk atau keluar");
    if (!b.equipment) errors.push("equipment wajib diisi");
    const liters = Number(b.liters);
    if (!Number.isFinite(liters) || liters < 0) errors.push("liters harus angka >= 0");
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    const { rows } = await pool.query(
      `INSERT INTO fuel_logs (project_id, date, type, equipment, liters, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.projectId, b.date, b.type, b.equipment, liters, b.notes || ""]
    );
    res.status(201).json(rowToFuel(rows[0]));
  } catch (err) { next(err); }
});
app.put("/api/fuel/:id", requireWrite("fuel"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE fuel_logs SET date=$1, type=$2, equipment=$3, liters=$4, notes=$5 WHERE id=$6 RETURNING *`,
      [b.date, b.type, b.equipment, Number(b.liters), b.notes || "", Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Data BBM tidak ditemukan." });
    res.json(rowToFuel(rows[0]));
  } catch (err) { next(err); }
});
app.delete("/api/fuel/:id", requireWrite("fuel"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM fuel_logs WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Data BBM tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Upload rekap BBM dari Excel — mengganti semua data BBM proyek ini dalam
// rentang tanggal `periodStart`..`periodEnd` (biasanya 1 bulan) dengan isi
// file yang diupload, supaya upload ulang bulan yang sama tidak dobel data.
app.post("/api/fuel/bulk-replace", requireWrite("fuel"), async (req, res, next) => {
  try {
    const { projectId, periodStart, periodEnd, records } = req.body || {};
    if (!projectId || !(await assertProjectExists(projectId))) return res.status(400).json({ error: "projectId tidak valid." });
    if (!periodStart || !periodEnd) return res.status(400).json({ error: "periodStart & periodEnd wajib diisi." });
    if (!Array.isArray(records) || !records.length) return res.status(400).json({ error: "records wajib diisi (minimal 1 baris)." });
    for (const r of records) {
      if (!r.date || !["masuk", "keluar"].includes(r.type) || !r.equipment || !Number.isFinite(Number(r.liters))) {
        return res.status(400).json({ error: "Ada baris data BBM yang tidak valid di file." });
      }
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM fuel_logs WHERE project_id=$1 AND date >= $2 AND date <= $3", [projectId, periodStart, periodEnd]);
      const inserted = [];
      for (const r of records) {
        const { rows } = await client.query(
          `INSERT INTO fuel_logs (project_id, date, type, equipment, liters, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [projectId, r.date, r.type, r.equipment, Number(r.liters), r.notes || ""]
        );
        inserted.push(rowToFuel(rows[0]));
      }
      await client.query("COMMIT");
      res.status(201).json({ inserted });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Saldo Awal BBM — satu nilai (Liter) per proyek, dasar perhitungan
   "Sisa Stok" kalau proyek sudah punya stok BBM sebelum dicatat di sini.
--------------------------------------------------------------------- */
app.put("/api/fuel-saldo-awal", requireWrite("fuelOpeningBalance"), async (req, res, next) => {
  try {
    const { projectId, saldo } = req.body || {};
    if (!projectId || !(await assertProjectExists(projectId))) return res.status(400).json({ error: "projectId tidak valid." });
    const saldoNum = Number(saldo);
    if (!Number.isFinite(saldoNum) || saldoNum < 0) return res.status(400).json({ error: "saldo harus angka >= 0." });
    await pool.query(
      `INSERT INTO fuel_opening_balance (project_id, saldo, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (project_id) DO UPDATE SET saldo = EXCLUDED.saldo, updated_at = now()`,
      [projectId, saldoNum]
    );
    res.json({ projectId, saldo: saldoNum });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Alat (tabulasi status per unit)
--------------------------------------------------------------------- */
app.post("/api/equipment", requireWrite("equipment"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.projectId || !(await assertProjectExists(b.projectId))) errors.push("projectId tidak valid");
    if (!b.nama) errors.push("nama wajib diisi");
    if (!b.jenis) errors.push("jenis wajib diisi");
    if (!["Ready", "Perbaikan", "Standby"].includes(b.status)) errors.push("status tidak valid");
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    const { rows } = await pool.query(
      `INSERT INTO equipment_status (project_id, nama, jenis, status, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [b.projectId, b.nama, b.jenis, b.status, b.notes || ""]
    );
    res.status(201).json(rowToEquipment(rows[0]));
  } catch (err) { next(err); }
});
app.put("/api/equipment/:id", requireWrite("equipment"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE equipment_status SET nama=$1, jenis=$2, status=$3, notes=$4 WHERE id=$5 RETURNING *`,
      [b.nama, b.jenis, b.status, b.notes || "", Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Data alat tidak ditemukan." });
    res.json(rowToEquipment(rows[0]));
  } catch (err) { next(err); }
});
app.delete("/api/equipment/:id", requireWrite("equipment"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM equipment_status WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Data alat tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Manpower (tabulasi jumlah orang per jabatan)
--------------------------------------------------------------------- */
app.post("/api/manpower", requireWrite("manpower"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.projectId || !(await assertProjectExists(b.projectId))) errors.push("projectId tidak valid");
    if (!b.jabatan) errors.push("jabatan wajib diisi");
    const jumlah = Number(b.jumlahOrang);
    if (!Number.isFinite(jumlah) || jumlah < 0) errors.push("jumlahOrang harus angka >= 0");
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    const { rows } = await pool.query(
      `INSERT INTO manpower_roster (project_id, jabatan, jumlah_orang, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [b.projectId, b.jabatan, jumlah, b.notes || ""]
    );
    res.status(201).json(rowToManpower(rows[0]));
  } catch (err) { next(err); }
});
app.put("/api/manpower/:id", requireWrite("manpower"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE manpower_roster SET jabatan=$1, jumlah_orang=$2, notes=$3 WHERE id=$4 RETURNING *`,
      [b.jabatan, Number(b.jumlahOrang), b.notes || "", Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Data manpower tidak ditemukan." });
    res.json(rowToManpower(rows[0]));
  } catch (err) { next(err); }
});
app.delete("/api/manpower/:id", requireWrite("manpower"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM manpower_roster WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Data manpower tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Cuaca (laporan harian manual)
--------------------------------------------------------------------- */
app.post("/api/weather", requireWrite("weather"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.projectId || !(await assertProjectExists(b.projectId))) errors.push("projectId tidak valid");
    if (!b.date) errors.push("date wajib diisi");
    if (!WEATHER_CONDITIONS.includes(b.condition)) errors.push("condition tidak valid");
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    const { rows } = await pool.query(
      `INSERT INTO weather_logs (project_id, date, condition, rainfall_mm, hours_lost, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.projectId, b.date, b.condition, numOrNull(b.rainfallMm) || 0, numOrNull(b.hoursLost) || 0, b.notes || ""]
    );
    res.status(201).json(rowToWeather(rows[0]));
  } catch (err) { next(err); }
});
app.put("/api/weather/:id", requireWrite("weather"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE weather_logs SET date=$1, condition=$2, rainfall_mm=$3, hours_lost=$4, notes=$5 WHERE id=$6 RETURNING *`,
      [b.date, b.condition, numOrNull(b.rainfallMm) || 0, numOrNull(b.hoursLost) || 0, b.notes || "", Number(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ error: "Laporan cuaca tidak ditemukan." });
    res.json(rowToWeather(rows[0]));
  } catch (err) { next(err); }
});
app.delete("/api/weather/:id", requireWrite("weather"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM weather_logs WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Laporan cuaca tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Rencana Kurva-S — target progres kumulatif (%) per tanggal, manual atau
   dari upload Excel (sheet "Kurva S"). Cuma masuk akal 1 titik per tanggal
   per proyek — kalau POST dengan tanggal yang sudah ada, baris lama ditimpa.
--------------------------------------------------------------------- */
app.post("/api/rencana", requireWrite("rencana"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const errors = [];
    if (!b.projectId || !(await assertProjectExists(b.projectId))) errors.push("projectId tidak valid");
    if (!b.date) errors.push("date wajib diisi");
    const target = Number(b.targetPercent);
    if (!Number.isFinite(target) || target < 0 || target > 100) errors.push("targetPercent harus angka 0-100");
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    const { rows: existingRows } = await pool.query("SELECT id FROM rencana_progress WHERE project_id=$1 AND date=$2", [b.projectId, b.date]);
    let rows;
    if (existingRows.length) {
      ({ rows } = await pool.query(`UPDATE rencana_progress SET target_percent=$1 WHERE id=$2 RETURNING *`, [target, existingRows[0].id]));
    } else {
      ({ rows } = await pool.query(`INSERT INTO rencana_progress (project_id, date, target_percent) VALUES ($1,$2,$3) RETURNING *`, [b.projectId, b.date, target]));
    }
    res.status(201).json(rowToRencana(rows[0]));
  } catch (err) { next(err); }
});
app.delete("/api/rencana/:id", requireWrite("rencana"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM rencana_progress WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Titik rencana tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Upload Kurva-S dari Excel — mengganti SEMUA titik rencana proyek ini
// dengan isi file yang diupload (sama seperti fallback lokal versi preview).
app.post("/api/rencana/bulk-replace", requireWrite("rencana"), async (req, res, next) => {
  try {
    const { projectId, points } = req.body || {};
    if (!projectId || !(await assertProjectExists(projectId))) return res.status(400).json({ error: "projectId tidak valid." });
    if (!Array.isArray(points) || !points.length) return res.status(400).json({ error: "points wajib diisi (minimal 1 titik)." });
    for (const p of points) {
      if (!p.date || !Number.isFinite(Number(p.targetPercent)) || p.targetPercent < 0 || p.targetPercent > 100) {
        return res.status(400).json({ error: "Ada titik rencana yang tidak valid di file." });
      }
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM rencana_progress WHERE project_id=$1", [projectId]);
      const inserted = [];
      for (const p of points) {
        const { rows } = await client.query(
          `INSERT INTO rencana_progress (project_id, date, target_percent) VALUES ($1,$2,$3) RETURNING *`,
          [projectId, p.date, Number(p.targetPercent)]
        );
        inserted.push(rowToRencana(rows[0]));
      }
      await client.query("COMMIT");
      res.status(201).json({ inserted });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Dokumen — folder Tagihan/DWG/BAOP (password) & GeoPDF (bebas)
--------------------------------------------------------------------- */
app.post("/api/documents", requireWrite("documents"), (req, res, next) => {
  uploadDoc.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const { projectId, folder, description } = req.body || {};
      if (!projectId || !(await assertProjectExists(projectId))) return res.status(400).json({ error: "projectId tidak valid." });
      const folderRow = await findDocFolder(folder);
      if (!folderRow) return res.status(400).json({ error: "folder tidak valid." });
      if (!req.file) return res.status(400).json({ error: "File wajib diupload." });
      const maxMb = folderRow.maxMb || MAX_DOC_MB_DEFAULT;
      if (req.file.size > maxMb * 1024 * 1024) return res.status(400).json({ error: `Ukuran file melebihi batas ${maxMb}MB untuk folder ini.` });
      const ext = (req.file.originalname.match(/\.([a-zA-Z0-9]+)$/) || [, "file"])[1].toLowerCase();
      const { rows } = await pool.query(
        `INSERT INTO documents (project_id, folder, filename, filetype, filesize, description, file_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, project_id, folder, filename, filetype, filesize, description, uploaded_at`,
        [projectId, folder, req.file.originalname, ext, req.file.size, description || "", req.file.buffer]
      );
      res.status(201).json(rowToDocument(rows[0]));
    } catch (e) { next(e); }
  });
});

app.get("/api/documents/:id/file", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT folder, filename, filetype, file_data FROM documents WHERE id=$1", [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: "Dokumen tidak ditemukan." });
    const doc = rows[0];
    const folderRow = await findDocFolder(doc.folder);
    if (folderRow && folderRow.protected && !req.docsUnlocked) {
      return res.status(403).json({ error: "Folder ini dilindungi password. Buka password dulu di menu Dokumen." });
    }
    const mime = doc.filetype === "pdf" ? "application/pdf" : "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.filename.replace(/"/g, "")}"`);
    res.send(doc.file_data);
  } catch (err) { next(err); }
});

app.delete("/api/documents/:id", requireWrite("documents"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM documents WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Dokumen tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Folder Dokumen — Pemilik (owner) bisa bikin folder baru sendiri dari
   website (tanpa ubah kode). Folder builtin (Tagihan/DWG/BAOP/GeoPDF) tidak
   bisa dihapus; folder custom tidak bisa dihapus kalau masih ada dokumennya.
--------------------------------------------------------------------- */
app.post("/api/doc-folders", requireWrite("docFolders"), async (req, res, next) => {
  try {
    const b = req.body || {};
    const label = (b.label || "").trim();
    if (!label) return res.status(400).json({ error: "Nama folder wajib diisi." });
    const maxMb = Number(b.maxMb) > 0 ? Math.min(Number(b.maxMb), 200) : 15;
    const protectedFlag = !!b.protected;
    const icon = (b.icon || "📁").trim().slice(0, 8) || "📁";
    let id = slugifyFolderId(label);
    // Pastikan id unik — tambah -2, -3, dst kalau sudah dipakai.
    let suffix = 2;
    const baseId = id;
    while (await findDocFolder(id)) { id = `${baseId}-${suffix}`; suffix++; }
    const { rows: maxRows } = await pool.query("SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM document_folders");
    const { rows } = await pool.query(
      `INSERT INTO document_folders (id, label, icon, protected, max_mb, builtin, sort_order)
       VALUES ($1,$2,$3,$4,$5,false,$6) RETURNING *`,
      [id, label, icon, protectedFlag, maxMb, maxRows[0].next]
    );
    res.status(201).json(rowToDocFolder(rows[0]));
  } catch (err) { next(err); }
});

app.delete("/api/doc-folders/:id", requireWrite("docFolders"), async (req, res, next) => {
  try {
    const folderRow = await findDocFolder(req.params.id);
    if (!folderRow) return res.status(404).json({ error: "Folder tidak ditemukan." });
    if (folderRow.builtin) return res.status(400).json({ error: "Folder bawaan tidak bisa dihapus." });
    const { rows: docCount } = await pool.query("SELECT COUNT(*)::int AS n FROM documents WHERE folder=$1", [req.params.id]);
    if (docCount[0].n > 0) return res.status(400).json({ error: "Folder ini masih berisi dokumen — pindahkan/hapus dokumennya dulu sebelum menghapus folder." });
    await pool.query("DELETE FROM document_folders WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Isu Eksternal & Internal — catatan isu/kendala yang sedang berjalan
   selama masa kerja proyek, dengan foto bukti opsional (JPG/PNG/JPEG/HEIC).
--------------------------------------------------------------------- */
function validateIsuFields(b, errors) {
  if (!b.date) errors.push("date wajib diisi");
  if (!ISU_KATEGORI_VALUES.includes(b.kategori)) errors.push("kategori tidak valid");
  if (!ISU_STATUS_VALUES.includes(b.status)) errors.push("status tidak valid");
  if (!b.judul || !String(b.judul).trim()) errors.push("judul wajib diisi");
  if (b.kategori === "k3" && b.keparahan && !ISU_KEPARAHAN_VALUES.includes(b.keparahan)) errors.push("keparahan tidak valid");
}
function isuKeparahanValue(b) { return b.kategori === "k3" && b.keparahan ? b.keparahan : null; }

app.post("/api/isu", requireWrite("isu"), (req, res, next) => {
  uploadIsuPhoto.single("foto")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const b = req.body || {};
      const errors = [];
      if (!b.projectId || !(await assertProjectExists(b.projectId))) errors.push("projectId tidak valid");
      validateIsuFields(b, errors);
      if (errors.length) return res.status(400).json({ error: errors.join("; ") });
      const { rows } = await pool.query(
        `INSERT INTO isu_reports (project_id, date, kategori, status, judul, deskripsi, tindakan_perbaikan, keparahan, foto_mime, foto_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, project_id, date, kategori, status, judul, deskripsi, tindakan_perbaikan, keparahan, foto_mime, created_at`,
        [b.projectId, b.date, b.kategori, b.status, b.judul.trim(), b.deskripsi || "", (b.tindakanPerbaikan || "").trim(), isuKeparahanValue(b), req.file ? req.file.mimetype : null, req.file ? req.file.buffer : null]
      );
      res.status(201).json(rowToIsu(rows[0]));
    } catch (e) { next(e); }
  });
});

app.put("/api/isu/:id", requireWrite("isu"), (req, res, next) => {
  uploadIsuPhoto.single("foto")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const b = req.body || {};
      const errors = [];
      validateIsuFields(b, errors);
      if (errors.length) return res.status(400).json({ error: errors.join("; ") });
      const id = Number(req.params.id);
      const keparahan = isuKeparahanValue(b);
      const tindakan = (b.tindakanPerbaikan || "").trim();
      let rows;
      if (req.file) {
        ({ rows } = await pool.query(
          `UPDATE isu_reports SET date=$1, kategori=$2, status=$3, judul=$4, deskripsi=$5, tindakan_perbaikan=$6, keparahan=$7, foto_mime=$8, foto_data=$9 WHERE id=$10
           RETURNING id, project_id, date, kategori, status, judul, deskripsi, tindakan_perbaikan, keparahan, foto_mime, created_at`,
          [b.date, b.kategori, b.status, b.judul.trim(), b.deskripsi || "", tindakan, keparahan, req.file.mimetype, req.file.buffer, id]
        ));
      } else if (b.removeFoto === "1" || b.removeFoto === "true") {
        ({ rows } = await pool.query(
          `UPDATE isu_reports SET date=$1, kategori=$2, status=$3, judul=$4, deskripsi=$5, tindakan_perbaikan=$6, keparahan=$7, foto_mime=NULL, foto_data=NULL WHERE id=$8
           RETURNING id, project_id, date, kategori, status, judul, deskripsi, tindakan_perbaikan, keparahan, foto_mime, created_at`,
          [b.date, b.kategori, b.status, b.judul.trim(), b.deskripsi || "", tindakan, keparahan, id]
        ));
      } else {
        ({ rows } = await pool.query(
          `UPDATE isu_reports SET date=$1, kategori=$2, status=$3, judul=$4, deskripsi=$5, tindakan_perbaikan=$6, keparahan=$7 WHERE id=$8
           RETURNING id, project_id, date, kategori, status, judul, deskripsi, tindakan_perbaikan, keparahan, foto_mime, created_at`,
          [b.date, b.kategori, b.status, b.judul.trim(), b.deskripsi || "", tindakan, keparahan, id]
        ));
      }
      if (!rows.length) return res.status(404).json({ error: "Isu tidak ditemukan." });
      res.json(rowToIsu(rows[0]));
    } catch (e) { next(e); }
  });
});

app.delete("/api/isu/:id", requireWrite("isu"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM isu_reports WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Isu tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.get("/api/isu/:id/photo", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT foto_mime, foto_data FROM isu_reports WHERE id=$1", [Number(req.params.id)]);
    if (!rows.length || !rows[0].foto_data) return res.status(404).end();
    res.setHeader("Content-Type", rows[0].foto_mime || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(rows[0].foto_data);
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Foto proyek (Beranda) — bisa lebih dari satu, ditampilkan bergeser
--------------------------------------------------------------------- */
app.post("/api/photos", requireWrite("photos"), (req, res, next) => {
  uploadPhoto.array("files", 20)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const { projectId } = req.body || {};
      if (!projectId || !(await assertProjectExists(projectId))) return res.status(400).json({ error: "projectId tidak valid." });
      if (!req.files || !req.files.length) return res.status(400).json({ error: "Pilih minimal 1 foto." });
      const photos = [];
      for (const f of req.files) {
        const { rows } = await pool.query(
          `INSERT INTO project_photos (project_id, mime, file_data) VALUES ($1,$2,$3) RETURNING id`,
          [projectId, f.mimetype, f.buffer]
        );
        photos.push({ id: rows[0].id, url: `/api/photos/${rows[0].id}/file` });
      }
      res.status(201).json({ photos });
    } catch (e) { next(e); }
  });
});

app.get("/api/photos/:id/file", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT mime, file_data FROM project_photos WHERE id=$1", [Number(req.params.id)]);
    if (!rows.length) return res.status(404).end();
    res.setHeader("Content-Type", rows[0].mime || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(rows[0].file_data);
  } catch (err) { next(err); }
});

app.delete("/api/photos/:id", requireWrite("photos"), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM project_photos WHERE id=$1", [Number(req.params.id)]);
    if (!rowCount) return res.status(404).json({ error: "Foto tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Live Chat — pengunjung (tanpa login) bisa mulai sesi obrolan baru &
   melanjutkan sesinya sendiri (dikenali lewat ID sesi yang disimpan di
   localStorage browsernya, sama seperti versi preview — tidak ada
   proteksi kepemilikan sesi di server, siapa pun yang tahu ID sesi bisa
   baca/isi sesi itu; ini masalah kecil yang cukup aman untuk chat bantuan
   ringan seperti ini). Pengelola (akun manapun yang login) bisa lihat
   SEMUA sesi sebagai inbox & membalas satu per satu.
--------------------------------------------------------------------- */
async function loadChatSession(id) {
  const { rows } = await pool.query("SELECT * FROM chat_sessions WHERE id=$1", [id]);
  if (!rows.length) return null;
  const { rows: msgRows } = await pool.query("SELECT * FROM chat_messages WHERE session_id=$1 ORDER BY id", [id]);
  return { ...rowToChatSession(rows[0]), messages: msgRows.map(rowToChatMessage) };
}

// Pengunjung mulai sesi Live Chat baru (nama opsional + pesan pertama wajib).
app.post("/api/chat/sessions", async (req, res, next) => {
  try {
    const b = req.body || {};
    const text = (b.message || "").trim();
    if (!text) return res.status(400).json({ error: "Pesan tidak boleh kosong." });
    const visitorName = (b.name || "").trim() || "Pengunjung";
    const { rows } = await pool.query(
      `INSERT INTO chat_sessions (visitor_name, pengelola_unread) VALUES ($1, true) RETURNING *`,
      [visitorName]
    );
    const session = rows[0];
    const { rows: msgRows } = await pool.query(
      `INSERT INTO chat_messages (session_id, from_role, from_name, message) VALUES ($1,'visitor',$2,$3) RETURNING *`,
      [session.id, visitorName, text]
    );
    res.status(201).json({ ...rowToChatSession(session), messages: msgRows.map(rowToChatMessage) });
  } catch (err) { next(err); }
});

// Pengelola (akun manapun yang login) — daftar semua sesi + isi pesannya, dipakai untuk inbox.
app.get("/api/chat/sessions", async (req, res, next) => {
  try {
    if (!req.session || !req.session.role) return res.status(401).json({ error: "Login sebagai Pengelola diperlukan." });
    const { rows: sessions } = await pool.query("SELECT * FROM chat_sessions ORDER BY id");
    const { rows: messages } = await pool.query("SELECT * FROM chat_messages ORDER BY id");
    const bySession = {};
    messages.forEach((m) => { (bySession[m.session_id] = bySession[m.session_id] || []).push(rowToChatMessage(m)); });
    res.json(sessions.map((s) => ({ ...rowToChatSession(s), messages: bySession[s.id] || [] })));
  } catch (err) { next(err); }
});

// Satu sesi (dipakai pengunjung untuk polling sesinya sendiri via ID tersimpan).
app.get("/api/chat/sessions/:id", async (req, res, next) => {
  try {
    const session = await loadChatSession(Number(req.params.id));
    if (!session) return res.status(404).json({ error: "Sesi chat tidak ditemukan." });
    res.json(session);
  } catch (err) { next(err); }
});

// Kirim pesan ke sebuah sesi — peran (visitor/pengelola) ditentukan server dari status login,
// supaya pengunjung tidak bisa berpura-pura jadi Pengelola.
app.post("/api/chat/sessions/:id/messages", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const b = req.body || {};
    const text = (b.message || "").trim();
    if (!text) return res.status(400).json({ error: "Pesan tidak boleh kosong." });
    const session = await loadChatSession(sessionId);
    if (!session) return res.status(404).json({ error: "Sesi chat tidak ditemukan." });

    const isPengelola = !!(req.session && req.session.role);
    const fromRole = isPengelola ? "pengelola" : (b.asBot ? "bot" : "visitor");
    const fromName = isPengelola ? (req.session.label || "Pengelola") : (fromRole === "bot" ? "Bot Asisten" : session.visitorName);

    const { rows } = await pool.query(
      `INSERT INTO chat_messages (session_id, from_role, from_name, message) VALUES ($1,$2,$3,$4) RETURNING *`,
      [sessionId, fromRole, fromName, text]
    );
    if (fromRole !== "bot") {
      await pool.query(
        "UPDATE chat_sessions SET pengelola_unread=$1, visitor_unread=$2 WHERE id=$3",
        [fromRole === "visitor", fromRole === "pengelola", sessionId]
      );
    }
    res.status(201).json(rowToChatMessage(rows[0]));
  } catch (err) { next(err); }
});

// Tandai sudah dibaca — dipanggil saat sisi yang bersangkutan membuka thread-nya.
app.post("/api/chat/sessions/:id/read", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const isPengelola = !!(req.session && req.session.role);
    const col = isPengelola ? "pengelola_unread" : "visitor_unread";
    const { rowCount } = await pool.query(`UPDATE chat_sessions SET ${col}=false WHERE id=$1`, [sessionId]);
    if (!rowCount) return res.status(404).json({ error: "Sesi chat tidak ditemukan." });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------
   Static frontend & error handler
--------------------------------------------------------------------- */
app.use(express.static(path.join(__dirname, "public")));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan di server." });
});

init()
  .then(() => {
    app.listen(PORT, () => console.log(`Project Tracking berjalan di http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Gagal menyiapkan database:", err.message);
    process.exit(1);
  });
