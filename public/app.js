/* Project Tracking — Proyek Pulau Rote K-SIGN Tahap 2 NK-BPA.
   Frontend ini tersambung ke server (Express + PostgreSQL) lewat /api/... —
   semua data (produksi, ritasi DT, BBM, alat, manpower, cuaca, dokumen, foto
   proyek, kontrak/BOQ, chat internal) disimpan permanen di database, bukan
   lagi di browser. Login Pengelola (owner/bbm/alat) & password folder
   Dokumen divalidasi di server (lihat server.js) — bukan hanya disembunyikan
   di tampilan. Widget cuaca per-jam & mingguan tetap langsung ke layanan
   publik Open-Meteo dari browser (tidak lewat server). */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const WEATHER_CONDITIONS = ["cerah", "berawan", "hujan_ringan", "hujan_lebat"];
const WEATHER_LABEL = { cerah: "Cerah", berawan: "Berawan", hujan_ringan: "Hujan Ringan", hujan_lebat: "Hujan Lebat" };
const WEATHER_STATUS = { cerah: "good", berawan: "neutral", hujan_ringan: "warning", hujan_lebat: "critical" };
// Folder Dokumen dulunya daftar tetap (tagihan/dwg/baop/geopdf) — sekarang
// dimuat dari server (tabel document_folders, lihat db.js/server.js) supaya
// Pemilik (owner) bisa bikin folder baru sendiri langsung dari website tanpa
// perlu ubah kode. `docFolders` diisi saat boot() dari bootstrap.
let docFolders = [];
function folderById(id) { return docFolders.find((f) => f.id === id); }
function folderLabel(id) { const f = folderById(id); return f ? f.label : id; }
function folderIcon(id) { const f = folderById(id); return f ? f.icon : "📁"; }
function folderMaxMb(id) { const f = folderById(id); return f ? f.maxMb : 15; }
function folderIsProtected(id) { const f = folderById(id); return f ? f.protected : false; }

// Isu Eksternal & Internal — isu/kendala yang sedang berjalan selama masa
// kerja proyek (isu sosial masyarakat, pembebasan lahan, keterlambatan
// desain, dll), lengkap dengan foto bukti opsional (JPG/PNG/JPEG/HEIC).
const ISU_KATEGORI_LABEL = { internal: "Internal", eksternal: "Eksternal", k3: "K3 (Keselamatan)" };
const ISU_STATUS_LABEL = { berjalan: "Berjalan", selesai: "Selesai" };
const ISU_KEPARAHAN_LABEL = { ringan: "Ringan (P3K)", sedang: "Sedang (Rawat Jalan)", berat: "Berat (Rawat Inap)", fatal: "Fatal" };
function isuBadge(kategori) {
  const cls = kategori === "k3" ? "status-critical" : kategori === "eksternal" ? "status-warning" : "status-neutral";
  return `<span class="badge ${cls}"><span class="dot"></span>${ISU_KATEGORI_LABEL[kategori] || kategori}</span>`;
}
function isuStatusBadge(status) {
  const cls = status === "berjalan" ? "status-warning" : "status-good";
  return `<span class="badge ${cls}"><span class="dot"></span>${ISU_STATUS_LABEL[status] || status}</span>`;
}
function keparahanBadge(keparahan) {
  if (!keparahan) return '<span class="empty-note" style="padding:0;">–</span>';
  const cls = (keparahan === "fatal" || keparahan === "berat") ? "status-critical" : keparahan === "sedang" ? "status-warning" : "status-neutral";
  return `<span class="badge ${cls}"><span class="dot"></span>${ISU_KEPARAHAN_LABEL[keparahan] || keparahan}</span>`;
}
const ISU_FOTO_EXT_RE = /\.(jpe?g|png|heic|heif)$/i;
// Akun Pengelola (Pemilik/BBM/Alat) divalidasi di server (POST /api/login,
// password di-hash bcrypt) — role & hak akses menu tiap akun ditentukan di
// server (tabel accounts). ROLE_ALLOWED_VIEWS di bawah cuma dipakai untuk
// menyaring menu di sidebar sesuai role yang sedang login.
const ROLE_ALLOWED_VIEWS = {
  owner: null, // null = semua menu
  bbm: ["bbm"],
  alat: ["alat"],
};
const ITEM_COLOR_PALETTE = ["#3987e5", "#d95926", "#199e70", "#9085e9", "#e6c34d", "#e667a0", "#5cc9e8", "#c9a26d"];
const EQUIPMENT_TYPE_OPTIONS = ["Excavator", "Bulldozer", "Dump Truck", "Vibro Roller", "Motor Grader", "Compactor", "Crane", "Chainsaw/Alat Land Clearing", "Lainnya"];

// Master data armada alat & unit DT — sesuai data monitoring BBM proyek yang
// dikirim (daftar Nama Alat pada laporan pemakaian BBM solar). Dipakai sebagai
// sumber pilihan (select) di form BBM, Ritasi DT & tabulasi Alat — supaya tidak
// perlu ketik manual satu-satu lagi.
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
];
const DT_UNIT_LIST = ALAT_MASTER_LIST.filter((a) => a.jenis === "Dump Truck").map((a) => a.nama);

/* ---------------------------------------------------------------------
   API helpers — semua data diambil/disimpan lewat server, bukan lagi
   di-generate/disimpan di browser.
--------------------------------------------------------------------- */
async function apiFetch(url, opts) {
  const res = await fetch(url, Object.assign({ credentials: "include" }, opts || {}));
  let body = null;
  try { body = await res.json(); } catch (e) { /* respons tanpa body JSON (mis. 204) */ }
  if (!res.ok) {
    const err = new Error((body && body.error) || "Terjadi kesalahan di server.");
    err.status = res.status;
    err.payload = body;
    throw err;
  }
  return body;
}
const API_RESOURCE = { production: "production", ritasi: "ritasi", fuel: "fuel", equipment: "equipment", manpower: "manpower", weather: "weather", documents: "documents", kontrak: "kontrak", isu: "isu", rencana: "rencana" };
function apiCreate(kind, data) { return apiFetch(`/api/${API_RESOURCE[kind]}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
function apiUpdate(kind, id, data) { return apiFetch(`/api/${API_RESOURCE[kind]}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
function apiDelete(kind, id) { return apiFetch(`/api/${API_RESOURCE[kind]}/${id}`, { method: "DELETE" }); }
function apiReplaceRencana(projectId, points) { return apiFetch("/api/rencana/bulk-replace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, points }) }); }
function apiReplaceFuelPeriod(projectId, periodStart, periodEnd, records) { return apiFetch("/api/fuel/bulk-replace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, periodStart, periodEnd, records }) }); }
function apiSaveFuelSaldoAwal(projectId, saldo) { return apiFetch("/api/fuel-saldo-awal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, saldo }) }); }

const PROJECT_GRADIENTS = [
  "linear-gradient(135deg, #1a2a4a, #eb6834)",
];
const FUEL_SOURCES = ["Pengiriman SPBU Industri Rote", "Pengiriman Depo BBM Pusat", "Tangki Mobile Supplier PT Sumber Energi"];
// Sesuai Daftar Personil PT Budi Perkasa Alam (proyek K-SIGN Rote Ndao) — dipakai
// untuk isian datalist jabatan; jumlah orang default per jabatan datang dari server.
const JABATAN_POOL = [
  { jabatan: "Project Manager" }, { jabatan: "Site Manager" }, { jabatan: "HRD" }, { jabatan: "Admin" },
  { jabatan: "Site Engineer" }, { jabatan: "HSE" }, { jabatan: "Surveyor" }, { jabatan: "Ass. Surveyor" },
  { jabatan: "Supervisor" }, { jabatan: "Driver Sarana" }, { jabatan: "Logistik" }, { jabatan: "Fuel Man" },
  { jabatan: "Mekanik" }, { jabatan: "Ass. Mekanik" }, { jabatan: "Helper Mekanik" }, { jabatan: "Welder" },
  { jabatan: "Operator Excavator" }, { jabatan: "Operator Bulldozer" }, { jabatan: "Operator Compactor" }, { jabatan: "Driver Dump Truck" },
];

let PROJECTS = [];
let production = [], fuel = [], equipment = [], weather = [], documents = [], kontrak = [], ritasi = [], manpower = [], isu = [], rencanaProgress = [];
let projectPhotos = {}; // projectId -> array URL foto (dari server), bisa lebih dari 1, geser kiri/kanan
let heroPhotoIndex = {}; // projectId -> index foto yang sedang ditampilkan
let fuelOpeningBalance = {}; // projectId -> Saldo Awal BBM (Liter), dari server

let state = { projectId: null, view: "overview", dokFolder: null, documentsUnlocked: false, pengelolaRole: null, pengelolaLabel: null, chatView: "list", visitorSessionId: null };
let editing = { produksi: null, bbm: null, alat: null, manpower: null, cuaca: null, kontrak: null, ritasi: null, isu: null };

// Chat internal — pesan tersimpan permanen di server (tabel chat_messages),
// hanya bisa dibaca setelah login sebagai Pengelola (akun mana pun).

/* ---------------------------------------------------------------------
   Helpers
--------------------------------------------------------------------- */
function fmtDateLong(isoStr) {
  const d = new Date(isoStr + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtNum(n) { return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 1 }); }
function fmtNum2(n) { return Number(n).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function findKontrakItem(id) { return kontrak.find((k) => k.id === id); }
function itemColor(itemLike) {
  const items = kontrak.filter((k) => k.projectId === itemLike.projectId).slice().sort((a, b) => a.no - b.no);
  const idx = items.findIndex((k) => k.id === itemLike.id);
  return ITEM_COLOR_PALETTE[(idx >= 0 ? idx : 0) % ITEM_COLOR_PALETTE.length];
}
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function itemBadge(item) {
  if (!item) return `<span class="badge" style="background:rgba(137,135,129,0.18); color:#c3c2b7;"><span class="dot" style="background:#898781;"></span>(item dihapus)</span>`;
  const color = itemColor(item);
  return `<span class="badge" style="background:${hexToRgba(color, 0.16)}; color:${color};"><span class="dot" style="background:${color};"></span>${escapeHtml(item.uraian)}</span>`;
}
function weatherBadge(condition) { return `<span class="badge status-${WEATHER_STATUS[condition]}"><span class="dot"></span>${WEATHER_LABEL[condition]}</span>`; }
function fuelBadge(type) { return type === "masuk" ? `<span class="badge fuel-masuk"><span class="dot"></span>Masuk</span>` : `<span class="badge fuel-keluar"><span class="dot"></span>Keluar</span>`; }
function equipmentTypeBadges(types) {
  if (!types || !types.length) return '<span class="muted">–</span>';
  return types.map((t) => `<span class="equip-badge">${escapeHtml(t)}</span>`).join("");
}
function renderEquipmentTypeCheckboxes(selected) {
  const sel = selected || [];
  $("#p-equipmentTypes").innerHTML = EQUIPMENT_TYPE_OPTIONS.map((t, i) => {
    const id = "peq-" + i;
    const checked = sel.includes(t) ? "checked" : "";
    return `<label for="${id}"><input type="checkbox" id="${id}" value="${escapeHtml(t)}" ${checked}>${escapeHtml(t)}</label>`;
  }).join("");
}
function getSelectedEquipmentTypes() {
  return $$('#p-equipmentTypes input[type="checkbox"]:checked').map((el) => el.value);
}

const els = {
  projectSelect: $("#projectSelect"),
  connBadge: $("#connBadge"),
  todayBadge: $("#todayBadge"),
  openAddBtn: $("#openAddBtn"),
  toast: $("#toast"),
};
function showToast(msg, isError) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("error", !!isError);
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2800);
}

function fillProjectSelects() {
  const selects = ["#projectSelect", "#produksiProjectFilter", "#ritasiProjectFilter", "#bbmProjectFilter", "#alatProjectFilter", "#manpowerProjectFilter", "#cuacaProjectFilter", "#dokumenProjectFilter", "#kontrakProjectFilter", "#isuProjectFilter",
    "#p-project", "#r-project", "#f-project", "#a-project", "#m-project", "#w-project", "#d-project", "#k-project", "#isu-project"];
  selects.forEach((sel) => { $(sel).innerHTML = ""; });
  ["#produksiProjectFilter", "#ritasiProjectFilter", "#bbmProjectFilter", "#alatProjectFilter", "#manpowerProjectFilter", "#cuacaProjectFilter", "#dokumenProjectFilter", "#isuProjectFilter"].forEach((sel) => {
    $(sel).add(new Option("Semua Proyek", "all"));
  });
  PROJECTS.forEach((p) => { selects.forEach((sel) => $(sel).add(new Option(p.name, p.id))); });
  if (state.projectId) {
    $("#projectSelect").value = state.projectId;
    ["#p-project", "#r-project", "#f-project", "#a-project", "#m-project", "#w-project", "#d-project", "#k-project", "#isu-project", "#kontrakProjectFilter"].forEach((sel) => ($(sel).value = state.projectId));
  }
  ["#produksiProjectFilter", "#ritasiProjectFilter", "#bbmProjectFilter", "#alatProjectFilter", "#manpowerProjectFilter", "#cuacaProjectFilter", "#dokumenProjectFilter", "#isuProjectFilter"].forEach((sel) => ($(sel).value = "all"));
  $("#jabatanOptions").innerHTML = JABATAN_POOL.map((j) => `<option value="${escapeHtml(j.jabatan)}"></option>`).join("");
  $("#r-unit").innerHTML = DT_UNIT_LIST.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join("");
  populateFuelEquipmentOptions(false);
  const ritasiUnitFilterEl = $("#ritasiUnitFilter");
  if (ritasiUnitFilterEl) {
    ritasiUnitFilterEl.innerHTML = '<option value="all">Semua Unit DT</option>' + DT_UNIT_LIST.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join("");
  }
  $("#a-nama").innerHTML = ALAT_MASTER_LIST.map((a) => `<option value="${escapeHtml(a.nama)}">${escapeHtml(a.nama)}</option>`).join("");
  const alatJenisFilterEl = $("#alatJenisFilter");
  if (alatJenisFilterEl) {
    const jenisList = [...new Set(ALAT_MASTER_LIST.map((a) => a.jenis))];
    alatJenisFilterEl.innerHTML = '<option value="all">Semua Jenis</option>' + jenisList.map((j) => `<option value="${escapeHtml(j)}">${escapeHtml(j)}</option>`).join("");
  }
}

els.todayBadge.textContent = "Hari ini: " + fmtDateLong(todayISO());
els.openAddBtn.disabled = false;

/* ---------------------------------------------------------------------
   View switching
--------------------------------------------------------------------- */
const ADD_BUTTON_LABEL = { overview: null, produksi: "+ Tambah Produksi", ritasi: "+ Tambah Ritasi DT", bbm: "+ Tambah BBM", alat: "+ Tambah Alat", manpower: "+ Tambah Manpower", cuaca: "+ Tambah Cuaca", dokumen: "+ Upload Dokumen", isu: "+ Tambah Isu", kontrak: "+ Tambah Item Kontrak" };
const VIEW_TITLE = { overview: "Beranda", produksi: "Laporan Produksi Harian", ritasi: "Laporan Ritasi Dump Truck (DT)", bbm: "Laporan BBM", alat: "Tabulasi Status Alat", manpower: "Tabulasi Manpower", cuaca: "Laporan Cuaca Harian", dokumen: "Dokumen", isu: "Catatan Isu Eksternal, Internal & K3", kontrak: "Realisasi Progres S.d Ini" };
const MODAL_OPENER_FOR_VIEW = { produksi: (r) => openProduksiModal(r), ritasi: (r) => openRitasiModal(r), bbm: (r) => openBbmModal(r), alat: (r) => openAlatModal(r), manpower: (r) => openManpowerModal(r), cuaca: (r) => openCuacaModal(r), isu: (r) => openIsuModal(r), kontrak: (r) => openKontrakModal(r) };
const MODAL_EDIT_KEY = { "modal-produksi": "produksi", "modal-ritasi": "ritasi", "modal-bbm": "bbm", "modal-alat": "alat", "modal-manpower": "manpower", "modal-cuaca": "cuaca", "modal-isu": "isu", "modal-kontrak": "kontrak" };

function setView(view) {
  state.view = view;
  $$(".navlink").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view-section").forEach((s) => s.classList.toggle("active", s.id === "view-" + view));
  if (ADD_BUTTON_LABEL[view]) {
    els.openAddBtn.style.display = "";
    els.openAddBtn.textContent = ADD_BUTTON_LABEL[view];
  } else {
    els.openAddBtn.style.display = "none";
  }
}
$$(".navlink").forEach((btn) => btn.addEventListener("click", () => { setView(btn.dataset.view); $(".sidebar").classList.remove("open"); }));

$("#printReportBtn").addEventListener("click", () => {
  const project = PROJECTS.find((p) => p.id === state.projectId) || PROJECTS[0];
  const title = VIEW_TITLE[state.view] || "Laporan";
  $("#printHeader").innerHTML = `<div class="pr-title">${escapeHtml(project ? project.name : "")} — ${escapeHtml(title)}</div><div class="pr-meta">Dicetak pada ${fmtDateLong(todayISO())}</div>`;
  window.print();
});

// Tombol garis-3 (hamburger) di pojok kanan atas topbar — buka/tutup menu.
$("#menuToggleBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  $(".sidebar").classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!$(".sidebar").classList.contains("open")) return;
  if (e.target.closest(".sidebar") || e.target.closest("#menuToggleBtn")) return;
  $(".sidebar").classList.remove("open");
});

els.openAddBtn.addEventListener("click", () => {
  if (state.view === "dokumen") {
    if (state.dokFolder) $("#d-folder").value = state.dokFolder;
    updateFileSizeHint();
    openModal("modal-dokumen");
    return;
  }
  const opener = MODAL_OPENER_FOR_VIEW[state.view];
  if (opener) opener(null);
});

els.projectSelect.addEventListener("change", () => {
  state.projectId = els.projectSelect.value;
  ["#f-project", "#r-project", "#a-project", "#m-project", "#w-project", "#d-project", "#isu-project"].forEach((sel) => ($(sel).value = state.projectId));
  refreshAll();
});

/* ---------------------------------------------------------------------
   Modals
--------------------------------------------------------------------- */
function openModal(id) {
  const el = $("#" + id);
  el.classList.remove("hidden");
  const dateInput = el.querySelector('input[type="date"]');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();
}
function closeModal(el) {
  el.classList.add("hidden");
  const form = el.querySelector("form");
  if (form) form.reset();
  const err = el.querySelector(".form-error");
  if (err) err.style.display = "none";
  const key = MODAL_EDIT_KEY[el.id];
  if (key) editing[key] = null;
}
$$(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });
  overlay.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => closeModal(overlay)));
});

/* ---------------------------------------------------------------------
   Ringkasan (overview) + foto proyek
--------------------------------------------------------------------- */
let productionChart, fuelChart;
function todaysRows(rows) { const t = todayISO(); return rows.filter((r) => r.date === t); }

function fuelStockForProject(projectId) {
  const rows = fuel.filter((r) => r.projectId === projectId);
  let masuk = 0, keluar = 0;
  rows.forEach((r) => { if (r.type === "masuk") masuk += r.liters; else keluar += r.liters; });
  const saldoAwal = fuelOpeningBalance[projectId] || 0;
  return { masuk, keluar, saldoAwal, saldo: saldoAwal + masuk - keluar };
}

function updateProjectHero() {
  const project = PROJECTS.find((p) => p.id === state.projectId);
  if (!project) return;
  const idx = PROJECTS.findIndex((p) => p.id === project.id);
  const hero = $("#projectHero");
  const photos = projectPhotos[project.id] || [];
  let curIdx = heroPhotoIndex[project.id] || 0;
  if (curIdx >= photos.length) curIdx = Math.max(photos.length - 1, 0);
  heroPhotoIndex[project.id] = curIdx;
  const photo = photos[curIdx];
  hero.style.backgroundImage = photo ? `url("${photo.url}")` : PROJECT_GRADIENTS[idx % PROJECT_GRADIENTS.length];
  $("#heroPrevBtn").classList.toggle("hidden", photos.length < 2);
  $("#heroNextBtn").classList.toggle("hidden", photos.length < 2);
  $("#heroDots").innerHTML = photos.length > 1
    ? photos.map((_, i) => `<span class="dot-ind${i === curIdx ? " active" : ""}"></span>`).join("")
    : "";
  $("#managePhotoBtn").classList.toggle("hidden", photos.length < 1);
}

$("#changePhotoBtn").addEventListener("click", () => $("#projectPhotoInput").click());
$("#projectPhotoInput").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const fd = new FormData();
  fd.append("projectId", state.projectId);
  files.forEach((file) => fd.append("files", file));
  try {
    const res = await apiFetch("/api/photos", { method: "POST", body: fd });
    if (!projectPhotos[state.projectId]) projectPhotos[state.projectId] = [];
    const startIdx = projectPhotos[state.projectId].length;
    projectPhotos[state.projectId].push(...res.photos);
    heroPhotoIndex[state.projectId] = startIdx; // langsung tampilkan foto baru yang pertama ditambahkan
    updateProjectHero();
    showToast(files.length > 1 ? `${files.length} foto proyek ditambahkan.` : "Foto proyek ditambahkan.");
  } catch (err) {
    showToast(err.message || "Gagal upload foto proyek.", true);
  }
  e.target.value = "";
});

$("#heroPrevBtn").addEventListener("click", () => {
  const photos = projectPhotos[state.projectId] || [];
  if (photos.length < 2) return;
  heroPhotoIndex[state.projectId] = ((heroPhotoIndex[state.projectId] || 0) - 1 + photos.length) % photos.length;
  updateProjectHero();
});
$("#heroNextBtn").addEventListener("click", () => {
  const photos = projectPhotos[state.projectId] || [];
  if (photos.length < 2) return;
  heroPhotoIndex[state.projectId] = ((heroPhotoIndex[state.projectId] || 0) + 1) % photos.length;
  updateProjectHero();
});

// Auto-geser foto Beranda tiap 5 detik kalau proyek yang aktif punya lebih
// dari 1 foto (tidak ngapa-ngapain kalau cuma 1 foto atau tidak ada).
let heroAutoplayTimer = null;
function startHeroAutoplay() {
  if (heroAutoplayTimer) clearInterval(heroAutoplayTimer);
  heroAutoplayTimer = setInterval(() => {
    const photos = projectPhotos[state.projectId] || [];
    if (photos.length < 2) return;
    heroPhotoIndex[state.projectId] = ((heroPhotoIndex[state.projectId] || 0) + 1) % photos.length;
    updateProjectHero();
  }, 5000);
}

/* ---- Kelola Foto Proyek (lihat semua, pilih mana yang tampil, hapus) ---- */
function renderFotoPickerGrid() {
  const photos = projectPhotos[state.projectId] || [];
  const curIdx = heroPhotoIndex[state.projectId] || 0;
  const grid = $("#fotoPickerGrid");
  $("#fotoPickerEmpty").classList.toggle("hidden", photos.length > 0);
  const canDelete = state.pengelolaRole === "owner";
  grid.innerHTML = photos.map((p, i) => `
    <div class="foto-picker-item${i === curIdx ? " active" : ""}" style="background-image:url('${p.url}')" data-idx="${i}" title="Klik untuk tampilkan foto ini">
      ${i === curIdx ? '<span class="foto-picker-badge">Tampil</span>' : ""}
      ${canDelete ? `<button type="button" class="foto-picker-del" data-idx="${i}" title="Hapus foto ini" aria-label="Hapus foto ini">🗑️</button>` : ""}
    </div>
  `).join("");
}
$("#managePhotoBtn").addEventListener("click", () => {
  renderFotoPickerGrid();
  openModal("modal-foto-proyek");
});
$("#fotoPickerGrid").addEventListener("click", async (e) => {
  const delBtn = e.target.closest(".foto-picker-del");
  const item = e.target.closest(".foto-picker-item");
  if (delBtn) {
    e.stopPropagation();
    const i = Number(delBtn.dataset.idx);
    const photos = projectPhotos[state.projectId] || [];
    const photo = photos[i];
    if (!photo) return;
    if (!confirm("Hapus foto ini dari proyek? Tindakan ini tidak bisa dibatalkan.")) return;
    delBtn.disabled = true;
    try {
      await apiFetch(`/api/photos/${photo.id}`, { method: "DELETE" });
      photos.splice(i, 1);
      let curIdx = heroPhotoIndex[state.projectId] || 0;
      if (curIdx >= photos.length) curIdx = Math.max(photos.length - 1, 0);
      heroPhotoIndex[state.projectId] = curIdx;
      updateProjectHero();
      renderFotoPickerGrid();
      showToast("Foto proyek dihapus.");
    } catch (err) {
      showToast(err.message || "Gagal menghapus foto.", true);
      delBtn.disabled = false;
    }
    return;
  }
  if (item) {
    const i = Number(item.dataset.idx);
    heroPhotoIndex[state.projectId] = i;
    updateProjectHero();
    renderFotoPickerGrid();
  }
});

function renderKpis() {
  const project = PROJECTS.find((p) => p.id === state.projectId);
  if (!project) return;
  $("#overviewTitle").textContent = "Beranda — " + project.name;
  updateProjectHero();

  const projProduction = production.filter((r) => r.projectId === state.projectId);
  const projEquipment = equipment.filter((r) => r.projectId === state.projectId);
  const projManpower = manpower.filter((r) => r.projectId === state.projectId);
  const projWeather = weather.filter((r) => r.projectId === state.projectId).slice().sort((a, b) => a.date.localeCompare(b.date));

  const todayProd = todaysRows(projProduction);
  const todayItemIds = [...new Set(todayProd.map((r) => r.kontrakItemId))];
  const todayItemNames = todayItemIds.map((id) => { const it = findKontrakItem(id); return it ? it.uraian : null; }).filter(Boolean);
  $("#kpiProduction").textContent = todayItemIds.length + " item";
  $("#kpiProductionSub").textContent = todayItemNames.length
    ? todayItemNames.slice(0, 2).join(", ") + (todayItemNames.length > 2 ? " +" + (todayItemNames.length - 2) + " lainnya" : "")
    : "Belum ada laporan hari ini";

  if (projEquipment.length) {
    const readyCount = projEquipment.filter((r) => r.status === "Ready").length;
    $("#kpiEquipment").textContent = readyCount + " / " + projEquipment.length;
    $("#kpiEquipmentBar").style.width = Math.round((readyCount / projEquipment.length) * 100) + "%";
    const perbaikanCount = projEquipment.filter((r) => r.status === "Perbaikan").length;
    $("#kpiEquipmentSub").textContent = perbaikanCount ? perbaikanCount + " unit dalam perbaikan" : "Semua unit ready/standby";
  } else {
    $("#kpiEquipment").textContent = "–"; $("#kpiEquipmentBar").style.width = "0%"; $("#kpiEquipmentSub").textContent = "Belum ada data";
  }

  if (projManpower.length) {
    const totalOrang = projManpower.reduce((s, r) => s + r.jumlahOrang, 0);
    $("#kpiManpower").textContent = fmtNum(totalOrang) + " orang";
    $("#kpiManpowerSub").textContent = projManpower.length + " jabatan";
  } else {
    $("#kpiManpower").textContent = "–"; $("#kpiManpowerSub").textContent = "Belum ada data";
  }

  const stock = fuelStockForProject(state.projectId);
  $("#kpiFuelStock").textContent = fmtNum(stock.saldo) + " L";
  $("#kpiFuelStockSub").textContent = "Masuk " + fmtNum(stock.masuk) + " L · Keluar " + fmtNum(stock.keluar) + " L";

  const kontrakProgress = overallKontrakProgress(state.projectId);
  $("#kpiKontrak").textContent = fmtNum2(kontrakProgress) + "%";
  $("#kpiKontrakSub").textContent = "Bobot tercapai dari kontrak";

  const latestWeather = projWeather[projWeather.length - 1];
  if (latestWeather) {
    $("#kpiWeather").innerHTML = weatherBadge(latestWeather.condition);
    const bits = [];
    if (latestWeather.rainfallMm) bits.push(fmtNum(latestWeather.rainfallMm) + " mm hujan");
    if (latestWeather.hoursLost) bits.push(fmtNum(latestWeather.hoursLost) + " jam terhambat");
    $("#kpiWeatherSub").textContent = (bits.length ? bits.join(", ") + " · " : "") + fmtDateLong(latestWeather.date);
  } else {
    $("#kpiWeather").textContent = "–"; $("#kpiWeatherSub").textContent = "Belum ada data";
  }

  const todayRitasi = todaysRows(ritasi.filter((r) => r.projectId === state.projectId));
  const ritasiCount = todayRitasi.reduce((s, r) => s + r.count, 0);
  const ritasiVolume = todayRitasi.reduce((s, r) => s + r.count * r.capacity, 0);
  $("#kpiRitasi").textContent = fmtNum(ritasiCount) + " rit";
  $("#kpiRitasiSub").textContent = ritasiCount ? fmtNum(ritasiVolume) + " M3 hari ini" : "Belum ada data hari ini";

  renderGalianSolar();
}

/* ---------------------------------------------------------------------
   Rasio Galian vs Pemakaian Solar (beranda)

   "Galian" tidak disimpan sebagai kategori tersendiri di database — jenis
   pekerjaan di Produksi Harian selalu mengacu ke item BOQ/kontrak. Jadi item
   yang dianggap galian dikenali otomatis dari uraiannya: semua item yang
   mengandung kata "galian" ikut digabung (mis. "Penggalian tanah biasa dan
   pengangkutan…" dan "Galian batu lunak"), tanpa peduli jenis galiannya apa.

   Solar = total BBM Keluar (pemakaian alat) kumulatif dari awal sampai saat
   ini. BBM Masuk & Saldo Awal sengaja tidak dipakai — yang dibandingkan
   adalah solar yang benar-benar terpakai.

   Ritasi DT sengaja TIDAK ikut dijumlahkan, sama seperti perhitungan progress
   kontrak, supaya volume tidak dobel hitung.
--------------------------------------------------------------------- */
const GALIAN_URAIAN_RE = /galian/i;

function isGalianItem(item) {
  return !!item && GALIAN_URAIAN_RE.test(item.uraian || "");
}

function galianSolarStats(projectId) {
  const items = kontrak
    .filter((k) => k.projectId === projectId && isGalianItem(k))
    .slice()
    .sort((a, b) => a.no - b.no);
  const ids = new Set(items.map((k) => k.id));

  const perItem = {};
  items.forEach((k) => { perItem[k.id] = 0; });

  let galian = 0;
  production.forEach((r) => {
    if (r.projectId !== projectId || !ids.has(r.kontrakItemId)) return;
    galian += r.volume;
    perItem[r.kontrakItemId] += r.volume;
  });

  const solar = fuel
    .filter((r) => r.projectId === projectId && r.type === "keluar")
    .reduce((s, r) => s + r.liters, 0);

  // Satuan: pakai satuan item galian kalau semuanya sama (biasanya M3).
  const satuanSet = [...new Set(items.map((k) => (k.satuan || "").trim()).filter(Boolean))];
  const unit = satuanSet.length === 1 ? satuanSet[0] : "M3";

  return {
    items, perItem, unit, galian, solar,
    volPerLiter: solar > 0 ? galian / solar : null,
    literPerVol: galian > 0 ? solar / galian : null,
  };
}

function renderGalianSolar() {
  const s = galianSolarStats(state.projectId);
  const u = s.unit;
  const hasGalian = s.galian > 0;
  const hasSolar = s.solar > 0;

  // --- Tile KPI ---
  if (hasGalian && hasSolar) {
    $("#kpiGalianSolar").textContent = fmtNum2(s.volPerLiter) + " " + u + "/L";
    $("#kpiGalianSolarSub").textContent =
      "Galian " + fmtNum(s.galian) + " " + u + " · Solar " + fmtNum(s.solar) + " L";
  } else {
    $("#kpiGalianSolar").textContent = "–";
    $("#kpiGalianSolarSub").textContent = !s.items.length
      ? "Belum ada item galian di kontrak"
      : (!hasGalian ? "Belum ada produksi galian" : "Belum ada pemakaian solar");
  }

  // --- Kartu perbandingan ---
  $("#gsGalianValue").innerHTML = s.items.length
    ? fmtNum(s.galian) + '<span class="unit">' + escapeHtml(u) + "</span>"
    : "–";
  $("#gsGalianSub").textContent = !s.items.length
    ? 'Tidak ada item kontrak yang uraiannya mengandung kata "galian"'
    : (hasGalian
        ? "Kumulatif dari " + s.items.length + " item galian di Produksi Harian"
        : "Belum ada volume galian di Produksi Harian (" + s.items.length + " item galian terdaftar)");

  $("#gsSolarValue").innerHTML = fmtNum(s.solar) + '<span class="unit">Liter</span>';
  $("#gsSolarSub").textContent = hasSolar
    ? "Kumulatif BBM Keluar (pemakaian alat) s.d saat ini"
    : "Belum ada catatan BBM keluar di menu BBM";

  if (hasGalian && hasSolar) {
    $("#gsRatioMain").textContent =
      "Total Galian : Total Solar = " + fmtNum2(s.volPerLiter) + " " + u + " : 1 Liter";
    $("#gsRatioAlt").textContent =
      "Artinya tiap 1 Liter solar menghasilkan ± " + fmtNum2(s.volPerLiter) + " " + u +
      " galian · atau tiap 1 " + u + " galian butuh ± " + fmtNum2(s.literPerVol) + " Liter solar.";
  } else {
    $("#gsRatioMain").textContent = "–";
    $("#gsRatioAlt").textContent =
      "Rasio baru muncul setelah ada volume galian di Produksi Harian dan catatan BBM keluar di menu BBM.";
  }

  // --- Rincian item galian yang ikut dihitung ---
  $("#gsItemChips").innerHTML = s.items.length
    ? s.items.map((k) => {
        const vol = s.perItem[k.id] || 0;
        const share = s.galian > 0 ? (vol / s.galian) * 100 : 0;
        const color = itemColor(k);
        return '<span class="ratio-chip" style="border-color:' + hexToRgba(color, 0.55) + ';">' +
          '<span class="dot" style="display:inline-block; width:7px; height:7px; border-radius:50%; background:' + color + '; margin-right:6px;"></span>' +
          escapeHtml(k.uraian) + ' — <b>' + fmtNum(vol) + " " + escapeHtml(k.satuan || u) + "</b>" +
          (s.galian > 0 ? " (" + fmtNum2(share) + "%)" : "") +
          "</span>";
      }).join("")
    : "";

  $("#gsNote").textContent = s.items.length
    ? 'Item galian dikenali otomatis dari uraian item kontrak yang mengandung kata "galian" — semua jenis galian digabung jadi satu total. Volume diambil dari Produksi Harian (Ritasi DT tidak ikut dijumlahkan supaya tidak dobel hitung). Solar diambil dari total BBM Keluar; BBM Masuk dan Saldo Awal tidak dihitung karena yang dibandingkan adalah solar yang benar-benar terpakai.'
    : 'Belum ada item di menu Kontrak yang uraiannya mengandung kata "galian". Tambahkan/ubah item BOQ (mis. "Galian batu lunak" atau "Penggalian tanah biasa") supaya rasio ini bisa dihitung otomatis.';
}

function renderProductionChart() {
  const rows = computeKontrakRows(state.projectId);
  const labels = rows.map((r) => (r.uraian.length > 32 ? r.uraian.slice(0, 30) + "…" : r.uraian));
  const data = rows.map((r) => Math.round(r.pctItem * 10) / 10);
  const colors = rows.map((r) => itemColor(r));

  if (productionChart) productionChart.destroy();
  productionChart = new Chart($("#productionChart"), {
    type: "bar",
    data: { labels, datasets: [{ label: "% Tercapai", data, backgroundColor: colors, borderRadius: 4, maxBarThickness: 22 }] },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#232320", padding: 10, cornerRadius: 4, callbacks: { label: (c) => c.parsed.x + "% tercapai dari volume kontrak" } },
      },
      scales: {
        x: { min: 0, max: 100, grid: { color: "#2c2c2a" }, ticks: { color: "#898781", callback: (v) => v + "%" } },
        y: { grid: { display: false }, ticks: { color: "#c3c2b7", font: { size: 11 } } },
      },
    },
  });
}

function renderFuelChart() {
  const rows = fuel.filter((r) => r.projectId === state.projectId);
  const byDate = {};
  rows.forEach((r) => {
    byDate[r.date] = byDate[r.date] || { masuk: 0, keluar: 0 };
    byDate[r.date][r.type] += r.liters;
  });
  const dates = Object.keys(byDate).sort().slice(-14);
  const labels = dates.map(fmtDateLong);
  const masukData = dates.map((d) => Math.round(byDate[d].masuk));
  const keluarData = dates.map((d) => Math.round(byDate[d].keluar));

  if (fuelChart) fuelChart.destroy();
  fuelChart = new Chart($("#fuelChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Masuk (L)", data: masukData, backgroundColor: "#0ca30c", borderRadius: 4, maxBarThickness: 20 },
        { label: "Keluar (L)", data: keluarData, backgroundColor: "#eb6834", borderRadius: 4, maxBarThickness: 20 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", align: "end", labels: { boxWidth: 10, boxHeight: 10, color: "#c3c2b7", usePointStyle: true, pointStyle: "rect" } },
        tooltip: { backgroundColor: "#232320", padding: 10, cornerRadius: 4, callbacks: { label: (c) => c.dataset.label + ": " + c.parsed.y + " L" } },
      },
      scales: {
        y: { grid: { color: "#2c2c2a" }, ticks: { color: "#898781" } },
        x: { grid: { display: false }, ticks: { color: "#898781", maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
      },
    },
  });
}

function renderIssues() {
  const items = [];
  production.filter((r) => r.projectId === state.projectId && r.notes).forEach((r) => {
    items.push({ date: r.date, badge: itemBadge(findKontrakItem(r.kontrakItemId)), text: r.notes, sortKey: r.date + "b" });
  });
  weather.filter((r) => r.projectId === state.projectId && (r.condition === "hujan_lebat" || (r.hoursLost && r.hoursLost > 0))).forEach((r) => {
    items.push({ date: r.date, badge: weatherBadge(r.condition), text: r.notes || "Cuaca menghambat pekerjaan", sortKey: r.date + "a" });
  });
  items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  const top = items.slice(0, 6);

  if (top.length === 0) {
    $("#issuesList").innerHTML = `<div class="empty-note">Tidak ada catatan/kendala untuk proyek ini.</div>`;
    return;
  }
  $("#issuesList").innerHTML = top.map((it) => `
    <div class="issue-item">
      ${it.badge}
      <div>
        <div class="issue-meta">${fmtDateLong(it.date)}</div>
        <div class="issue-text">${escapeHtml(it.text)}</div>
      </div>
    </div>
  `).join("");
}

/* ---------------------------------------------------------------------
   Produksi Harian — jenis pekerjaan = item Realisasi Progres S.d ini proyek terpilih
--------------------------------------------------------------------- */
function populateProduksiWorkTypeOptions(projectId, selectedId) {
  const items = kontrak.filter((k) => k.projectId === projectId).slice().sort((a, b) => a.no - b.no);
  $("#p-workType").innerHTML = items.map((k) => `<option value="${k.id}">${k.no}. ${escapeHtml(k.uraian)}</option>`).join("");
  const validIds = items.map((k) => k.id);
  const useId = selectedId && validIds.includes(selectedId) ? selectedId : (items[0] ? items[0].id : "");
  $("#p-workType").value = useId;
  updateProduksiUnitField();
}
function updateProduksiUnitField() {
  const item = findKontrakItem(Number($("#p-workType").value));
  $("#p-unit").value = item ? item.satuan : "";
}
$("#p-workType").addEventListener("change", updateProduksiUnitField);
$("#p-project").addEventListener("change", () => populateProduksiWorkTypeOptions($("#p-project").value, null));

function produksiTypeFilterOptions() {
  const projFilter = $("#produksiProjectFilter").value;
  const items = projFilter === "all" ? kontrak.slice() : kontrak.filter((k) => k.projectId === projFilter);
  return [...new Set(items.map((k) => k.uraian))];
}
function populateProduksiTypeFilter() {
  const current = $("#produksiTypeFilter").value;
  const options = produksiTypeFilterOptions();
  $("#produksiTypeFilter").innerHTML = '<option value="all">Semua Jenis Pekerjaan</option>' + options.map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join("");
  $("#produksiTypeFilter").value = options.includes(current) ? current : "all";
}

function renderProduksiTable() {
  const projFilter = $("#produksiProjectFilter").value;
  const typeFilter = $("#produksiTypeFilter").value;
  const q = $("#produksiSearch").value.trim().toLowerCase();
  let rows = production.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (typeFilter !== "all") rows = rows.filter((r) => { const item = findKontrakItem(r.kontrakItemId); return item && item.uraian === typeFilter; });
  if (q) rows = rows.filter((r) => (r.zona + " " + r.equipment + " " + r.notes).toLowerCase().includes(q));
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  $("#produksiSubtitle").textContent = rows.length + " laporan ditemukan";
  if (rows.length === 0) {
    $("#produksiTbody").innerHTML = `<tr><td colspan="7" class="empty-note">Tidak ada laporan yang cocok.</td></tr>`;
    return;
  }
  $("#produksiTbody").innerHTML = rows.map((r) => {
    const item = findKontrakItem(r.kontrakItemId);
    const unit = item ? item.satuan : r.unit;
    return `
    <tr>
      <td>${fmtDateLong(r.date)}</td>
      <td>${itemBadge(item)}</td>
      <td>${fmtNum(r.volume)} ${escapeHtml(unit || "")}</td>
      <td>${escapeHtml(r.zona) || '<span class="muted">–</span>'}</td>
      <td>${equipmentTypeBadges(r.equipmentTypes)}${r.equipment ? `<div class="sub" style="margin-top:4px;">${escapeHtml(r.equipment)}</div>` : ""}</td>
      <td>${escapeHtml(r.notes) || '<span class="muted">–</span>'}</td>
      <td><button class="edit-btn" data-kind="production" data-id="${r.id}">Edit</button><button class="del-btn" data-kind="production" data-id="${r.id}">Hapus</button></td>
    </tr>
  `;
  }).join("");
}

function openProduksiModal(row) {
  editing.produksi = row ? row.id : null;
  const projectId = row ? row.projectId : state.projectId;
  $("#produksi-modal-title").textContent = row ? "Edit Laporan Produksi" : "Tambah Laporan Produksi";
  $("#p-submit").textContent = row ? "Simpan Perubahan" : "Simpan";
  $("#p-project").value = projectId;
  $("#p-date").value = row ? row.date : todayISO();
  populateProduksiWorkTypeOptions(projectId, row ? row.kontrakItemId : null);
  $("#p-volume").value = row ? row.volume : "";
  $("#p-zona").value = row ? row.zona : "";
  renderEquipmentTypeCheckboxes(row ? row.equipmentTypes : []);
  $("#p-equipment").value = row ? row.equipment : "";
  $("#p-notes").value = row ? row.notes : "";
  $("#modal-produksi").classList.remove("hidden");
}

$("#form-produksi").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    projectId: $("#p-project").value, kontrakItemId: Number($("#p-workType").value), date: $("#p-date").value,
    volume: Number($("#p-volume").value), unit: $("#p-unit").value, zona: $("#p-zona").value,
    equipmentTypes: getSelectedEquipmentTypes(), equipment: $("#p-equipment").value, notes: $("#p-notes").value,
  };
  try {
    if (editing.produksi) {
      const updated = await apiUpdate("production", editing.produksi, data);
      Object.assign(production.find((r) => r.id === editing.produksi), updated);
      showToast("Laporan produksi diperbarui.");
    } else {
      production.push(await apiCreate("production", data));
      showToast("Laporan produksi disimpan.");
    }
    closeModal($("#modal-produksi"));
    refreshAll();
  } catch (err) {
    showToast(err.message || "Gagal menyimpan laporan produksi.", true);
  }
});

/* ---------------------------------------------------------------------
   Ritasi Dump Truck (DT)
   Catatan: volume ritasi TIDAK otomatis ditambahkan ke Realisasi Progress
   S.d ini (kontrak) — supaya tidak dobel hitung dengan Produksi Harian.
   "Jenis Pekerjaan" di sini sifatnya opsional, hanya untuk pengelompokan.
--------------------------------------------------------------------- */
function populateRitasiWorkTypeOptions(projectId, selectedId) {
  const items = kontrak.filter((k) => k.projectId === projectId).slice().sort((a, b) => a.no - b.no);
  const options = ['<option value="">– Tidak dikaitkan ke item kontrak –</option>']
    .concat(items.map((k) => `<option value="${k.id}">${k.no}. ${escapeHtml(k.uraian)}</option>`));
  $("#r-workType").innerHTML = options.join("");
  $("#r-workType").value = selectedId ? String(selectedId) : "";
}
$("#r-project").addEventListener("change", () => populateRitasiWorkTypeOptions($("#r-project").value, null));

function updateRitasiTotalField() {
  const count = Number($("#r-count").value) || 0;
  const capacity = Number($("#r-capacity").value) || 0;
  $("#r-total").value = fmtNum(count * capacity) + " M3";
}
$("#r-count").addEventListener("input", updateRitasiTotalField);
$("#r-capacity").addEventListener("input", updateRitasiTotalField);

function renderRitasiSummary() {
  const projFilter = $("#ritasiProjectFilter").value;
  const rows = projFilter === "all" ? ritasi.slice() : ritasi.filter((r) => r.projectId === projFilter);
  const todayRows = todaysRows(rows);
  const totalCount = todayRows.reduce((s, r) => s + r.count, 0);
  const totalVolume = todayRows.reduce((s, r) => s + r.count * r.capacity, 0);
  const units = new Set(todayRows.map((r) => r.unit));
  const cumulativeCount = rows.reduce((s, r) => s + r.count, 0);
  const cumulativeVolume = rows.reduce((s, r) => s + r.count * r.capacity, 0);
  $("#ritasiTotalToday").textContent = fmtNum(totalCount) + " rit";
  $("#ritasiTotalCumulative").textContent = fmtNum(cumulativeCount) + " rit";
  $("#ritasiVolumeToday").textContent = fmtNum(totalVolume) + " M3";
  $("#ritasiVolumeCumulative").textContent = fmtNum(cumulativeVolume) + " M3";
  $("#ritasiUnitsToday").textContent = units.size;

  // Ritasi kumulatif per unit DT terpilih — dari awal sampai akhir project (semua tanggal).
  const unitFilter = $("#ritasiUnitFilter").value;
  if (unitFilter && unitFilter !== "all") {
    const unitRows = rows.filter((r) => r.unit === unitFilter);
    const unitCount = unitRows.reduce((s, r) => s + r.count, 0);
    const unitVolume = unitRows.reduce((s, r) => s + r.count * r.capacity, 0);
    $("#ritasiUnitSummary").classList.remove("hidden");
    $("#ritasiUnitCumulativeCount").textContent = fmtNum(unitCount) + " rit";
    $("#ritasiUnitCumulativeSub").textContent = unitFilter + " · Total volume " + fmtNum(unitVolume) + " M3 · " + unitRows.length + " catatan";
  } else {
    $("#ritasiUnitSummary").classList.add("hidden");
  }
}

function renderRitasiTable() {
  const projFilter = $("#ritasiProjectFilter").value;
  const unitFilter = $("#ritasiUnitFilter").value;
  const q = $("#ritasiSearch").value.trim().toLowerCase();
  let rows = ritasi.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (unitFilter && unitFilter !== "all") rows = rows.filter((r) => r.unit === unitFilter);
  if (q) rows = rows.filter((r) => (r.unit + " " + r.notes).toLowerCase().includes(q));
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  renderRitasiSummary();
  $("#ritasiSubtitle").textContent = rows.length + " catatan ritasi ditemukan";
  if (rows.length === 0) {
    $("#ritasiTbody").innerHTML = `<tr><td colspan="8" class="empty-note">Belum ada catatan ritasi DT.</td></tr>`;
    return;
  }
  $("#ritasiTbody").innerHTML = rows.map((r) => {
    const item = r.kontrakItemId ? findKontrakItem(r.kontrakItemId) : null;
    return `
    <tr>
      <td>${fmtDateLong(r.date)}</td>
      <td><b>${escapeHtml(r.unit)}</b></td>
      <td>${item ? itemBadge(item) : '<span class="muted">–</span>'}</td>
      <td>${fmtNum(r.count)}</td>
      <td>${fmtNum(r.capacity)}</td>
      <td>${fmtNum(r.count * r.capacity)}</td>
      <td>${escapeHtml(r.notes) || '<span class="muted">–</span>'}</td>
      <td><button class="edit-btn" data-kind="ritasi" data-id="${r.id}">Edit</button><button class="del-btn" data-kind="ritasi" data-id="${r.id}">Hapus</button></td>
    </tr>
  `;
  }).join("");
}

function openRitasiModal(row) {
  editing.ritasi = row ? row.id : null;
  const projectId = row ? row.projectId : state.projectId;
  $("#ritasi-modal-title").textContent = row ? "Edit Ritasi DT" : "Tambah Ritasi DT";
  $("#r-submit").textContent = row ? "Simpan Perubahan" : "Simpan";
  $("#r-project").value = projectId;
  $("#r-date").value = row ? row.date : todayISO();
  if (row) { $("#r-unit").value = row.unit; } else { $("#r-unit").selectedIndex = 0; }
  populateRitasiWorkTypeOptions(projectId, row ? row.kontrakItemId : null);
  $("#r-count").value = row ? row.count : "";
  $("#r-capacity").value = row ? row.capacity : 6;
  $("#r-notes").value = row ? row.notes : "";
  updateRitasiTotalField();
  $("#modal-ritasi").classList.remove("hidden");
}

$("#form-ritasi").addEventListener("submit", async (e) => {
  e.preventDefault();
  const workTypeVal = $("#r-workType").value;
  const data = {
    projectId: $("#r-project").value, date: $("#r-date").value, unit: $("#r-unit").value,
    kontrakItemId: workTypeVal ? Number(workTypeVal) : null,
    count: Number($("#r-count").value), capacity: Number($("#r-capacity").value), notes: $("#r-notes").value,
  };
  try {
    if (editing.ritasi) {
      const updated = await apiUpdate("ritasi", editing.ritasi, data);
      Object.assign(ritasi.find((r) => r.id === editing.ritasi), updated);
      showToast("Data ritasi DT diperbarui.");
    } else {
      ritasi.push(await apiCreate("ritasi", data));
      showToast("Data ritasi DT disimpan.");
    }
    closeModal($("#modal-ritasi"));
    refreshAll();
  } catch (err) {
    showToast(err.message || "Gagal menyimpan data ritasi DT.", true);
  }
});

/* ---------------------------------------------------------------------
   BBM (masuk / keluar / sisa stok)
--------------------------------------------------------------------- */
function populateFuelEquipmentOptions(isMasuk) {
  const opts = isMasuk ? FUEL_SOURCES : ALAT_MASTER_LIST.map((a) => a.nama);
  $("#f-equipment").innerHTML = opts.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
}
$("#f-type").addEventListener("change", (e) => {
  const isMasuk = e.target.value === "masuk";
  $("#f-equipment-label").textContent = isMasuk ? "Sumber / Pengiriman" : "Alat";
  populateFuelEquipmentOptions(isMasuk);
});

function openBbmModal(row) {
  editing.bbm = row ? row.id : null;
  $("#bbm-modal-title").textContent = row ? "Edit Data BBM" : "Tambah Data BBM";
  $("#f-submit").textContent = row ? "Simpan Perubahan" : "Simpan";
  $("#f-project").value = row ? row.projectId : state.projectId;
  $("#f-date").value = row ? row.date : todayISO();
  $("#f-type").value = row ? row.type : "keluar";
  $("#f-type").dispatchEvent(new Event("change"));
  $("#f-liters").value = row ? row.liters : "";
  if (row) { $("#f-equipment").value = row.equipment; } else { $("#f-equipment").selectedIndex = 0; }
  $("#f-notes").value = row ? row.notes : "";
  $("#modal-bbm").classList.remove("hidden");
}

function renderBbmStockSummary() {
  const projFilter = $("#bbmProjectFilter").value;
  if (projFilter !== "all") {
    const s = fuelStockForProject(projFilter);
    const todayRows = todaysRows(fuel.filter((r) => r.projectId === projFilter));
    const todayMasuk = todayRows.filter((r) => r.type === "masuk").reduce((sum, r) => sum + r.liters, 0);
    const todayKeluar = todayRows.filter((r) => r.type === "keluar").reduce((sum, r) => sum + r.liters, 0);
    $("#bbmStockSingle").classList.remove("hidden");
    $("#bbmStockAll").classList.add("hidden");
    $("#stockMasukToday").textContent = fmtNum(todayMasuk) + " L";
    $("#stockKeluarToday").textContent = fmtNum(todayKeluar) + " L";
    $("#stockSaldo").textContent = fmtNum(s.saldo) + " L";
    $("#stockMasukCumulative").textContent = fmtNum(s.masuk) + " L";
    $("#stockKeluarCumulative").textContent = fmtNum(s.keluar) + " L";
    $("#bbmSaldoAwalRow").classList.remove("hidden");
    if (document.activeElement !== $("#bbmSaldoAwalInput")) $("#bbmSaldoAwalInput").value = s.saldoAwal || "";
  } else {
    $("#bbmStockSingle").classList.add("hidden");
    $("#bbmStockAll").classList.remove("hidden");
    $("#bbmSaldoAwalRow").classList.add("hidden");
    $("#bbmStockAll").innerHTML = PROJECTS.map((p) => {
      const s = fuelStockForProject(p.id);
      return `<div class="stock-chip"><div class="name">${escapeHtml(p.name)}</div><div class="amount">${fmtNum(s.saldo)} L</div><div style="margin-top:4px; color:var(--muted);">Masuk s.d ini: ${fmtNum(s.masuk)} L · Pemakaian s.d ini: ${fmtNum(s.keluar)} L</div></div>`;
    }).join("");
  }
}

// Tabulasi total pemakaian BBM per alat, dari awal s.d saat ini — dipakai untuk
// tampilan pemberitahuan di halaman ini dan sebagai sumber Download Excel.
function bbmPerAlatTotals(projFilter) {
  const rows = projFilter === "all" ? fuel.slice() : fuel.filter((r) => r.projectId === projFilter);
  const keluarRows = rows.filter((r) => r.type === "keluar");
  const totals = new Map();
  keluarRows.forEach((r) => { totals.set(r.equipment, (totals.get(r.equipment) || 0) + r.liters); });
  const list = ALAT_MASTER_LIST.map((a) => ({ nama: a.nama, jenis: a.jenis, total: totals.get(a.nama) || 0 }));
  list.sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama));
  return list;
}

function renderBbmPerAlatTable() {
  const projFilter = $("#bbmProjectFilter").value;
  const list = bbmPerAlatTotals(projFilter);
  $("#bbmPerAlatTbody").innerHTML = list.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><b>${escapeHtml(r.nama)}</b></td>
      <td>${escapeHtml(r.jenis)}</td>
      <td>${r.total ? fmtNum(r.total) + " L" : '<span class="muted">0 L</span>'}</td>
    </tr>
  `).join("");
}

function renderBbmTable() {
  const projFilter = $("#bbmProjectFilter").value;
  const typeFilter = $("#bbmTypeFilter").value;
  const q = $("#bbmSearch").value.trim().toLowerCase();

  renderBbmStockSummary();
  renderBbmPerAlatTable();

  const saldoAfterById = {};
  PROJECTS.forEach((p) => {
    const chrono = fuel.filter((r) => r.projectId === p.id).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    let running = fuelOpeningBalance[p.id] || 0;
    chrono.forEach((r) => {
      running += r.type === "masuk" ? r.liters : -r.liters;
      saldoAfterById[r.id] = running;
    });
  });

  let rows = fuel.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (typeFilter !== "all") rows = rows.filter((r) => r.type === typeFilter);
  if (q) rows = rows.filter((r) => (r.equipment + " " + r.notes).toLowerCase().includes(q));
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  $("#bbmSubtitle").textContent = rows.length + " data ditemukan";
  if (rows.length === 0) {
    $("#bbmTbody").innerHTML = `<tr><td colspan="7" class="empty-note">Tidak ada data yang cocok.</td></tr>`;
    return;
  }
  $("#bbmTbody").innerHTML = rows.map((r) => `
    <tr>
      <td>${fmtDateLong(r.date)}</td>
      <td>${fuelBadge(r.type)}</td>
      <td>${escapeHtml(r.equipment)}</td>
      <td>${fmtNum(r.liters)} L</td>
      <td>${fmtNum(saldoAfterById[r.id] ?? 0)} L</td>
      <td>${escapeHtml(r.notes) || '<span class="muted">–</span>'}</td>
      <td><button class="edit-btn" data-kind="fuel" data-id="${r.id}">Edit</button><button class="del-btn" data-kind="fuel" data-id="${r.id}">Hapus</button></td>
    </tr>
  `).join("");
}

$("#form-bbm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    projectId: $("#f-project").value, date: $("#f-date").value, type: $("#f-type").value,
    equipment: $("#f-equipment").value, liters: Number($("#f-liters").value), notes: $("#f-notes").value,
  };
  try {
    if (editing.bbm) {
      const updated = await apiUpdate("fuel", editing.bbm, data);
      Object.assign(fuel.find((r) => r.id === editing.bbm), updated);
      showToast("Data BBM diperbarui.");
    } else {
      fuel.push(await apiCreate("fuel", data));
      showToast("Data BBM disimpan.");
    }
    closeModal($("#modal-bbm"));
    refreshAll();
  } catch (err) {
    showToast(err.message || "Gagal menyimpan data BBM.", true);
  }
});

/* ---------------------------------------------------------------------
   Alat
--------------------------------------------------------------------- */
const ALAT_STATUS_BADGE = { Ready: "status-good", Perbaikan: "status-critical", Standby: "status-neutral" };
const ALAT_STATUS_LABEL = { Ready: "Ready", Perbaikan: "Perbaikan/Maintenance", Standby: "Standby" };
function alatStatusBadge(status) {
  return `<span class="badge ${ALAT_STATUS_BADGE[status] || "status-neutral"}"><span class="dot"></span>${escapeHtml(ALAT_STATUS_LABEL[status] || status)}</span>`;
}
$("#a-nama").addEventListener("change", () => {
  const found = ALAT_MASTER_LIST.find((a) => a.nama === $("#a-nama").value);
  $("#a-jenis").value = found ? found.jenis : "";
});

function openAlatModal(row) {
  editing.alat = row ? row.id : null;
  $("#alat-modal-title").textContent = row ? "Edit Data Alat" : "Tambah Data Alat";
  $("#a-submit").textContent = row ? "Simpan Perubahan" : "Simpan";
  $("#a-project").value = row ? row.projectId : state.projectId;
  if (row) { $("#a-nama").value = row.nama; } else { $("#a-nama").selectedIndex = 0; }
  $("#a-nama").dispatchEvent(new Event("change"));
  $("#a-status").value = row ? row.status : "Ready";
  $("#a-notes").value = row ? row.notes : "";
  $("#modal-alat").classList.remove("hidden");
}

function renderAlatSummary() {
  const projFilter = $("#alatProjectFilter").value;
  const rows = projFilter === "all" ? equipment.slice() : equipment.filter((r) => r.projectId === projFilter);
  $("#alatTotalUnit").textContent = rows.length;
  $("#alatReadyUnit").textContent = rows.filter((r) => r.status === "Ready").length;
  $("#alatPerbaikanUnit").textContent = rows.filter((r) => r.status === "Perbaikan").length;
  $("#alatStandbyUnit").textContent = rows.filter((r) => r.status === "Standby").length;
}

function renderAlatTable() {
  const projFilter = $("#alatProjectFilter").value;
  const jenisFilter = $("#alatJenisFilter").value;
  const statusFilter = $("#alatStatusFilter").value;
  const q = $("#alatSearch").value.trim().toLowerCase();
  let rows = equipment.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (jenisFilter !== "all") rows = rows.filter((r) => r.jenis === jenisFilter);
  if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
  if (q) rows = rows.filter((r) => (r.nama + " " + r.notes).toLowerCase().includes(q));
  rows.sort((a, b) => a.nama.localeCompare(b.nama));

  renderAlatSummary();
  $("#alatSubtitle").textContent = rows.length + " unit alat tercatat — tabulasi status saat ini, bukan isian harian.";
  if (rows.length === 0) {
    $("#alatTbody").innerHTML = `<tr><td colspan="5" class="empty-note">Tidak ada data yang cocok.</td></tr>`;
    return;
  }
  $("#alatTbody").innerHTML = rows.map((r) => `
    <tr>
      <td><b>${escapeHtml(r.nama)}</b></td>
      <td>${escapeHtml(r.jenis)}</td>
      <td>${alatStatusBadge(r.status)}</td>
      <td>${escapeHtml(r.notes) || '<span class="muted">–</span>'}</td>
      <td><button class="edit-btn" data-kind="equipment" data-id="${r.id}">Edit</button><button class="del-btn" data-kind="equipment" data-id="${r.id}">Hapus</button></td>
    </tr>
  `).join("");
}

$("#form-alat").addEventListener("submit", async (e) => {
  e.preventDefault();
  const found = ALAT_MASTER_LIST.find((a) => a.nama === $("#a-nama").value);
  const data = { projectId: $("#a-project").value, nama: $("#a-nama").value, jenis: found ? found.jenis : "", status: $("#a-status").value, notes: $("#a-notes").value };
  try {
    if (editing.alat) {
      const updated = await apiUpdate("equipment", editing.alat, data);
      Object.assign(equipment.find((r) => r.id === editing.alat), updated);
      showToast("Data alat diperbarui.");
    } else {
      equipment.push(await apiCreate("equipment", data));
      showToast("Data alat disimpan.");
    }
    closeModal($("#modal-alat"));
    refreshAll();
  } catch (err) {
    showToast(err.message || "Gagal menyimpan data alat.", true);
  }
});

/* ---------------------------------------------------------------------
   Manpower (terpisah dari Alat) — tabulasi per jabatan & jumlah orang
--------------------------------------------------------------------- */
function openManpowerModal(row) {
  editing.manpower = row ? row.id : null;
  $("#manpower-modal-title").textContent = row ? "Edit Data Manpower" : "Tambah Data Manpower";
  $("#m-submit").textContent = row ? "Simpan Perubahan" : "Simpan";
  $("#m-project").value = row ? row.projectId : state.projectId;
  $("#m-jabatan").value = row ? row.jabatan : "";
  $("#m-jumlah").value = row ? row.jumlahOrang : "";
  $("#m-notes").value = row ? row.notes : "";
  $("#modal-manpower").classList.remove("hidden");
}

function renderManpowerSummary() {
  const projFilter = $("#manpowerProjectFilter").value;
  const rows = projFilter === "all" ? manpower.slice() : manpower.filter((r) => r.projectId === projFilter);
  const total = rows.reduce((s, r) => s + r.jumlahOrang, 0);
  $("#manpowerTotalToday").textContent = fmtNum(total) + " orang";
  $("#manpowerRolesToday").textContent = rows.length;
}

function renderManpowerTable() {
  const projFilter = $("#manpowerProjectFilter").value;
  const q = $("#manpowerSearch").value.trim().toLowerCase();
  let rows = manpower.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (q) rows = rows.filter((r) => (r.jabatan + " " + r.notes).toLowerCase().includes(q));
  rows.sort((a, b) => a.jabatan.localeCompare(b.jabatan));

  renderManpowerSummary();
  $("#manpowerSubtitle").textContent = rows.length + " jabatan tercatat — tabulasi kondisi saat ini, bukan isian harian.";
  if (rows.length === 0) {
    $("#manpowerTbody").innerHTML = `<tr><td colspan="4" class="empty-note">Belum ada data manpower.</td></tr>`;
    return;
  }
  $("#manpowerTbody").innerHTML = rows.map((r) => `
    <tr>
      <td><b>${escapeHtml(r.jabatan)}</b></td>
      <td>${fmtNum(r.jumlahOrang)} orang</td>
      <td>${escapeHtml(r.notes) || '<span class="muted">–</span>'}</td>
      <td><button class="edit-btn" data-kind="manpower" data-id="${r.id}">Edit</button><button class="del-btn" data-kind="manpower" data-id="${r.id}">Hapus</button></td>
    </tr>
  `).join("");
}

$("#form-manpower").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = { projectId: $("#m-project").value, jabatan: $("#m-jabatan").value, jumlahOrang: Number($("#m-jumlah").value), notes: $("#m-notes").value };
  try {
    if (editing.manpower) {
      const updated = await apiUpdate("manpower", editing.manpower, data);
      Object.assign(manpower.find((r) => r.id === editing.manpower), updated);
      showToast("Data manpower diperbarui.");
    } else {
      manpower.push(await apiCreate("manpower", data));
      showToast("Data manpower disimpan.");
    }
    closeModal($("#modal-manpower"));
    refreshAll();
  } catch (err) {
    showToast(err.message || "Gagal menyimpan data manpower.", true);
  }
});

/* ---------------------------------------------------------------------
   Cuaca
--------------------------------------------------------------------- */
function openCuacaModal(row) {
  editing.cuaca = row ? row.id : null;
  $("#cuaca-modal-title").textContent = row ? "Edit Laporan Cuaca" : "Tambah Laporan Cuaca";
  $("#w-submit").textContent = row ? "Simpan Perubahan" : "Simpan";
  $("#w-project").value = row ? row.projectId : state.projectId;
  $("#w-date").value = row ? row.date : todayISO();
  $("#w-condition").value = row ? row.condition : "cerah";
  $("#w-rainfall").value = row ? row.rainfallMm : "";
  $("#w-hours").value = row ? row.hoursLost : "";
  $("#w-notes").value = row ? row.notes : "";
  $("#modal-cuaca").classList.remove("hidden");
}

function renderCuacaTable() {
  const projFilter = $("#cuacaProjectFilter").value;
  let rows = weather.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  $("#cuacaSubtitle").textContent = rows.length + " data ditemukan";
  if (rows.length === 0) {
    $("#cuacaTbody").innerHTML = `<tr><td colspan="6" class="empty-note">Tidak ada data yang cocok.</td></tr>`;
    return;
  }
  $("#cuacaTbody").innerHTML = rows.map((r) => `
    <tr>
      <td>${fmtDateLong(r.date)}</td>
      <td>${weatherBadge(r.condition)}</td>
      <td>${r.rainfallMm ? fmtNum(r.rainfallMm) + " mm" : '<span class="muted">–</span>'}</td>
      <td>${r.hoursLost ? fmtNum(r.hoursLost) + " jam" : '<span class="muted">–</span>'}</td>
      <td>${escapeHtml(r.notes) || '<span class="muted">–</span>'}</td>
      <td><button class="edit-btn" data-kind="weather" data-id="${r.id}">Edit</button><button class="del-btn" data-kind="weather" data-id="${r.id}">Hapus</button></td>
    </tr>
  `).join("");
}

$("#form-cuaca").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = { projectId: $("#w-project").value, date: $("#w-date").value, condition: $("#w-condition").value, rainfallMm: Number($("#w-rainfall").value) || 0, hoursLost: Number($("#w-hours").value) || 0, notes: $("#w-notes").value };
  try {
    if (editing.cuaca) {
      const updated = await apiUpdate("weather", editing.cuaca, data);
      Object.assign(weather.find((r) => r.id === editing.cuaca), updated);
      showToast("Laporan cuaca diperbarui.");
    } else {
      weather.push(await apiCreate("weather", data));
      showToast("Laporan cuaca disimpan.");
    }
    closeModal($("#modal-cuaca"));
    refreshAll();
  } catch (err) {
    showToast(err.message || "Gagal menyimpan laporan cuaca.", true);
  }
});

/* ---------------------------------------------------------------------
   Dokumen — folder dinamis (bawaan: Tagihan/Gambar DWG/BAOP/GeoPDF), owner
   bisa bikin folder baru sendiri lewat tombol "+ Folder Baru" (lihat
   populateFolderSelect() & form-folder-baru di bawah).
--------------------------------------------------------------------- */
function populateFolderSelect() {
  $("#d-folder").innerHTML = docFolders.map((f) => `<option value="${f.id}">${escapeHtml(f.label)}</option>`).join("");
}

function updateFileSizeHint() {
  const folder = $("#d-folder").value;
  const maxMb = folderMaxMb(folder);
  $("#d-size-hint").textContent = "Maks. " + maxMb + "MB" + (maxMb > 15 ? " (folder ini boleh lebih besar)" : "");
}
$("#d-folder").addEventListener("change", updateFileSizeHint);

function docCountForFolder(folder) {
  const projFilter = $("#dokumenProjectFilter").value;
  let rows = documents.filter((r) => r.folder === folder);
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  return rows.length;
}

function renderDokumenFolderGrid() {
  $("#addFolderBtn").classList.remove("hidden");
  $("#dokumenFolderGrid").innerHTML = docFolders.map((f) => `
    <div class="folder-card-wrap">
      <button class="folder-card" data-folder="${f.id}">
        <div class="folder-icon">${f.icon}</div>
        <div class="folder-name">${escapeHtml(f.label)}</div>
        <div class="folder-count">${docCountForFolder(f.id)} dokumen${f.maxMb > 15 ? " · maks " + f.maxMb + "MB" : ""}</div>
        ${f.protected ? `<div class="folder-lock">🔒 Dilindungi password</div>` : ""}
      </button>
      ${!f.builtin ? `<button class="folder-del-btn" data-folder-id="${f.id}" title="Hapus folder" type="button">✕</button>` : ""}
    </div>
  `).join("");
  $$(".folder-card").forEach((card) => card.addEventListener("click", () => openDokumenFolder(card.dataset.folder)));
}

async function deleteDocFolder(id) {
  if (!confirm("Hapus folder ini? Folder yang masih berisi dokumen tidak bisa dihapus.")) return;
  try {
    await apiFetch(`/api/doc-folders/${id}`, { method: "DELETE" });
    const idx = docFolders.findIndex((f) => f.id === id);
    if (idx >= 0) docFolders.splice(idx, 1);
    showToast("Folder dihapus.");
    renderDokumenFolderGrid();
  } catch (err) {
    showToast(err.message || "Gagal menghapus folder.", true);
  }
}
document.addEventListener("click", (e) => {
  const delFolderBtn = e.target.closest(".folder-del-btn");
  if (delFolderBtn) { e.stopPropagation(); deleteDocFolder(delFolderBtn.dataset.folderId); }
});

$("#addFolderBtn").addEventListener("click", () => {
  $("#form-folder-baru").reset();
  $("#fb-maxmb").value = 15;
  $("#fb-error").style.display = "none";
  $("#modal-folder-baru").classList.remove("hidden");
});
$("#form-folder-baru").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#fb-error");
  errEl.style.display = "none";
  const data = { label: $("#fb-nama").value.trim(), icon: $("#fb-icon").value.trim(), maxMb: Number($("#fb-maxmb").value) || 15, protected: $("#fb-protected").checked };
  if (!data.label) { errEl.textContent = "Nama folder wajib diisi."; errEl.style.display = "block"; return; }
  try {
    const folder = await apiFetch("/api/doc-folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    docFolders.push(folder);
    populateFolderSelect();
    closeModal($("#modal-folder-baru"));
    showToast(`Folder "${folder.label}" berhasil dibuat.`);
    renderDokumenFolderGrid();
  } catch (err) {
    errEl.textContent = err.message || "Gagal membuat folder.";
    errEl.style.display = "block";
  }
});

function openDokumenFolder(folder) {
  state.dokFolder = folder;
  renderDokumenView();
}

$("#dokumenBackBtn").addEventListener("click", () => {
  state.dokFolder = null;
  renderDokumenView();
});

$("#tagihanPasswordSubmit").addEventListener("click", checkDocumentPassword);
$("#tagihanPasswordInput").addEventListener("keydown", (e) => { if (e.key === "Enter") checkDocumentPassword(); });
async function checkDocumentPassword() {
  const val = $("#tagihanPasswordInput").value;
  try {
    await apiFetch("/api/documents/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: val }) });
    state.documentsUnlocked = true;
    $("#tagihanPasswordError").textContent = "";
    $("#tagihanPasswordInput").value = "";
    renderDokumenView();
  } catch (err) {
    $("#tagihanPasswordError").textContent = err.message || "Password salah. Coba lagi.";
  }
}

function renderDokumenView() {
  const folder = state.dokFolder;
  $("#dokumenBackBtn").classList.toggle("hidden", !folder);
  $("#dokumenFolderGrid").classList.toggle("hidden", !!folder);
  $("#dokumenFilters").classList.toggle("hidden", !folder);
  $("#addFolderBtn").classList.toggle("hidden", !!folder);

  if (!folder) {
    $("#dokumenTitle").textContent = "Dokumen";
    $("#dokumenSubtitle").textContent = "Pilih folder untuk melihat dokumen — dikelompokkan per kategori, atau bikin folder baru sendiri.";
    $("#dokumenPasswordGate").classList.add("hidden");
    $("#dokumenGrid").classList.add("hidden");
    renderDokumenFolderGrid();
    return;
  }

  $("#dokumenTitle").textContent = "Dokumen — " + folderLabel(folder);

  if (folderIsProtected(folder) && !state.documentsUnlocked) {
    $("#dokumenSubtitle").textContent = "Folder ini dilindungi password.";
    $("#dokumenPasswordTitle").textContent = "Folder " + folderLabel(folder) + " Dilindungi Password";
    $("#dokumenPasswordGate").classList.remove("hidden");
    $("#dokumenGrid").classList.add("hidden");
    return;
  }

  $("#dokumenPasswordGate").classList.add("hidden");
  $("#dokumenGrid").classList.remove("hidden");
  renderDokumenGrid();
}

function renderDokumenGrid() {
  const folder = state.dokFolder;
  const projFilter = $("#dokumenProjectFilter").value;
  let rows = documents.filter((r) => r.folder === folder);
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  rows.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  const maxMb = folderMaxMb(folder);
  $("#dokumenSubtitle").textContent = rows.length + " dokumen di folder " + folderLabel(folder) + " — maks. " + maxMb + "MB per file.";
  if (rows.length === 0) {
    $("#dokumenGrid").innerHTML = `<div class="empty-note">Belum ada dokumen di folder ini.</div>`;
    return;
  }
  $("#dokumenGrid").innerHTML = rows.map((r) => `
    <div class="doc-card">
      <div class="doc-name">${escapeHtml(r.filename)}</div>
      <div class="doc-meta">${r.filetype.toUpperCase()} · ${fmtBytes(r.filesize)} · ${fmtDateLong(r.uploadedAt.slice(0, 10))}</div>
      ${r.description ? `<div class="doc-meta">${escapeHtml(r.description)}</div>` : ""}
      <div class="doc-actions">
        <a class="dl-btn" href="${r.blobUrl}" download="${escapeHtml(r.filename)}">Download</a>
        <button class="del-btn" data-kind="documents" data-id="${r.id}">Hapus</button>
      </div>
    </div>
  `).join("");
}

$("#dokumenProjectFilter").addEventListener("change", () => { if (state.dokFolder) renderDokumenGrid(); else renderDokumenFolderGrid(); });

$("#form-dokumen").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = $("#d-file");
  const errEl = $("#d-error");
  errEl.style.display = "none";
  if (!fileInput.files[0]) { errEl.textContent = "Pilih file terlebih dahulu."; errEl.style.display = "block"; return; }
  const file = fileInput.files[0];
  const folder = $("#d-folder").value;
  const maxMb = folderMaxMb(folder);
  if (file.size > maxMb * 1024 * 1024) {
    errEl.textContent = `Ukuran file (${fmtBytes(file.size)}) melebihi batas maksimal ${maxMb}MB untuk folder ${folderLabel(folder)}.`;
    errEl.style.display = "block";
    return;
  }
  const fd = new FormData();
  fd.append("projectId", $("#d-project").value);
  fd.append("folder", folder);
  fd.append("description", $("#d-description").value);
  fd.append("file", file);
  try {
    const row = await apiFetch("/api/documents", { method: "POST", body: fd });
    documents.push(row);
    closeModal($("#modal-dokumen"));
    showToast("Dokumen ditambahkan ke folder " + folderLabel(row.folder) + ".");
    state.dokFolder = row.folder;
    refreshAll();
  } catch (err) {
    errEl.textContent = err.message || "Gagal upload dokumen.";
    errEl.style.display = "block";
  }
});

/* ---------------------------------------------------------------------
   Isu Eksternal & Internal — foto bukti disimpan via upload multipart
   (mirip Dokumen), bukan lewat apiCreate/apiUpdate JSON biasa.
--------------------------------------------------------------------- */
let editingIsuFoto = null; // preview blob URL (foto baru dipilih) — dikirim sebagai file saat submit
let editingIsuFotoRemoved = false; // true kalau user menghapus foto lama saat edit

function isuFotoTileRefresh() {
  const tile = $("#isu-foto-tile");
  if (editingIsuFoto) {
    tile.classList.add("has-photo");
    tile.innerHTML = `<img src="${editingIsuFoto}" alt="Foto bukti"><button type="button" class="photo-tile-remove" id="isu-foto-remove" title="Hapus foto">✕</button>`;
  } else {
    tile.classList.remove("has-photo");
    tile.innerHTML = `<span class="photo-add-plus">+</span><span class="photo-add-label">Tambah Foto</span>`;
  }
}
$("#isu-foto-tile").addEventListener("click", (e) => {
  if (e.target.closest("#isu-foto-remove")) {
    e.stopPropagation();
    editingIsuFoto = null;
    editingIsuFotoRemoved = true;
    $("#isu-foto").value = "";
    isuFotoTileRefresh();
    return;
  }
  $("#isu-foto").click();
});
$("#isu-foto").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const validExt = ISU_FOTO_EXT_RE.test(file.name);
  const validMime = /^image\//.test(file.type);
  if (!validExt && !validMime) {
    $("#isu-error").textContent = "Foto bukti harus berupa gambar (JPG, JPEG, PNG, atau HEIC).";
    $("#isu-error").style.display = "block";
    e.target.value = "";
    return;
  }
  $("#isu-error").style.display = "none";
  editingIsuFoto = URL.createObjectURL(file);
  editingIsuFotoRemoved = false;
  isuFotoTileRefresh();
});

function openIsuModal(row) {
  editing.isu = row ? row.id : null;
  $("#isu-modal-title").textContent = row ? "Edit Isu" : "Tambah Isu";
  $("#isu-submit").textContent = row ? "Simpan Perubahan" : "Simpan";
  $("#isu-project").value = row ? row.projectId : state.projectId;
  $("#isu-date").value = row ? row.date : todayISO();
  $("#isu-kategori").value = row ? row.kategori : "eksternal";
  $("#isu-status").value = row ? row.status : "berjalan";
  $("#isu-judul").value = row ? row.judul : "";
  $("#isu-deskripsi").value = row ? row.deskripsi : "";
  $("#isu-tindakan").value = row ? (row.tindakanPerbaikan || "") : "";
  $("#isu-keparahan").value = (row && row.keparahan) ? row.keparahan : "ringan";
  $("#isu-keparahan-field").classList.toggle("hidden", $("#isu-kategori").value !== "k3");
  $("#isu-foto").value = "";
  editingIsuFoto = row ? row.foto : null;
  editingIsuFotoRemoved = false;
  isuFotoTileRefresh();
  $("#isu-error").style.display = "none";
  $("#modal-isu").classList.remove("hidden");
}
$("#isu-kategori").addEventListener("change", (e) => {
  $("#isu-keparahan-field").classList.toggle("hidden", e.target.value !== "k3");
});

$("#form-isu").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#isu-error");
  errEl.style.display = "none";
  const fd = new FormData();
  fd.append("projectId", $("#isu-project").value);
  fd.append("date", $("#isu-date").value);
  fd.append("kategori", $("#isu-kategori").value);
  fd.append("status", $("#isu-status").value);
  fd.append("judul", $("#isu-judul").value);
  fd.append("deskripsi", $("#isu-deskripsi").value);
  fd.append("tindakanPerbaikan", $("#isu-tindakan").value);
  if ($("#isu-kategori").value === "k3") fd.append("keparahan", $("#isu-keparahan").value);
  const fotoFile = $("#isu-foto").files[0];
  if (fotoFile) fd.append("foto", fotoFile);
  else if (editing.isu && editingIsuFotoRemoved) fd.append("removeFoto", "1");
  try {
    if (editing.isu) {
      const updated = await apiFetch(`/api/isu/${editing.isu}`, { method: "PUT", body: fd });
      Object.assign(isu.find((r) => r.id === editing.isu), updated);
      showToast("Isu diperbarui.");
    } else {
      isu.push(await apiFetch("/api/isu", { method: "POST", body: fd }));
      showToast("Isu disimpan.");
    }
    closeModal($("#modal-isu"));
    refreshAll();
  } catch (err) {
    errEl.textContent = err.message || "Gagal menyimpan isu.";
    errEl.style.display = "block";
  }
});

function renderIsuList() {
  const projFilter = $("#isuProjectFilter").value;
  const kategoriFilter = $("#isuKategoriFilter").value;
  const statusFilter = $("#isuStatusFilter").value;
  const q = $("#isuSearch").value.trim().toLowerCase();
  let rows = isu.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (kategoriFilter !== "all") rows = rows.filter((r) => r.kategori === kategoriFilter);
  if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
  if (q) rows = rows.filter((r) => (r.judul + " " + r.deskripsi).toLowerCase().includes(q));
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  $("#isuSubtitle").textContent = rows.length + " isu ditemukan";
  if (rows.length === 0) {
    $("#isuTbody").innerHTML = `<tr><td colspan="9" class="empty-note">Belum ada isu yang tercatat.</td></tr>`;
    return;
  }
  $("#isuTbody").innerHTML = rows.map((r) => `
    <tr>
      <td>${fmtDateLong(r.date)}</td>
      <td>${isuBadge(r.kategori)}</td>
      <td>${keparahanBadge(r.keparahan)}</td>
      <td><b>${escapeHtml(r.judul)}</b></td>
      <td>${isuStatusBadge(r.status)}</td>
      <td>${escapeHtml(r.deskripsi) || '<span class="muted">–</span>'}</td>
      <td>${r.tindakanPerbaikan ? escapeHtml(r.tindakanPerbaikan) : '<span class="muted">–</span>'}</td>
      <td>${r.foto ? `<a href="${r.foto}" target="_blank" rel="noopener"><img class="isu-foto-thumb" src="${r.foto}" alt="Foto bukti"></a>` : '<span class="muted">–</span>'}</td>
      <td><button class="edit-btn" data-kind="isu" data-id="${r.id}">Edit</button><button class="del-btn" data-kind="isu" data-id="${r.id}">Hapus</button></td>
    </tr>
  `).join("");
}

$("#isuAlertGotoBtn").addEventListener("click", () => setView("isu"));
$("#gsGotoBbmBtn").addEventListener("click", () => setView("bbm"));

function renderBerandaIsuAlert() {
  const rows = isu.filter((r) => r.projectId === state.projectId && r.status === "berjalan").sort((a, b) => b.date.localeCompare(a.date));
  const banner = $("#isuAlertBanner");
  if (rows.length === 0) { banner.classList.add("hidden"); return; }
  banner.classList.remove("hidden");
  $("#isuAlertList").innerHTML = rows.slice(0, 4).map((r) => `
    <div class="issue-item">
      <div class="issue-badges">${isuBadge(r.kategori)}${isuStatusBadge(r.status)}</div>
      <div style="flex:1;">
        <div class="issue-meta">${fmtDateLong(r.date)}</div>
        <div class="issue-text"><b>${escapeHtml(r.judul)}</b> — ${escapeHtml(r.deskripsi)}</div>
      </div>
      ${r.foto ? `<a href="${r.foto}" target="_blank" rel="noopener" title="Lihat foto bukti"><img class="isu-foto-thumb" src="${r.foto}" alt="Foto bukti"></a>` : ""}
    </div>
  `).join("");
}

["#isuProjectFilter", "#isuKategoriFilter", "#isuStatusFilter", "#isuSearch"].forEach((sel) => $(sel).addEventListener("input", renderIsuList));

/* ---------------------------------------------------------------------
   Bobot Pekerjaan Kontrak
--------------------------------------------------------------------- */
function kontrakAchievedVolume(item) {
  return production.filter((r) => r.projectId === item.projectId && r.kontrakItemId === item.id).reduce((s, r) => s + r.volume, 0);
}

function computeKontrakRows(projectId) {
  const items = kontrak.filter((k) => k.projectId === projectId).slice().sort((a, b) => a.no - b.no);
  const totalVolume = items.reduce((s, k) => s + k.volumeKontrak, 0);
  return items.map((k) => {
    // Pakai Bobot (%) resmi dari dokumen kontrak kalau ada; kalau item baru
    // ditambah manual tanpa bobot resmi, fallback ke proporsi volume (perkiraan kasar).
    const bobot = (k.bobotPersen !== undefined && k.bobotPersen !== null) ? k.bobotPersen : (totalVolume ? (k.volumeKontrak / totalVolume) * 100 : 0);
    const achieved = kontrakAchievedVolume(k);
    const pctItem = k.volumeKontrak ? Math.min(100, (achieved / k.volumeKontrak) * 100) : 0;
    const bobotTercapai = (bobot * pctItem) / 100;
    return Object.assign({}, k, { bobot, achieved, pctItem, bobotTercapai });
  });
}

function overallKontrakProgress(projectId) {
  return computeKontrakRows(projectId).reduce((s, r) => s + r.bobotTercapai, 0);
}

function renderKontrakTable() {
  const projectId = $("#kontrakProjectFilter").value || state.projectId;
  const rows = computeKontrakRows(projectId);
  const totalProgress = rows.reduce((s, r) => s + r.bobotTercapai, 0);

  $("#kontrakProgressValue").textContent = fmtNum2(totalProgress) + "%";
  $("#kontrakProgressFill").style.width = Math.min(100, totalProgress) + "%";
  $("#kontrakSummaryText").innerHTML = `
    Jumlah item BOQ: <b>${rows.length}</b><br>
    Item sudah 100%: <b>${rows.filter((r) => r.pctItem >= 100).length}</b><br>
    Semua item otomatis dari total Produksi Harian per item.
  `;

  if (rows.length === 0) {
    $("#kontrakTbody").innerHTML = `<tr><td colspan="9" class="empty-note">Belum ada item kontrak untuk proyek ini.</td></tr>`;
    return;
  }
  $("#kontrakTbody").innerHTML = rows.map((r) => `
    <tr>
      <td>${r.no}</td>
      <td>${escapeHtml(r.uraian)}</td>
      <td>${escapeHtml(r.satuan)}</td>
      <td>${fmtNum2(r.volumeKontrak)}</td>
      <td>${fmtNum2(r.bobot)}%</td>
      <td>${fmtNum(r.achieved)}</td>
      <td>${fmtNum(r.pctItem)}%</td>
      <td>${fmtNum2(r.bobotTercapai)}%</td>
      <td><button class="edit-btn" data-kind="kontrak" data-id="${r.id}">Edit</button><button class="del-btn" data-kind="kontrak" data-id="${r.id}">Hapus</button></td>
    </tr>
  `).join("");
}

function openKontrakModal(row) {
  editing.kontrak = row ? row.id : null;
  const projectId = row ? row.projectId : $("#kontrakProjectFilter").value;
  $("#kontrak-modal-title").textContent = row ? "Edit Item Kontrak" : "Tambah Item Kontrak";
  $("#k-submit").textContent = row ? "Simpan Perubahan" : "Simpan";
  $("#k-project").value = projectId;
  $("#k-no").value = row ? row.no : (kontrak.filter((k) => k.projectId === projectId).length + 1);
  $("#k-uraian").value = row ? row.uraian : "";
  $("#k-satuan").value = row ? row.satuan : "";
  $("#k-volume").value = row ? row.volumeKontrak : "";
  $("#k-bobot").value = row && row.bobotPersen !== undefined && row.bobotPersen !== null ? row.bobotPersen : "";
  $("#k-notes").value = row ? row.notes : "";
  $("#modal-kontrak").classList.remove("hidden");
}

$("#kontrakProjectFilter").addEventListener("change", () => { renderKontrakTable(); renderKurvaSChart(); renderRencanaTable(); });

$("#form-kontrak").addEventListener("submit", async (e) => {
  e.preventDefault();
  const bobotVal = $("#k-bobot").value;
  const data = {
    projectId: $("#k-project").value, no: Number($("#k-no").value), uraian: $("#k-uraian").value,
    satuan: $("#k-satuan").value, volumeKontrak: Number($("#k-volume").value),
    bobotPersen: bobotVal === "" ? null : Number(bobotVal), notes: $("#k-notes").value,
  };
  try {
    if (editing.kontrak) {
      const updated = await apiUpdate("kontrak", editing.kontrak, data);
      Object.assign(kontrak.find((r) => r.id === editing.kontrak), updated);
      showToast("Item kontrak diperbarui.");
    } else {
      kontrak.push(await apiCreate("kontrak", data));
      showToast("Item kontrak ditambahkan.");
    }
    closeModal($("#modal-kontrak"));
    refreshAll();
  } catch (err) {
    showToast(err.message || "Gagal menyimpan item kontrak.", true);
  }
});

/* ---------------------------------------------------------------------
   Rencana Kurva-S — target progres kumulatif (%) per tanggal (manual atau
   upload Excel sheet "Kurva S"), dibandingkan dengan Realisasi (dihitung
   otomatis dari Produksi Harian, sama seperti tabel Realisasi Progres di
   atas) di grafik Kurva-S.
--------------------------------------------------------------------- */
function computeRealisasiSeries(projectId) {
  const items = kontrak.filter((k) => k.projectId === projectId).slice().sort((a, b) => a.no - b.no);
  const totalVolume = items.reduce((s, k) => s + k.volumeKontrak, 0);
  const bobotFor = (k) => (k.bobotPersen !== undefined && k.bobotPersen !== null) ? k.bobotPersen : (totalVolume ? (k.volumeKontrak / totalVolume) * 100 : 0);
  const prodRows = production.filter((r) => r.projectId === projectId);
  const dates = [...new Set(prodRows.map((r) => r.date))].sort();
  return dates.map((d) => {
    let total = 0;
    items.forEach((k) => {
      const achieved = prodRows.filter((r) => r.kontrakItemId === k.id && r.date <= d).reduce((s, r) => s + r.volume, 0);
      const pctItem = k.volumeKontrak ? Math.min(100, (achieved / k.volumeKontrak) * 100) : 0;
      total += (bobotFor(k) * pctItem) / 100;
    });
    return { date: d, percent: total };
  });
}

let kurvaSChart;
function renderKurvaSChart() {
  const canvas = $("#kurvaSChart");
  if (!canvas) return;
  const projectId = $("#kontrakProjectFilter").value || state.projectId;
  const rencanaPoints = rencanaProgress.filter((r) => r.projectId === projectId).slice().sort((a, b) => a.date.localeCompare(b.date));
  const realisasiPoints = computeRealisasiSeries(projectId);
  const allDates = [...new Set([...rencanaPoints.map((r) => r.date), ...realisasiPoints.map((r) => r.date)])].sort();

  if (kurvaSChart) { kurvaSChart.destroy(); kurvaSChart = null; }
  if (!allDates.length) {
    $("#kurvaSDeviasi").textContent = "Belum ada data Rencana maupun Realisasi untuk proyek ini.";
    return;
  }
  const labels = allDates.map(fmtDateLong);
  const rencanaMap = new Map(rencanaPoints.map((r) => [r.date, r.targetPercent]));
  const realisasiMap = new Map(realisasiPoints.map((r) => [r.date, r.percent]));
  const rencanaData = allDates.map((d) => (rencanaMap.has(d) ? Math.round(rencanaMap.get(d) * 100) / 100 : null));
  const realisasiData = allDates.map((d) => (realisasiMap.has(d) ? Math.round(realisasiMap.get(d) * 100) / 100 : null));

  kurvaSChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Rencana (%)", data: rencanaData, borderColor: "#898781", backgroundColor: "transparent", borderDash: [6, 4], spanGaps: true, tension: 0.15, pointRadius: 2 },
        { label: "Realisasi (%)", data: realisasiData, borderColor: "#3987e5", backgroundColor: "rgba(57,135,229,0.12)", fill: true, spanGaps: true, tension: 0.15, pointRadius: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", align: "end", labels: { boxWidth: 10, boxHeight: 10, color: "#c3c2b7", usePointStyle: true, pointStyle: "line" } },
        tooltip: { backgroundColor: "#232320", padding: 10, cornerRadius: 4, callbacks: { label: (c) => c.dataset.label + ": " + (c.parsed.y == null ? "-" : c.parsed.y + "%") } },
      },
      scales: {
        y: { min: 0, max: 100, grid: { color: "#2c2c2a" }, ticks: { color: "#898781", callback: (v) => v + "%" } },
        x: { grid: { display: false }, ticks: { color: "#898781", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      },
    },
  });

  const todayStr = todayISO();
  const relevantRencana = rencanaPoints.filter((r) => r.date <= todayStr);
  const latestRencana = relevantRencana[relevantRencana.length - 1];
  const relevantRealisasi = realisasiPoints.filter((r) => r.date <= todayStr);
  const latestRealisasi = relevantRealisasi[relevantRealisasi.length - 1];
  if (latestRencana && latestRealisasi) {
    const deviasi = latestRealisasi.percent - latestRencana.targetPercent;
    const label = deviasi >= 0 ? `Lebih cepat ${fmtNum2(Math.abs(deviasi))}% dari rencana` : `Tertinggal ${fmtNum2(Math.abs(deviasi))}% dari rencana`;
    $("#kurvaSDeviasi").textContent = `Realisasi saat ini: ${fmtNum2(latestRealisasi.percent)}% · Rencana s.d ${fmtDateLong(latestRencana.date)}: ${fmtNum2(latestRencana.targetPercent)}% · ${label}`;
  } else {
    $("#kurvaSDeviasi").textContent = 'Isi titik Rencana (tombol "Kelola Rencana") untuk melihat perbandingan dengan Realisasi.';
  }
}

function renderRencanaTable() {
  const projectId = $("#kontrakProjectFilter").value || state.projectId;
  const rows = rencanaProgress.filter((r) => r.projectId === projectId).slice().sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) {
    $("#rencanaTbody").innerHTML = `<tr><td colspan="3" class="empty-note">Belum ada titik rencana untuk proyek ini.</td></tr>`;
    return;
  }
  $("#rencanaTbody").innerHTML = rows.map((r) => `
    <tr>
      <td>${fmtDateLong(r.date)}</td>
      <td>${fmtNum2(r.targetPercent)}%</td>
      <td><button class="del-btn" data-kind="rencana" data-id="${r.id}">Hapus</button></td>
    </tr>
  `).join("");
}

$("#manageRencanaBtn").addEventListener("click", () => {
  renderRencanaTable();
  $("#rc-date").value = todayISO();
  openModal("modal-rencana");
});

$("#form-rencana").addEventListener("submit", async (e) => {
  e.preventDefault();
  const projectId = $("#kontrakProjectFilter").value || state.projectId;
  const date = $("#rc-date").value;
  const target = Number($("#rc-target").value);
  const errEl = $("#rc-error");
  if (!date) { errEl.textContent = "Tanggal wajib diisi."; errEl.style.display = "block"; return; }
  if (!Number.isFinite(target) || target < 0 || target > 100) { errEl.textContent = "Target harus angka 0-100."; errEl.style.display = "block"; return; }
  errEl.style.display = "none";
  const submitBtn = $("#rc-submit");
  submitBtn.disabled = true;
  try {
    const saved = await apiCreate("rencana", { projectId, date, targetPercent: target });
    const existing = rencanaProgress.find((r) => r.projectId === projectId && r.date === date && r.id !== saved.id);
    if (existing) { rencanaProgress = rencanaProgress.filter((r) => r.id !== existing.id); }
    const already = rencanaProgress.find((r) => r.id === saved.id);
    if (already) Object.assign(already, saved); else rencanaProgress.push(saved);
    showToast("Titik rencana disimpan.");
    $("#rc-target").value = "";
    renderRencanaTable();
    renderKurvaSChart();
  } catch (err) {
    errEl.textContent = err.message || "Gagal menyimpan titik rencana.";
    errEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
  }
});

function excelDateToISO(val) {
  if (val instanceof Date && !isNaN(val)) {
    const y = val.getFullYear(), m = String(val.getMonth() + 1).padStart(2, "0"), d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "number" && isFinite(val)) {
    const parsed = XLSX.SSF ? XLSX.SSF.parse_date_code(val) : null;
    if (parsed) return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (typeof val === "string") {
    const m = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d2 = new Date(val);
    if (!isNaN(d2)) { const y = d2.getFullYear(), mo = String(d2.getMonth() + 1).padStart(2, "0"), da = String(d2.getDate()).padStart(2, "0"); return `${y}-${mo}-${da}`; }
  }
  return null;
}
function parseKurvaSSheet(workbook) {
  const sheetName = workbook.SheetNames.find((n) => n.trim().toLowerCase() === "kurva s");
  if (!sheetName) throw new Error('Tidak ditemukan sheet bernama "Kurva S" di file ini. Sheet yang ada: ' + workbook.SheetNames.join(", "));
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, cellDates: true });
  let headerIdx = -1, colTanggal = -1, colKumRencana = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const idxTgl = row.findIndex((c) => typeof c === "string" && c.toLowerCase().includes("tanggal selesai"));
    const idxKum = row.findIndex((c) => typeof c === "string" && c.toLowerCase().includes("kum") && c.toLowerCase().includes("rencana"));
    if (idxTgl !== -1 && idxKum !== -1) { headerIdx = i; colTanggal = idxTgl; colKumRencana = idxKum; break; }
  }
  if (headerIdx === -1) throw new Error('Format sheet "Kurva S" tidak dikenali — kolom "Tanggal Selesai" dan "Kum. Rencana (%)" tidak ditemukan.');
  const raw = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const weekLabel = row[0];
    if (weekLabel === null || weekLabel === undefined || weekLabel === "") continue;
    if (typeof weekLabel === "string" && weekLabel.toLowerCase().includes("total")) continue;
    const dateISO = excelDateToISO(row[colTanggal]);
    const kum = row[colKumRencana];
    if (dateISO === null || kum === null || kum === undefined || kum === "" || typeof kum !== "number") continue;
    raw.push({ date: dateISO, kum });
  }
  if (!raw.length) throw new Error('Tidak ada baris data yang bisa dibaca dari sheet "Kurva S".');
  const maxKum = Math.max(...raw.map((r) => r.kum));
  const scale = maxKum <= 1.5 ? 100 : 1;
  const points = [];
  const warnings = [];
  raw.forEach((r) => {
    const scaled = r.kum * scale;
    if (scaled < -0.01 || scaled > 100.5) {
      warnings.push(`${r.date}: nilai mentah ${r.kum} (setelah dikonversi jadi ${fmtNum2(scaled)}%) di luar rentang wajar 0-100%, dilewati.`);
      return;
    }
    points.push({ date: r.date, targetPercent: Math.round(Math.min(100, Math.max(0, scaled)) * 100) / 100 });
  });
  if (!points.length) throw new Error('Tidak ada baris data dengan nilai "Kum. Rencana" yang masuk akal (0-100%) di sheet "Kurva S".');
  return { points, warnings, scale };
}
$("#rc-upload-btn").addEventListener("click", () => $("#rc-upload-input").click());
$("#rc-upload-input").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  $("#rc-upload-filename").textContent = file.name;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const { points, warnings, scale } = parseKurvaSSheet(workbook);
      const projectId = $("#kontrakProjectFilter").value || state.projectId;
      const existingCount = rencanaProgress.filter((r) => r.projectId === projectId).length;
      const scaleNote = scale === 100
        ? 'Kolom "Kum. Rencana" terbaca sebagai pecahan 0-1 (dikali 100 jadi persen).'
        : 'Kolom "Kum. Rencana" terbaca sudah dalam skala persen 0-100 (tidak dikali 100).';
      let msg = existingCount
        ? `Ditemukan ${points.length} titik rencana di file ini. ${scaleNote} Ini akan MENGGANTI ${existingCount} titik rencana yang sudah ada untuk proyek ini. Lanjutkan?`
        : `Ditemukan ${points.length} titik rencana di file ini. ${scaleNote} Import sekarang?`;
      if (warnings.length) msg += `\n\nPERINGATAN — ${warnings.length} baris dilewati karena nilainya di luar rentang wajar:\n` + warnings.slice(0, 5).join("\n") + (warnings.length > 5 ? `\n...dan ${warnings.length - 5} lagi.` : "");
      if (!confirm(msg)) { $("#rc-upload-input").value = ""; $("#rc-upload-filename").textContent = ""; return; }
      const res = await apiReplaceRencana(projectId, points);
      rencanaProgress = rencanaProgress.filter((r) => r.projectId !== projectId);
      rencanaProgress.push(...res.inserted);
      showToast(`Berhasil import ${points.length} titik rencana dari Excel.`);
      renderRencanaTable();
      renderKurvaSChart();
    } catch (err) {
      showToast(err.message || "Gagal mengimpor file.", true);
    } finally {
      $("#rc-upload-input").value = "";
      $("#rc-upload-filename").textContent = "";
    }
  };
  reader.readAsArrayBuffer(file);
});

/* ---------------------------------------------------------------------
   Upload rekap BBM dari Excel. Dua format didukung, dicoba otomatis per
   sheet (satu file boleh berisi beberapa sheet/bulan sekaligus):

   1) Format "monitoring" (rekap resmi bulanan PT BPA) — satu sheet per
      bulan, baris header "No | Nama Alat | Total | Tanggal Keluar",
      lalu baris nomor hari (1..31) per kolom (tiap hari 2 kolom: Shf1 &
      Shf2), baris "Saldo Awal BBM", lalu satu baris per alat berisi
      liter pemakaian per shift/hari, dan di bagian bawah baris "BBM
      masuk" berisi liter masuk per hari. Nama bulan+tahun diambil dari
      nama sheet (mis. "JULI 2026 (2)") atau sel "Periode : ...".
   2) Format sederhana (fallback) — sheet dengan baris header berkolom
      "Tanggal", "Jenis" (Masuk/Keluar), "Alat"/"Sumber", "Liter".

   Mengganti data BBM proyek ini untuk rentang tanggal yang ada di file
   (supaya upload ulang bulan yang sama tidak dobel data) — sama seperti
   upload Kurva-S di atas.
--------------------------------------------------------------------- */
const MONTH_NAMES_ID = { januari: 1, february: 2, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12 };
function parseMonthYearFromText(text) {
  if (!text) return null;
  const m = String(text).toLowerCase().match(/([a-z]+)\D{0,3}(\d{4})/);
  if (!m) return null;
  const monthNum = MONTH_NAMES_ID[m[1]];
  if (!monthNum) return null;
  return { month: monthNum, year: Number(m[2]) };
}
function dayNumToISO(day, month, year) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function normalizeAlatName(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
function matchAlatMasterName(raw) {
  const norm = normalizeAlatName(raw).toLowerCase();
  const found = ALAT_MASTER_LIST.find((a) => normalizeAlatName(a.nama).toLowerCase() === norm);
  return found ? found.nama : normalizeAlatName(raw);
}

// Coba baca 1 sheet sebagai format "monitoring" (grid hari x alat). Balikin
// null (bukan error) kalau sheet ini memang bukan format itu — supaya sheet
// lain / format fallback masih bisa dicoba.
function parseBbmMonitoringSheet(ws, sheetName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] || [];
    const a = typeof row[0] === "string" ? row[0].trim().toLowerCase() : row[0];
    const b = typeof row[1] === "string" ? row[1].trim().toLowerCase() : "";
    if (a === "no" && b.includes("nama alat")) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return null;

  // Cari baris nomor hari (1..31, minimal 5 nilai) di 3 baris setelah header.
  let dayRowIdx = -1;
  for (let i = headerIdx + 1; i <= headerIdx + 3 && i < rows.length; i++) {
    const row = rows[i] || [];
    let count = 0;
    for (let c = 3; c < row.length; c++) { if (typeof row[c] === "number" && row[c] >= 1 && row[c] <= 31) count++; }
    if (count >= 5) { dayRowIdx = i; break; }
  }
  if (dayRowIdx === -1) return null;
  const dayRow = rows[dayRowIdx] || [];
  const dayCols = []; // { col, day }
  for (let c = 3; c < dayRow.length; c++) { if (typeof dayRow[c] === "number" && dayRow[c] >= 1 && dayRow[c] <= 31) dayCols.push({ col: c, day: dayRow[c] }); }

  // Bulan & tahun — dari nama sheet dulu (mis. "JULI 2026 (2)"), kalau gagal
  // cari sel "Periode : ..." di baris-baris paling atas.
  let monthYear = parseMonthYearFromText(sheetName);
  if (!monthYear) {
    for (let i = 0; i < Math.min(rows.length, headerIdx); i++) {
      const row = rows[i] || [];
      const cellWithPeriode = row.find((c) => typeof c === "string" && c.toLowerCase().includes("periode"));
      if (cellWithPeriode) { monthYear = parseMonthYearFromText(cellWithPeriode); if (monthYear) break; }
    }
  }
  if (!monthYear) return null;

  // Baris "Saldo Awal BBM" — dicari di antara header & baris data alat.
  let saldoAwal = null;
  let equipStartIdx = dayRowIdx + 2; // default: lewati baris hari + baris Shf1/Shf2
  for (let i = dayRowIdx + 1; i <= dayRowIdx + 6 && i < rows.length; i++) {
    const row = rows[i] || [];
    const b = typeof row[1] === "string" ? row[1].trim().toLowerCase() : "";
    if (b.includes("saldo awal")) {
      const val = row.slice(2, 6).find((v) => typeof v === "number");
      if (typeof val === "number") saldoAwal = val;
      equipStartIdx = i + 1;
      break;
    }
  }

  // Baris alat — selama kolom "No" (kolom A) berisi angka.
  const records = [];
  const skipped = [];
  let i = equipStartIdx;
  for (; i < rows.length; i++) {
    const row = rows[i] || [];
    if (typeof row[0] !== "number") break;
    const nama = matchAlatMasterName(row[1]);
    if (!nama) continue;
    dayCols.forEach(({ col, day }) => {
      const shf1 = Number(row[col]) || 0;
      const shf2 = Number(row[col + 1]) || 0;
      const liters = shf1 + shf2;
      if (liters <= 0) return;
      records.push({ date: dayNumToISO(day, monthYear.month, monthYear.year), type: "keluar", equipment: nama, liters, notes: "" });
    });
  }

  // Baris "BBM masuk" — cari persis (bukan "Total BBM masuk ...") di sisa baris sheet.
  for (let j = i; j < rows.length; j++) {
    const row = rows[j] || [];
    const a = typeof row[0] === "string" ? row[0].trim().toLowerCase() : "";
    if (a === "bbm masuk") {
      dayCols.forEach(({ col, day }) => {
        const liters = Number(row[col]);
        if (!Number.isFinite(liters) || liters <= 0) return;
        records.push({ date: dayNumToISO(day, monthYear.month, monthYear.year), type: "masuk", equipment: "Pengiriman BBM", liters, notes: "" });
      });
      break;
    }
  }

  if (!records.length) return null;
  return { records, skipped, saldoAwal, month: monthYear.month, year: monthYear.year, sheetName };
}

// Fallback — sheet dengan baris header sederhana Tanggal/Jenis/Alat/Liter.
function parseBbmFlatSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, cellDates: true });
  let headerIdx = -1, colDate = -1, colType = -1, colEquip = -1, colLiters = -1, colNotes = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = (rows[i] || []).map((c) => (typeof c === "string" ? c.trim().toLowerCase() : c));
    const idxDate = row.findIndex((c) => typeof c === "string" && c.includes("tanggal"));
    const idxType = row.findIndex((c) => typeof c === "string" && c.includes("jenis"));
    const idxEquip = row.findIndex((c) => typeof c === "string" && (c.includes("alat") || c.includes("sumber")));
    const idxLiters = row.findIndex((c) => typeof c === "string" && (c.includes("liter") || c.includes("jumlah")));
    if (idxDate !== -1 && idxType !== -1 && idxEquip !== -1 && idxLiters !== -1) {
      headerIdx = i; colDate = idxDate; colType = idxType; colEquip = idxEquip; colLiters = idxLiters;
      colNotes = row.findIndex((c) => typeof c === "string" && c.includes("catatan"));
      break;
    }
  }
  if (headerIdx === -1) return null;
  const records = [];
  const skipped = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.every((c) => c === null || c === undefined || c === "")) continue;
    const dateISO = excelDateToISO(row[colDate]);
    const typeRaw = String(row[colType] || "").trim().toLowerCase();
    const type = typeRaw.startsWith("masuk") ? "masuk" : typeRaw.startsWith("keluar") ? "keluar" : null;
    const equipment = matchAlatMasterName(row[colEquip]);
    const liters = Number(row[colLiters]);
    if (!dateISO || !type || !equipment || !Number.isFinite(liters) || liters < 0) {
      skipped.push(`Baris ${i + 1}: data tidak lengkap/tidak valid, dilewati.`);
      continue;
    }
    records.push({ date: dateISO, type, equipment, liters, notes: colNotes !== -1 ? String(row[colNotes] || "") : "" });
  }
  if (!records.length) return null;
  return { records, skipped };
}

function parseBbmRekapSheet(workbook) {
  const allRecords = [];
  const allSkipped = [];
  let bestSaldoAwal = null; // saldo awal dari sheet dengan bulan/tahun paling awal
  let bestSaldoAwalKey = null;
  let anySheetMatched = false;

  workbook.SheetNames.forEach((name) => {
    const ws = workbook.Sheets[name];
    const grid = parseBbmMonitoringSheet(ws, name);
    if (grid) {
      anySheetMatched = true;
      allRecords.push(...grid.records);
      allSkipped.push(...grid.skipped);
      if (grid.saldoAwal !== null) {
        const key = grid.year * 100 + grid.month;
        if (bestSaldoAwalKey === null || key < bestSaldoAwalKey) { bestSaldoAwalKey = key; bestSaldoAwal = grid.saldoAwal; }
      }
      return;
    }
    const flat = parseBbmFlatSheet(ws);
    if (flat) {
      anySheetMatched = true;
      allRecords.push(...flat.records);
      allSkipped.push(...flat.skipped);
    }
  });

  if (!anySheetMatched) {
    throw new Error('Format file tidak dikenali. Didukung: (1) format rekap bulanan resmi (baris "No | Nama Alat", baris nomor hari, baris "Saldo Awal BBM", baris "BBM masuk"), atau (2) format sederhana dengan baris header "Tanggal", "Jenis" (Masuk/Keluar), "Alat"/"Sumber", "Liter".');
  }
  if (!allRecords.length) throw new Error("Tidak ada baris data BBM yang valid ditemukan di file.");
  const dates = allRecords.map((r) => r.date).sort();
  return { records: allRecords, skipped: allSkipped, periodStart: dates[0], periodEnd: dates[dates.length - 1], saldoAwal: bestSaldoAwal };
}
$("#bbmUploadBtn").addEventListener("click", () => $("#bbm-upload-input").click());
$("#bbm-upload-input").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const { records, skipped, periodStart, periodEnd, saldoAwal } = parseBbmRekapSheet(workbook);
      const projFilter = $("#bbmProjectFilter").value;
      const projectId = projFilter !== "all" ? projFilter : state.projectId;
      let msg = `Ditemukan ${records.length} baris data BBM (periode ${fmtDateLong(periodStart)} s.d ${fmtDateLong(periodEnd)}). Data BBM proyek ini di periode tersebut akan DIGANTI dengan isi file ini.`;
      if (saldoAwal !== null && saldoAwal !== undefined) msg += ` Saldo Awal BBM ${saldoAwal} liter juga akan tersimpan dari periode paling awal di file ini.`;
      msg += ` Lanjutkan?`;
      if (skipped.length) msg += `\n\nPERINGATAN — ${skipped.length} baris dilewati:\n` + skipped.slice(0, 5).join("\n") + (skipped.length > 5 ? `\n...dan ${skipped.length - 5} lagi.` : "");
      if (!confirm(msg)) { e.target.value = ""; return; }
      const res = await apiReplaceFuelPeriod(projectId, periodStart, periodEnd, records);
      fuel = fuel.filter((r) => !(r.projectId === projectId && r.date >= periodStart && r.date <= periodEnd));
      fuel.push(...res.inserted);
      if (saldoAwal !== null && saldoAwal !== undefined) {
        try {
          await apiSaveFuelSaldoAwal(projectId, saldoAwal);
          fuelOpeningBalance[projectId] = saldoAwal;
        } catch (errSaldo) {
          console.warn("Gagal menyimpan Saldo Awal BBM otomatis:", errSaldo);
        }
      }
      showToast(`Berhasil import ${records.length} baris data BBM dari Excel.`);
      refreshAll();
    } catch (err) {
      showToast(err.message || "Gagal mengimpor file.", true);
    } finally {
      e.target.value = "";
    }
  };
  reader.readAsArrayBuffer(file);
});

$("#bbmSaldoAwalSaveBtn").addEventListener("click", async () => {
  const projFilter = $("#bbmProjectFilter").value;
  if (projFilter === "all") return;
  const val = Number($("#bbmSaldoAwalInput").value);
  if (!Number.isFinite(val) || val < 0) { showToast("Saldo Awal harus angka >= 0.", true); return; }
  const btn = $("#bbmSaldoAwalSaveBtn");
  btn.disabled = true;
  try {
    await apiSaveFuelSaldoAwal(projFilter, val);
    fuelOpeningBalance[projFilter] = val;
    showToast("Saldo Awal BBM disimpan.");
    renderBbmTable();
  } catch (err) {
    showToast(err.message || "Gagal menyimpan Saldo Awal BBM.", true);
  } finally {
    btn.disabled = false;
  }
});

/* ---------------------------------------------------------------------
   Edit & Hapus (generic, event delegation)
--------------------------------------------------------------------- */
const DATA_ARRAY = { production: () => production, ritasi: () => ritasi, fuel: () => fuel, equipment: () => equipment, manpower: () => manpower, weather: () => weather, documents: () => documents, kontrak: () => kontrak, isu: () => isu, rencana: () => rencanaProgress };
const EDIT_OPENER = { production: openProduksiModal, ritasi: openRitasiModal, fuel: openBbmModal, equipment: openAlatModal, manpower: openManpowerModal, weather: openCuacaModal, kontrak: openKontrakModal, isu: openIsuModal };

document.addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".edit-btn");
  if (editBtn) {
    const kind = editBtn.dataset.kind, id = Number(editBtn.dataset.id);
    const row = DATA_ARRAY[kind]().find((r) => r.id === id);
    const opener = EDIT_OPENER[kind];
    if (row && opener) opener(row);
    return;
  }
  const delBtn = e.target.closest(".del-btn");
  if (delBtn) {
    const kind = delBtn.dataset.kind, id = Number(delBtn.dataset.id);
    const msg = kind === "kontrak"
      ? "Hapus item kontrak ini? Laporan Produksi Harian yang sudah memakai item ini akan tetap ada tapi kehilangan sambungannya ke kontrak. Lanjutkan?"
      : "Hapus data ini? Tindakan ini tidak bisa dibatalkan.";
    if (!confirm(msg)) return;
    try {
      await apiDelete(kind, id);
      const arr = DATA_ARRAY[kind]();
      const idx = arr.findIndex((r) => r.id === id);
      if (idx >= 0) arr.splice(idx, 1);
      showToast("Data dihapus.");
      refreshAll();
    } catch (err) {
      showToast(err.message || "Gagal menghapus data.", true);
    }
  }
});

/* ---------------------------------------------------------------------
   Filter listeners
--------------------------------------------------------------------- */
$("#produksiProjectFilter").addEventListener("change", () => { populateProduksiTypeFilter(); renderProduksiTable(); });
$("#produksiTypeFilter").addEventListener("change", renderProduksiTable);
$("#produksiSearch").addEventListener("input", renderProduksiTable);
["#ritasiProjectFilter", "#ritasiUnitFilter", "#ritasiSearch"].forEach((sel) => $(sel).addEventListener("input", renderRitasiTable));
["#bbmProjectFilter", "#bbmTypeFilter", "#bbmSearch"].forEach((sel) => $(sel).addEventListener("input", renderBbmTable));

// Download Excel — rekap pemakaian BBM per alat (dari awal s.d saat ini), sesuai
// format laporan BBM yang dikirim: per alat, plus ringkasan masuk/keluar/saldo.
function exportBbmExcel() {
  const projFilter = $("#bbmProjectFilter").value;
  const project = PROJECTS.find((p) => p.id === projFilter) || null;
  const rows = projFilter === "all" ? fuel.slice() : fuel.filter((r) => r.projectId === projFilter);
  if (!rows.length) { showToast("Belum ada data BBM untuk di-export."); return; }
  const dates = rows.map((r) => r.date).sort();
  const periodeAwal = fmtDateLong(dates[0]);
  const periodeAkhir = fmtDateLong(dates[dates.length - 1]);
  const list = bbmPerAlatTotals(projFilter);
  const keluarTotal = rows.filter((r) => r.type === "keluar").reduce((s, r) => s + r.liters, 0);
  const masukTotal = rows.filter((r) => r.type === "masuk").reduce((s, r) => s + r.liters, 0);
  const saldo = masukTotal - keluarTotal;

  const aoa = [];
  aoa.push(["LAPORAN PEMAKAIAN BBM SOLAR"]);
  aoa.push([project ? project.name : "Semua Proyek"]);
  aoa.push(["Periode: " + periodeAwal + " s.d " + periodeAkhir]);
  aoa.push([]);
  aoa.push(["No", "Nama Alat", "Jenis", "Total Pemakaian BBM S.d Saat Ini (Liter)"]);
  list.forEach((r, i) => aoa.push([i + 1, r.nama, r.jenis, r.total]));
  aoa.push([]);
  aoa.push(["", "", "Total Keluar BBM (Pemakaian) S.d Saat Ini (Liter)", keluarTotal]);
  aoa.push(["", "", "Total BBM Masuk S.d Saat Ini (Liter)", masukTotal]);
  aoa.push(["", "", "Sisa Saldo BBM Saat Ini (Liter)", saldo]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 6 }, { wch: 30 }, { wch: 16 }, { wch: 38 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BBM per Alat");
  const safeName = (project ? project.name : "SemuaProyek").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  XLSX.writeFile(wb, `Laporan-BBM-per-Alat-${safeName}.xlsx`);
  showToast("File Excel rekap BBM per alat sudah diunduh.");
}
$("#bbmExportBtn").addEventListener("click", exportBbmExcel);
["#alatProjectFilter", "#alatJenisFilter", "#alatStatusFilter", "#alatSearch"].forEach((sel) => $(sel).addEventListener("input", renderAlatTable));
["#manpowerProjectFilter", "#manpowerSearch"].forEach((sel) => $(sel).addEventListener("input", renderManpowerTable));
$("#cuacaProjectFilter").addEventListener("change", renderCuacaTable);

/* ---------------------------------------------------------------------
   Download Excel — satu tombol per menu (Produksi, Ritasi, Alat, Manpower,
   Cuaca, Isu, Realisasi Progres), semua lewat helper generik downloadWorkbook.
--------------------------------------------------------------------- */
function safeFileNameFragment(name) { return String(name).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, ""); }
function downloadWorkbook(title, project, sheetName, aoa, colWidths, fileNamePrefix) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (colWidths) ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const safeName = safeFileNameFragment(project ? project.name : "SemuaProyek");
  XLSX.writeFile(wb, `${fileNamePrefix}-${safeName}.xlsx`);
  showToast(`File Excel ${title} sudah diunduh.`);
}

function exportProduksiExcel() {
  const projFilter = $("#produksiProjectFilter").value;
  const typeFilter = $("#produksiTypeFilter").value;
  const q = $("#produksiSearch").value.trim().toLowerCase();
  const project = PROJECTS.find((p) => p.id === projFilter) || null;
  let rows = production.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (typeFilter !== "all") rows = rows.filter((r) => { const item = findKontrakItem(r.kontrakItemId); return item && item.uraian === typeFilter; });
  if (q) rows = rows.filter((r) => (r.zona + " " + r.equipment + " " + (r.notes || "")).toLowerCase().includes(q));
  if (!rows.length) { showToast("Belum ada data Produksi Harian untuk di-export."); return; }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const aoa = [["LAPORAN PRODUKSI HARIAN"], [project ? project.name : "Semua Proyek"], []];
  aoa.push(["Tanggal", "Jenis Pekerjaan", "Volume", "Satuan", "Zona/Lokasi", "Jenis Alat", "Detail Alat/Unit", "Catatan"]);
  rows.forEach((r) => {
    const item = findKontrakItem(r.kontrakItemId);
    aoa.push([fmtDateLong(r.date), item ? item.uraian : "(item dihapus)", r.volume, item ? item.satuan : r.unit, r.zona || "", (r.equipmentTypes || []).join(", "), r.equipment || "", r.notes || ""]);
  });
  downloadWorkbook("Produksi Harian", project, "Produksi Harian", aoa,
    [{ wch: 14 }, { wch: 34 }, { wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 26 }, { wch: 34 }], "Laporan-Produksi-Harian");
}
$("#produksiExportBtn").addEventListener("click", exportProduksiExcel);

function exportRitasiExcel() {
  const projFilter = $("#ritasiProjectFilter").value;
  const unitFilter = $("#ritasiUnitFilter").value;
  const q = $("#ritasiSearch").value.trim().toLowerCase();
  const project = PROJECTS.find((p) => p.id === projFilter) || null;
  let rows = ritasi.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (unitFilter && unitFilter !== "all") rows = rows.filter((r) => r.unit === unitFilter);
  if (q) rows = rows.filter((r) => (r.unit + " " + (r.notes || "")).toLowerCase().includes(q));
  if (!rows.length) { showToast("Belum ada data Ritasi DT untuk di-export."); return; }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const aoa = [["LAPORAN RITASI DUMP TRUCK (DT)"], [project ? project.name : "Semua Proyek"], []];
  aoa.push(["Tanggal", "Unit DT", "Jenis Pekerjaan", "Jumlah Ritasi", "Kapasitas/Rit (M3)", "Total Volume (M3)", "Catatan"]);
  rows.forEach((r) => {
    const item = findKontrakItem(r.kontrakItemId);
    aoa.push([fmtDateLong(r.date), r.unit, item ? item.uraian : "(item dihapus)", r.count, r.capacity, r.count * r.capacity, r.notes || ""]);
  });
  downloadWorkbook("Ritasi DT", project, "Ritasi DT", aoa,
    [{ wch: 14 }, { wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 34 }], "Laporan-Ritasi-DT");
}
$("#ritasiExportBtn").addEventListener("click", exportRitasiExcel);

function exportAlatExcel() {
  const projFilter = $("#alatProjectFilter").value;
  const jenisFilter = $("#alatJenisFilter").value;
  const statusFilter = $("#alatStatusFilter").value;
  const q = $("#alatSearch").value.trim().toLowerCase();
  const project = PROJECTS.find((p) => p.id === projFilter) || null;
  let rows = equipment.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (jenisFilter !== "all") rows = rows.filter((r) => r.jenis === jenisFilter);
  if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
  if (q) rows = rows.filter((r) => (r.nama + " " + (r.notes || "")).toLowerCase().includes(q));
  if (!rows.length) { showToast("Belum ada data Alat untuk di-export."); return; }
  rows.sort((a, b) => a.nama.localeCompare(b.nama));
  const aoa = [["TABULASI STATUS ALAT"], [project ? project.name : "Semua Proyek"], []];
  aoa.push(["Nama Alat", "Jenis", "Status", "Catatan"]);
  rows.forEach((r) => aoa.push([r.nama, r.jenis, ALAT_STATUS_LABEL[r.status] || r.status, r.notes || ""]));
  downloadWorkbook("Alat", project, "Alat", aoa,
    [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 34 }], "Laporan-Alat");
}
$("#alatExportBtn").addEventListener("click", exportAlatExcel);

function exportManpowerExcel() {
  const projFilter = $("#manpowerProjectFilter").value;
  const q = $("#manpowerSearch").value.trim().toLowerCase();
  const project = PROJECTS.find((p) => p.id === projFilter) || null;
  let rows = manpower.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (q) rows = rows.filter((r) => (r.jabatan + " " + (r.notes || "")).toLowerCase().includes(q));
  if (!rows.length) { showToast("Belum ada data Manpower untuk di-export."); return; }
  rows.sort((a, b) => a.jabatan.localeCompare(b.jabatan));
  const aoa = [["TABULASI MANPOWER"], [project ? project.name : "Semua Proyek"], []];
  aoa.push(["Jabatan", "Jumlah Orang", "Catatan"]);
  let total = 0;
  rows.forEach((r) => { total += r.jumlahOrang; aoa.push([r.jabatan, r.jumlahOrang, r.notes || ""]); });
  aoa.push([]);
  aoa.push(["Total", total, ""]);
  downloadWorkbook("Manpower", project, "Manpower", aoa,
    [{ wch: 28 }, { wch: 14 }, { wch: 34 }], "Laporan-Manpower");
}
$("#manpowerExportBtn").addEventListener("click", exportManpowerExcel);

function exportCuacaExcel() {
  const projFilter = $("#cuacaProjectFilter").value;
  const project = PROJECTS.find((p) => p.id === projFilter) || null;
  let rows = weather.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (!rows.length) { showToast("Belum ada data Cuaca untuk di-export."); return; }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const aoa = [["LAPORAN CUACA HARIAN"], [project ? project.name : "Semua Proyek"], []];
  aoa.push(["Tanggal", "Kondisi", "Curah Hujan (mm)", "Jam Terhambat", "Catatan"]);
  rows.forEach((r) => aoa.push([fmtDateLong(r.date), WEATHER_LABEL[r.condition] || r.condition, r.rainfallMm || 0, r.hoursLost || 0, r.notes || ""]));
  downloadWorkbook("Cuaca", project, "Cuaca", aoa,
    [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 34 }], "Laporan-Cuaca");
}
$("#cuacaExportBtn").addEventListener("click", exportCuacaExcel);

function exportIsuExcel() {
  const projFilter = $("#isuProjectFilter").value;
  const kategoriFilter = $("#isuKategoriFilter").value;
  const statusFilter = $("#isuStatusFilter").value;
  const q = $("#isuSearch").value.trim().toLowerCase();
  const project = PROJECTS.find((p) => p.id === projFilter) || null;
  let rows = isu.slice();
  if (projFilter !== "all") rows = rows.filter((r) => r.projectId === projFilter);
  if (kategoriFilter !== "all") rows = rows.filter((r) => r.kategori === kategoriFilter);
  if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
  if (q) rows = rows.filter((r) => (r.judul + " " + (r.deskripsi || "")).toLowerCase().includes(q));
  if (!rows.length) { showToast("Belum ada data Isu untuk di-export."); return; }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const aoa = [["CATATAN ISU EKSTERNAL, INTERNAL & K3"], [project ? project.name : "Semua Proyek"], []];
  aoa.push(["Tanggal", "Kategori", "Tingkat Keparahan (K3)", "Judul", "Status", "Deskripsi", "Tindakan Perbaikan", "Ada Foto Bukti"]);
  rows.forEach((r) => aoa.push([
    fmtDateLong(r.date), ISU_KATEGORI_LABEL[r.kategori] || r.kategori, r.keparahan ? (ISU_KEPARAHAN_LABEL[r.keparahan] || r.keparahan) : "",
    r.judul, ISU_STATUS_LABEL[r.status] || r.status, r.deskripsi || "", r.tindakanPerbaikan || "", r.foto ? "Ya" : "Tidak",
  ]));
  downloadWorkbook("Isu", project, "Isu", aoa,
    [{ wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 40 }, { wch: 40 }, { wch: 14 }], "Laporan-Isu");
}
$("#isuExportBtn").addEventListener("click", exportIsuExcel);

function exportKontrakExcel() {
  const projFilter = $("#kontrakProjectFilter").value || state.projectId;
  const project = PROJECTS.find((p) => p.id === projFilter) || null;
  const rows = computeKontrakRows(projFilter);
  if (!rows.length) { showToast("Belum ada item kontrak untuk di-export."); return; }
  const totalProgress = rows.reduce((s, r) => s + r.bobotTercapai, 0);
  const aoa = [["REALISASI PROGRES S.D INI"], [project ? project.name : "Semua Proyek"], [`Progress Kumulatif: ${fmtNum2(totalProgress)}%`]];
  aoa.push([]);
  aoa.push(["No", "Uraian Pekerjaan", "Satuan", "Volume Kontrak", "Bobot (%)", "Volume Tercapai", "% Item", "Bobot Tercapai (%)"]);
  rows.forEach((r) => aoa.push([r.no, r.uraian, r.satuan, r.volumeKontrak, Math.round(r.bobot * 100) / 100, Math.round(r.achieved * 100) / 100, Math.round(r.pctItem * 100) / 100, Math.round(r.bobotTercapai * 100) / 100]));
  downloadWorkbook("Realisasi Progres", project, "Realisasi Progres", aoa,
    [{ wch: 6 }, { wch: 40 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 16 }], "Laporan-Realisasi-Progres");
}
$("#kontrakExportBtn").addEventListener("click", exportKontrakExcel);

/* ---------------------------------------------------------------------
   Refresh / init
--------------------------------------------------------------------- */
function refreshAll() {
  if (!state.projectId) return;
  renderKpis();
  renderProductionChart();
  renderFuelChart();
  renderIssues();
  renderBerandaIsuAlert();
  renderProduksiTable();
  renderRitasiTable();
  renderBbmTable();
  renderAlatTable();
  renderManpowerTable();
  renderCuacaTable();
  renderDokumenView();
  renderIsuList();
  renderKontrakTable();
  renderKurvaSChart();
  renderRencanaTable();
}

/* ---------------------------------------------------------------------
   Widget estimasi cuaca — Rote Timur, Rote Ndao, NTT (live, via Open-Meteo)
   Koordinat perkiraan pusat Kecamatan Rote Timur (bagian timur Pulau Rote).
--------------------------------------------------------------------- */
const ROTE_TIMUR_LAT = -10.85;
const ROTE_TIMUR_LON = 123.55;
const WMO_INFO = {
  0: { label: "Cerah", icon: "☀️" },
  1: { label: "Cerah Berawan", icon: "🌤️" },
  2: { label: "Berawan Sebagian", icon: "⛅" },
  3: { label: "Berawan", icon: "☁️" },
  45: { label: "Berkabut", icon: "🌫️" },
  48: { label: "Berkabut", icon: "🌫️" },
  51: { label: "Gerimis Ringan", icon: "🌦️" },
  53: { label: "Gerimis", icon: "🌦️" },
  55: { label: "Gerimis Lebat", icon: "🌧️" },
  61: { label: "Hujan Ringan", icon: "🌧️" },
  63: { label: "Hujan", icon: "🌧️" },
  65: { label: "Hujan Lebat", icon: "🌧️" },
  80: { label: "Hujan Lokal", icon: "🌦️" },
  81: { label: "Hujan Lokal Sedang", icon: "🌧️" },
  82: { label: "Hujan Lokal Lebat", icon: "⛈️" },
  95: { label: "Badai Petir", icon: "⛈️" },
  96: { label: "Badai Petir + Hujan Es", icon: "⛈️" },
  99: { label: "Badai Petir Hebat", icon: "⛈️" },
};
function wmoInfo(code, isDay) {
  const info = WMO_INFO[code] || { label: "Tidak diketahui", icon: "❓" };
  if (isDay === 0) {
    if (code === 0 || code === 1) return { label: info.label, icon: "🌙" };
    if (code === 2 || code === 3) return { label: info.label, icon: "☁️" };
  }
  return info;
}

async function loadWeatherWidget() {
  const bodies = $$(".weather-widget-body");
  const updatedEls = $$(".weather-widget-updated");
  if (!bodies.length) return;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${ROTE_TIMUR_LAT}&longitude=${ROTE_TIMUR_LON}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FMakassar&forecast_days=2`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const cur = data.current;
    const curInfo = wmoInfo(cur.weather_code);
    const days = data.daily.time.map((date, i) => ({
      date, code: data.daily.weather_code[i], max: data.daily.temperature_2m_max[i],
      min: data.daily.temperature_2m_min[i], rainProb: data.daily.precipitation_probability_max[i],
    }));

    // Jam berjalan (real-time) — 24 jam ke depan mulai dari jam sekarang (waktu WITA dari API).
    let startIdx = data.hourly.time.findIndex((t) => t >= cur.time);
    if (startIdx < 0) startIdx = 0;
    const hours = [];
    for (let i = startIdx; i < startIdx + 24 && i < data.hourly.time.length; i++) {
      hours.push({
        time: data.hourly.time[i],
        code: data.hourly.weather_code[i],
        isDay: data.hourly.is_day[i],
        temp: data.hourly.temperature_2m[i],
        humidity: data.hourly.relative_humidity_2m[i],
        wind: data.hourly.wind_speed_10m[i],
        rainProb: data.hourly.precipitation_probability[i],
      });
    }

    const html = `
      <div class="weather-tabs">
        <button class="weather-tab active" data-wtab="ringkasan">Ringkasan</button>
        <button class="weather-tab" data-wtab="perjam">Per Jam</button>
        <button class="weather-tab" data-wtab="mingguan">Suhu Mingguan</button>
      </div>

      <div class="weather-tab-panel" data-wpanel="ringkasan">
        <div style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
          <div style="font-size:44px; line-height:1;">${curInfo.icon}</div>
          <div>
            <div style="font-size:28px; font-weight:700;">${Math.round(cur.temperature_2m)}°C</div>
            <div style="color:var(--ink-2); font-size:13px;">${curInfo.label} · Kelembapan ${cur.relative_humidity_2m}% · Angin ${Math.round(cur.wind_speed_10m)} km/j</div>
          </div>
        </div>
      </div>

      <div class="weather-tab-panel hidden" data-wpanel="perjam">
        <div class="contract-note" style="margin-bottom:10px;">Perkiraan tiap jam, real-time mengikuti jam berjalan (WITA) — geser ke kanan untuk lihat 24 jam ke depan.</div>
        <div class="weather-hourly-wrap">
          <button class="weather-hour-scrollbtn" data-wscroll="-1" type="button">◀</button>
          <div class="weather-hourly-scroll">
            ${hours.map((h) => {
              const info = wmoInfo(h.code, h.isDay);
              const hh = h.time.slice(11, 16);
              return `<div class="weather-hour-card${h.isDay === 0 ? " is-night" : ""}">
                <div class="hh">${hh} WITA</div>
                <div class="icon">${info.icon}</div>
                <div class="temp">${Math.round(h.temp)}°C</div>
                <div class="cond">${info.label}</div>
                <div class="meta">${h.humidity}%</div>
                <div class="meta">💨 ${Math.round(h.wind)} km/j</div>
              </div>`;
            }).join("")}
          </div>
          <button class="weather-hour-scrollbtn" data-wscroll="1" type="button">▶</button>
        </div>
      </div>

      <div class="weather-tab-panel hidden" data-wpanel="mingguan">
        <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:8px;">
          ${days.map((d, i) => {
            const info = wmoInfo(d.code);
            const dayLabel = i === 0 ? "Hari ini" : new Date(d.date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short" });
            return `<div style="text-align:center; background:var(--surface-2); border-radius:6px; padding:10px 6px;">
              <div style="font-size:11px; color:var(--muted); margin-bottom:4px;">${dayLabel}</div>
              <div style="font-size:22px;">${info.icon}</div>
              <div style="font-size:12px; margin-top:4px;">${Math.round(d.max)}° / ${Math.round(d.min)}°</div>
              <div style="font-size:10px; color:var(--muted);">${d.rainProb}% hujan</div>
            </div>`;
          }).join("")}
        </div>
      </div>
    `;
    const updatedText = "Update: " + new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    bodies.forEach((body) => { body.className = "weather-widget-body"; body.innerHTML = html; });
    updatedEls.forEach((el) => { el.textContent = updatedText; });
  } catch (err) {
    bodies.forEach((body) => {
      body.className = "weather-widget-body empty-note";
      body.innerHTML = "Tidak bisa memuat estimasi cuaca live (perlu koneksi internet ke layanan Open-Meteo). Koordinat perkiraan Rote Timur: " + ROTE_TIMUR_LAT + ", " + ROTE_TIMUR_LON + ".";
    });
    updatedEls.forEach((el) => { el.textContent = ""; });
  }
}
loadWeatherWidget();

// Tab & scroll widget cuaca (delegated — widget-nya dirender ulang tiap loadWeatherWidget()).
document.addEventListener("click", (e) => {
  const tabBtn = e.target.closest(".weather-tab");
  if (tabBtn) {
    const body = tabBtn.closest(".weather-widget-body");
    if (!body) return;
    body.querySelectorAll(".weather-tab").forEach((b) => b.classList.toggle("active", b === tabBtn));
    const tab = tabBtn.dataset.wtab;
    body.querySelectorAll(".weather-tab-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.wpanel !== tab));
    return;
  }
  const scrollBtn = e.target.closest(".weather-hour-scrollbtn");
  if (scrollBtn) {
    const scroller = scrollBtn.parentElement.querySelector(".weather-hourly-scroll");
    if (scroller) scroller.scrollBy({ left: 260 * Number(scrollBtn.dataset.wscroll), behavior: "smooth" });
  }
});

/* ---------------------------------------------------------------------
   Login Pengelola — akses menu beda-beda per akun:
   - Pemilik: semua menu.
   - Pengelola BBM: cuma menu BBM.
   - Pengelola Alat: cuma menu Alat.
   - Tidak login (Pengunjung): tetap bisa lihat & download data di SEMUA
     menu (termasuk Download Excel BBM, download dokumen), tapi tombol
     Tambah/Edit/Hapus disembunyikan di seluruh halaman.
   Login yang sama ini juga dipakai untuk buka tab "Chat Internal" (baca
   pesan) — siapa saja yang berhasil login sebagai pengelola (akun mana pun)
   bisa baca semua pesan masuk, karena pesannya tidak dikelompokkan per menu.
   Login & hak akses ini divalidasi di SERVER (bukan cuma disembunyikan di
   tampilan) — lihat POST /api/login & middleware requireWrite() di server.js.
--------------------------------------------------------------------- */
function renderAuthArea() {
  const el = $("#authArea");
  if (state.pengelolaRole) {
    el.innerHTML = `<span class="auth-user-label">👤 ${escapeHtml(state.pengelolaLabel)}</span><button class="btn ghost" id="authLogoutBtn" style="padding:6px 12px; font-size:12px;">Keluar</button>`;
  } else {
    el.innerHTML = `<button class="auth-icon-btn" id="authLoginBtn" type="button" title="Masuk Pengelola" aria-label="Masuk Pengelola">👤</button>`;
  }
}
function openLoginModal() {
  $("#login-username").value = "";
  $("#login-password").value = "";
  $("#login-error").style.display = "none";
  $("#modal-login").classList.remove("hidden");
}

function logoutPengelola() {
  apiFetch("/api/logout", { method: "POST" }).catch(() => {});
  state.pengelolaRole = null;
  state.pengelolaLabel = null;
  state.chatView = "list";
  renderAuthArea();
  applyRoleAccess();
  renderLiveChatArea();
  showToast("Berhasil keluar dari akun pengelola.");
}
$("#authArea").addEventListener("click", (e) => {
  if (e.target.closest("#authLoginBtn")) openLoginModal();
  else if (e.target.closest("#authLogoutBtn")) logoutPengelola();
});

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const u = $("#login-username").value.trim();
  const p = $("#login-password").value;
  try {
    const acc = await apiFetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
    state.pengelolaRole = acc.role;
    state.pengelolaLabel = acc.label;
    state.chatView = "list";
    closeModal($("#modal-login"));
    renderAuthArea();
    applyRoleAccess();
    loadChatSessionsForPengelola().then(renderLiveChatArea);
    showToast(`Masuk sebagai ${acc.label}.`);
  } catch (err) {
    $("#login-error").textContent = err.message || "Username atau password salah. Coba lagi.";
    $("#login-error").style.display = "block";
  }
});

// Filter menu di sidebar sesuai role yang sedang login (null role = semua
// menu terlihat, mode Pengunjung/lihat-download saja).
function applyRoleAccess() {
  const allowed = state.pengelolaRole ? ROLE_ALLOWED_VIEWS[state.pengelolaRole] : null;
  document.body.classList.toggle("role-visitor", !state.pengelolaRole);
  $$(".navlink").forEach((btn) => {
    const visible = !allowed || allowed.includes(btn.dataset.view);
    btn.classList.toggle("hidden", !visible);
  });
  if (allowed && !allowed.includes(state.view)) {
    setView(allowed[0]);
  }
}

/* ---------------------------------------------------------------------
   Live Chat (floating widget)
   Tab "Kontak Cepat": link langsung WA/email (bukan chatbot AI sungguhan).
   Tab "Live Chat": pengunjung (tanpa login) mulai sesi obrolan baru,
   dikenali lewat ID sesi tersimpan di localStorage browsernya; Pengelola
   (akun manapun yang login) melihat SEMUA sesi sebagai inbox & membalas
   satu-satu. Ada auto-reply bot ringan (keyword-matching, bukan AI) untuk
   pertanyaan umum di sisi pengunjung.
--------------------------------------------------------------------- */
let chatSessions = [];
const VISITOR_SESSION_KEY = "pt-visitor-session-id";
try {
  const savedVid = localStorage.getItem(VISITOR_SESSION_KEY);
  if (savedVid) state.visitorSessionId = Number(savedVid);
} catch (err) { /* localStorage tidak tersedia — bukan fatal, cuma berarti sesi tidak diingat */ }

function findChatSession(id) { return chatSessions.find((s) => s.id === id); }
function myVisitorSession() { return state.visitorSessionId ? findChatSession(state.visitorSessionId) : null; }

async function loadChatSessionsForPengelola() {
  try {
    chatSessions = await apiFetch("/api/chat/sessions");
  } catch (err) {
    console.error("Gagal memuat Live Chat:", err);
  }
}
async function refreshMyVisitorSession() {
  if (!state.visitorSessionId) return;
  try {
    const fresh = await apiFetch(`/api/chat/sessions/${state.visitorSessionId}`);
    const idx = chatSessions.findIndex((s) => s.id === fresh.id);
    if (idx >= 0) chatSessions[idx] = fresh; else chatSessions.push(fresh);
  } catch (err) { /* sesi mungkin belum ada / gagal jaringan — biarkan, coba lagi di polling berikutnya */ }
}

function fmtChatTime(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : fmtDateLong(String(iso).slice(0, 10));
}
function scrollChatToBottom() {
  const list = $("#chatMsgList");
  if (list) list.scrollTop = list.scrollHeight;
}

const CHAT_BOT_FAQ = [
  { keywords: ["jadwal", "progres", "kapan selesai", "target selesai"], answer: "Untuk progres & jadwal terkini bisa dicek di menu Beranda (ringkasan) atau Realisasi Progres (persentase terhadap kontrak) — datanya update tiap ada laporan harian baru. 🙂" },
  { keywords: ["lokasi", "alamat", "dimana", "di mana"], answer: "Untuk titik lokasi proyek yang lebih detail, silakan tanyakan ke tim lewat tab \"Kontak Cepat\" atau lanjut chat di sini." },
  { keywords: ["jam kerja", "jam operasional", "buka jam berapa"], answer: "Jam kerja lapangan umumnya 07.00–17.00, menyesuaikan cuaca & kondisi lapangan pada hari itu." },
  { keywords: ["dokumen", "download", "unduh"], answer: "Dokumen proyek bisa diunduh lewat menu Dokumen. Sebagian folder butuh password — hubungi Pengelola kalau belum punya aksesnya." },
  { keywords: ["lapor", "keluhan", "komplain", "kendala", "isu"], answer: "Terima kasih laporannya 🙏 — akan diteruskan ke tim untuk ditindaklanjuti. Status isu yang sedang berjalan juga bisa dipantau di menu Beranda / Isu Eksternal & Internal." },
  { keywords: ["login", "password", "masuk akun", "lupa password"], answer: "Login Pengelola pakai tombol 👤 di kanan atas. Kalau lupa/butuh akses, silakan hubungi Pengelola langsung ya." },
  { keywords: ["kontak", "telepon", "nomor hp", "hubungi", "whatsapp"], answer: "Kontak cepat tim kami ada di tab \"Kontak Cepat\" (WhatsApp & email) — atau tetap lanjut chat di sini, nanti dibalas Pengelola. 🙂" },
  { keywords: ["terima kasih", "makasih", "thanks"], answer: "Sama-sama! 🙏 Kalau ada pertanyaan lain, tulis saja di sini ya." },
  { keywords: ["halo", "hai", "pagi", "siang", "sore", "malam"], answer: "Halo juga! 👋 Ada yang bisa dibantu terkait proyek ini? Kamu bisa tanya soal jadwal, lokasi, dokumen, atau langsung tulis pesan untuk Pengelola." },
];
const CHAT_BOT_FALLBACK = "Terima kasih pesannya! Pesan kamu tersimpan, nanti dibalas Pengelola kalau sempat login (biasanya di jam kerja). Untuk yang mendesak, coba tab \"Kontak Cepat\" (WA/email) ya.";
function findBotAnswer(text) {
  const lower = text.toLowerCase();
  const hit = CHAT_BOT_FAQ.find((item) => item.keywords.some((k) => lower.includes(k)));
  return hit ? hit.answer : null;
}
async function maybeBotReply(session, text) {
  const answer = findBotAnswer(text);
  const alreadyGotAnyReply = session.messages.some((m) => m.from !== "visitor");
  const replyText = answer || (alreadyGotAnyReply ? null : CHAT_BOT_FALLBACK);
  if (!replyText) return;
  session.botTyping = true;
  renderLiveChatArea();
  setTimeout(async () => {
    session.botTyping = false;
    try {
      const msg = await apiFetch(`/api/chat/sessions/${session.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: replyText, asBot: true }) });
      session.messages.push(msg);
    } catch (err) { console.error("Gagal mengirim balasan bot:", err); }
    renderLiveChatArea();
  }, 700);
}

function renderChatBubble(m, isPengelola) {
  if (m.from === "bot") {
    return `
      <div class="chat-bubble-row bot">
        <div class="chat-bubble bot-bubble">
          <div>🤖 ${escapeHtml(m.text)}</div>
          <div class="chat-bubble-meta">${escapeHtml(m.authorName)} · ${fmtChatTime(m.createdAt)}</div>
        </div>
      </div>
    `;
  }
  const mine = isPengelola ? m.from === "pengelola" : m.from === "visitor";
  return `
    <div class="chat-bubble-row${mine ? " mine" : ""}">
      <div class="chat-bubble">
        <div>${escapeHtml(m.text)}</div>
        <div class="chat-bubble-meta">${escapeHtml(m.authorName)} · ${fmtChatTime(m.createdAt)}</div>
      </div>
    </div>
  `;
}

function renderChatInbox(el) {
  const sessions = chatSessions.slice().sort((a, b) => {
    const at = a.messages.length ? a.messages[a.messages.length - 1].createdAt : "";
    const bt = b.messages.length ? b.messages[b.messages.length - 1].createdAt : "";
    return String(bt).localeCompare(String(at));
  });
  el.innerHTML = `
    <div class="help-bot-msg"><span class="live-dot"></span>Live Chat — semua percakapan dengan pengunjung, klik untuk membalas.</div>
    <div class="chat-session-list" id="chatSessionList">
      ${sessions.length === 0 ? '<div class="empty-note">Belum ada percakapan masuk.</div>' : sessions.map((s) => {
        const last = s.messages[s.messages.length - 1];
        return `
        <button class="chat-session-item" data-session-id="${s.id}" type="button">
          <div class="csi-name">${escapeHtml(s.visitorName)}${s.pengelolaUnread ? '<span class="chat-unread-dot"></span>' : ""}</div>
          <div class="csi-preview">${last ? escapeHtml(last.text) : ""}</div>
          <div class="csi-time">${last ? fmtChatTime(last.createdAt) : ""}</div>
        </button>`;
      }).join("")}
    </div>
  `;
  $$("#chatSessionList .chat-session-item").forEach((btn) => btn.addEventListener("click", () => {
    state.chatView = Number(btn.dataset.sessionId);
    renderLiveChatArea();
  }));
}

function renderChatThreadView(el, session, isPengelola) {
  el.innerHTML = `
    <div class="chat-thread-head">
      ${isPengelola
        ? `<button class="chat-back-btn" id="chatBackBtn" type="button">← Semua Percakapan</button><span style="font-weight:700; font-size:12.5px;">${escapeHtml(session.visitorName)}</span>`
        : `<span class="live-dot"></span><span style="font-size:11.5px; color:var(--muted);">Live — mengobrol dengan Pengelola</span>`}
    </div>
    <div class="chat-msg-list" id="chatMsgList">
      ${session.messages.map((m) => renderChatBubble(m, isPengelola)).join("")}
      ${session.botTyping ? '<div class="chat-bubble-row bot"><div class="chat-bubble bot-bubble typing">🤖 Bot sedang mengetik…</div></div>' : ""}
    </div>
    <form class="chat-composer" id="chatComposerForm">
      <input type="text" id="chatComposerInput" placeholder="Tulis pesan..." autocomplete="off" required>
      <button type="submit" title="Kirim">➤</button>
    </form>
  `;
  if (isPengelola) $("#chatBackBtn").addEventListener("click", () => { state.chatView = "list"; renderLiveChatArea(); });
  $("#chatComposerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#chatComposerInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.disabled = true;
    try {
      const msg = await apiFetch(`/api/chat/sessions/${session.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text }) });
      session.messages.push(msg);
      if (isPengelola) session.pengelolaUnread = false; else session.visitorUnread = false;
      renderLiveChatArea();
      if (!isPengelola) {
        showToast("Pesan terkirim.");
        maybeBotReply(session, text);
      }
    } catch (err) {
      input.value = text;
      showToast(err.message || "Gagal mengirim pesan ke server — coba lagi.", true);
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
  apiFetch(`/api/chat/sessions/${session.id}/read`, { method: "POST" }).catch(() => {});
  if (isPengelola) session.pengelolaUnread = false; else session.visitorUnread = false;
  scrollChatToBottom();
}

function renderVisitorChatView(el) {
  const session = myVisitorSession();
  if (!session) {
    el.innerHTML = `
      <div class="help-bot-msg">👋 Halo! Tulis pesan untuk mulai Live Chat — tidak perlu login. Bot kami akan coba jawab otomatis dulu untuk pertanyaan umum (jadwal, lokasi, dokumen, dll). Untuk pertanyaan mendesak, lebih pasti sampai lewat tab "Kontak Cepat" (WA/email).</div>
      <form id="chatStartForm">
        <input type="text" id="chatStartName" placeholder="Nama kamu (opsional)" style="width:100%; margin-bottom:8px; padding:9px 10px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--ink); font-size:13px; box-sizing:border-box;">
        <textarea id="chatStartMessage" placeholder="Tulis pesan untuk pengelola..." required style="width:100%; min-height:64px; margin-bottom:8px; padding:9px 10px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--ink); font-size:13px; box-sizing:border-box; resize:vertical;"></textarea>
        <button type="submit" class="btn primary" style="width:100%;">Mulai Live Chat</button>
      </form>
    `;
    $("#chatStartForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#chatStartName").value.trim();
      const text = $("#chatStartMessage").value.trim();
      if (!text) return;
      const submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const s = await apiFetch("/api/chat/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, message: text }) });
        chatSessions.push(s);
        state.visitorSessionId = s.id;
        try { localStorage.setItem(VISITOR_SESSION_KEY, String(s.id)); } catch (err) { /* tidak fatal */ }
        showToast("Live Chat dimulai — pesan terkirim.");
        renderLiveChatArea();
        maybeBotReply(s, text);
      } catch (err) {
        showToast("Gagal memulai Live Chat ke server — coba lagi.", true);
        if (submitBtn) submitBtn.disabled = false;
      }
    });
    return;
  }
  renderChatThreadView(el, session, false);
}

function renderLiveChatArea() {
  const el = $("#liveChatArea");
  if (!el) return;
  if (state.pengelolaRole) {
    const openSession = state.chatView !== "list" ? findChatSession(state.chatView) : null;
    if (openSession) renderChatThreadView(el, openSession, true);
    else { state.chatView = "list"; renderChatInbox(el); }
  } else {
    renderVisitorChatView(el);
  }
  updateChatUnreadBadge();
}
function updateChatUnreadBadge() {
  const badge = $("#helpFabBadge");
  if (!badge) return;
  const show = state.pengelolaRole
    ? chatSessions.some((s) => s.pengelolaUnread)
    : !!(myVisitorSession() && myVisitorSession().visitorUnread);
  badge.classList.toggle("hidden", !show);
}

$("#helpFabBtn").addEventListener("click", () => { $("#helpPanel").classList.toggle("hidden"); });
$("#helpPanelClose").addEventListener("click", () => { $("#helpPanel").classList.add("hidden"); });

$$(".help-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".help-tab").forEach((t) => t.classList.toggle("active", t === tab));
    $("#helpTabQuick").classList.toggle("hidden", tab.dataset.tab !== "quick");
    $("#helpTabChat").classList.toggle("hidden", tab.dataset.tab !== "chat");
    if (tab.dataset.tab === "chat") renderLiveChatArea();
  });
});

// Polling ringan tiap 7 detik supaya sesi/pesan baru dari pihak lain (Pengelola
// di perangkat lain, atau pengunjung lain) kelihatan tanpa perlu refresh manual.
setInterval(async () => {
  const composerFocused = document.activeElement && document.activeElement.id === "chatComposerInput";
  if (composerFocused) return;
  if (state.pengelolaRole) await loadChatSessionsForPengelola();
  else await refreshMyVisitorSession();
  renderLiveChatArea();
}, 7000);

async function boot() {
  els.connBadge.textContent = "Menyambungkan ke server…";
  els.connBadge.className = "conn-badge";
  try {
    const data = await apiFetch("/api/bootstrap");
    PROJECTS = data.projects || [];
    kontrak = data.kontrak || [];
    production = data.production || [];
    ritasi = data.ritasi || [];
    fuel = data.fuel || [];
    equipment = data.equipment || [];
    manpower = data.manpower || [];
    weather = data.weather || [];
    documents = data.documents || [];
    isu = data.isu || [];
    docFolders = data.docFolders || [];
    rencanaProgress = data.rencana || [];
    fuelOpeningBalance = data.fuelOpeningBalance || {};
    projectPhotos = data.photos || {};
    state.projectId = PROJECTS[0] ? PROJECTS[0].id : null;
    state.documentsUnlocked = !!data.docsUnlocked;
    state.pengelolaRole = (data.session && data.session.role) || null;
    state.pengelolaLabel = (data.session && data.session.label) || null;
    state.chatView = "list";

    els.connBadge.textContent = "Tersambung ke server";
    els.connBadge.className = "conn-badge ok";

    fillProjectSelects();
    populateProduksiTypeFilter();
    populateFolderSelect();
    updateFileSizeHint();
    refreshAll();
    setView("overview");
    renderAuthArea();
    applyRoleAccess();
    startHeroAutoplay();
    if (state.pengelolaRole) await loadChatSessionsForPengelola();
    else await refreshMyVisitorSession();
    renderLiveChatArea();
  } catch (err) {
    els.connBadge.textContent = "Gagal tersambung ke server";
    els.connBadge.className = "conn-badge err";
    showToast("Gagal memuat data dari server. Coba refresh halaman.", true);
    console.error(err);
  }
}
boot();
