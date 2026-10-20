// =============================================================================
// Setup.gs — KONFIGURASI KLIEN + SETUP PERTAMA KALI
// -----------------------------------------------------------------------------
// Fail ini ada DUA tugas:
//   1. Blok CLIENT di bawah = satu-satunya tempat yang kena diedit untuk klien.
//   2. setupSystem() / menu "Setup Pertama Kali" = cipta semua yang sistem
//      perlukan (tab Sheet, folder Drive, kata laluan admin) dalam satu klik.
//
// Fail pasangan: Code.gs (logik Web App). Kedua-duanya mesti ada dalam projek.
// =============================================================================


// =============================================================================
// 1. KONFIGURASI KLIEN  (EDIT DI SINI SAHAJA)
// =============================================================================
// Nilai yang diapit dua garis-bawah di kiri & kanan (cth APP_NAME dalam bentuk itu)
// ialah placeholder. Kalau guna new-client.sh, ia diisi automatik. Kalau tidak,
// gantikan sendiri. setupSystem() akan MENOLAK jalan selagi placeholder wajib masih ada.

var CLIENT = {
  // Nama sistem — keluar di menu Sheet, tajuk PDF, subjek emel. Cth: "KARA-Di"
  APP_NAME:    "__APP_NAME__",

  // Nama organisasi — keluar di PDF & emel. Cth: "Pusat Khidmat Rakyat Karambunai"
  ORG_NAME:    "__ORG_NAME__",

  // Emel admin: untuk log masuk dashboard DAN penerima kod reset kata laluan.
  // Guna emel yang klien betul-betul boleh akses.
  ADMIN_EMAIL: "__ADMIN_EMAIL__",

  // URL laman web klien, berakhir dengan "/". Mula dengan alamat Cloudflare Pages, kemudian
  // tukar ke subdomain, dan akhirnya domain utama (docs/03 bahagian G). Cth:
  //   "https://abc-klien.pages.dev/"   →   "https://aduan.klien.my/"
  // Dipakai supaya server turut menghormati suis "tutup borang" / "maintenance"
  // yang ditetapkan dalam Sveltia CMS. Boleh dikosongkan — kalau kosong atau
  // tidak boleh dicapai, borang kekal diterima (fail-open).
  SITE_URL:    "__SITE_URL__",

  // Warna utama PDF (hex). Cth: "#1A4A9A"
  PRIMARY_COLOR: "__PRIMARY_COLOR__",

  // Pilihan: ID folder Drive tempat folder data dicipta. Kosong = My Drive.
  FOLDER_PARENT_ID: ""
};


// =============================================================================
// 2. KONSTAN SISTEM  (jangan ubah kecuali anda tahu apa yang anda buat)
// =============================================================================

var APP_VERSION = "template-1.0";

// Kunci kategori = nama tab dalam Sheet = kunci yang dihantar oleh portal.
var CATEGORY_LABELS = {
  "Jemputan":     "Jemputan Rasmi",
  "Permohonan":   "Mohon Bantuan",
  "Aduan":        "Aduan Rakyat",
  "Temujanji":    "Temujanji",
  "Maklum Balas": "Idea / Cadangan",
  "Sukarelawan":  "Sukarelawan"
};
var CATEGORY_KEYS = ["Jemputan", "Permohonan", "Aduan", "Temujanji", "Maklum Balas", "Sukarelawan"];

// Susunan lajur untuk SEMUA tab kategori.
var SHEET_HEADERS = [
  "Timestamp", "No. Rujukan", "Nama Penuh", "No. KP", "No. Telefon", "Emel",
  "Alamat", "Pilihan/Kategori", "Perincian 1", "Perincian 2", "Tarikh/Masa",
  "Lampiran", "STATUS", "UID", "Tarikh Selesai", "Laporan Penyelesaian"
];

// Kunci Script Properties (data yang dicipta oleh setup — jangan padam manual).
var P_SS_ID          = "KARADI_SS_ID";
var P_FOLDER_ROOT    = "KARADI_FOLDER_ROOT";
var P_FOLDER_REPORT  = "KARADI_FOLDER_REPORT";
var P_FOLDER_UPLOAD  = "KARADI_FOLDER_UPLOAD";
var P_FOLDER_CLOSURE = "KARADI_FOLDER_CLOSURE";
var P_SETUP_DONE     = "KARADI_SETUP_DONE";
var P_SETUP_AT       = "KARADI_SETUP_AT";
var PROP_PW_SALT     = "KARADI_ADMIN_PW_SALT";
var PROP_PW_HASH     = "KARADI_ADMIN_PW_HASH";
var PROP_SESSIONS    = "KARADI_ADMIN_SESSIONS";
var PROP_RESET       = "KARADI_ADMIN_RESET";


// =============================================================================
// 3. HELPER KONFIGURASI
// =============================================================================

function isPlaceholder_(v) {
  v = String(v === null || v === undefined ? "" : v).trim();
  return !v || /__[A-Z0-9_]+__/.test(v);
}

function appName_() {
  return isPlaceholder_(CLIENT.APP_NAME) ? "Sistem Aduan" : String(CLIENT.APP_NAME).trim();
}

function orgName_() {
  return isPlaceholder_(CLIENT.ORG_NAME) ? appName_() : String(CLIENT.ORG_NAME).trim();
}

function adminEmail_() {
  return String(CLIENT.ADMIN_EMAIL || "").trim();
}

function brandColor_() {
  var c = String(CLIENT.PRIMARY_COLOR || "").trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#1A4A9A";
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function hasAdminPassword_() {
  var p = props_();
  return !!(p.getProperty(PROP_PW_SALT) && p.getProperty(PROP_PW_HASH));
}

// Pastikan blok CLIENT sudah diisi. Throw mesej mesra kalau belum.
function assertClientConfigured_() {
  var problems = [];
  if (isPlaceholder_(CLIENT.APP_NAME))    problems.push("CLIENT.APP_NAME belum diisi");
  if (isPlaceholder_(CLIENT.ORG_NAME))    problems.push("CLIENT.ORG_NAME belum diisi");
  if (isPlaceholder_(CLIENT.ADMIN_EMAIL) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail_())) {
    problems.push("CLIENT.ADMIN_EMAIL belum diisi / bukan emel yang sah");
  }
  if (problems.length) {
    throw new Error("Setup dihentikan. Sila edit blok CLIENT di bahagian atas Setup.gs:\n- " + problems.join("\n- "));
  }
}


// =============================================================================
// 4. MENU DALAM GOOGLE SHEET
// =============================================================================
// Menu hanya muncul kalau script ni BOUND kepada Spreadsheet (dibuka melalui
// Sheet > Extensions > Apps Script). Kalau standalone, guna fungsi di editor:
// setupSystem(), checkSystem().

function onOpen() {
  try {
    var menu = SpreadsheetApp.getUi().createMenu("⚙️ " + appName_());
    if (!props_().getProperty(P_SETUP_DONE)) {
      menu.addItem("🚀 Setup Pertama Kali", "menuSetup").addSeparator();
    }
    menu
      .addItem("🔑 Tetapkan / Tukar Kata Laluan Admin", "menuSetPassword")
      .addItem("📧 Hantar Kod Reset ke Emel Admin", "menuSendResetCode")
      .addSeparator()
      .addItem("🔗 Papar URL Web App", "menuShowUrl")
      .addItem("🩺 Semak Status Sistem", "menuHealthCheck")
      .addSeparator()
      .addItem("🚪 Log Keluar Semua Sesi Admin", "menuRevokeSessions")
      .addSeparator()
      .addItem("🚀 Jalankan Setup Semula (selamat)", "menuSetup")
      .addToUi();
  } catch (e) {
    Logger.log("onOpen: menu tidak dapat dibina (script mungkin standalone). " + e);
  }
}

function promptNewPassword_(ui) {
  var r1 = ui.prompt("Kata Laluan Admin", "Masukkan kata laluan BAHARU (minimum 10 aksara):", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return null;
  var pw1 = r1.getResponseText();
  if (!pw1 || pw1.length < 10) {
    ui.alert("Gagal", "Kata laluan mesti sekurang-kurangnya 10 aksara.", ui.ButtonSet.OK);
    return null;
  }
  var r2 = ui.prompt("Sahkan Kata Laluan", "Masukkan sekali lagi untuk pengesahan:", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return null;
  if (r2.getResponseText() !== pw1) {
    ui.alert("Gagal", "Kata laluan tidak sepadan. Cuba lagi.", ui.ButtonSet.OK);
    return null;
  }
  return pw1;
}

function menuSetup() {
  var ui = SpreadsheetApp.getUi();
  var go = ui.alert(
    "Setup Pertama Kali — " + appName_(),
    "Setup akan:\n" +
    "• cipta 6 tab kategori dalam Sheet ini\n" +
    "• cipta folder Drive (Laporan, Muat Naik, Penyelesaian)\n" +
    "• tetapkan kata laluan admin (kalau belum ada)\n\n" +
    "Selamat dijalankan berulang kali — data sedia ada TIDAK dipadam.\n\nTeruskan?",
    ui.ButtonSet.OK_CANCEL
  );
  if (go !== ui.Button.OK) return;

  var pw = null;
  if (!hasAdminPassword_()) {
    pw = promptNewPassword_(ui);
    if (pw === null) return;
  }
  try {
    ui.alert("Setup Selesai", runSetup_(pw), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("Setup Gagal", String(e && e.message ? e.message : e), ui.ButtonSet.OK);
  }
}

function menuSetPassword() {
  var ui = SpreadsheetApp.getUi();
  var pw = promptNewPassword_(ui);
  if (pw === null) return;
  setAdminPassword_(pw);
  ui.alert("Berjaya", "Kata laluan admin telah ditetapkan.\n\nSemua sesi admin sedia ada dibatalkan — sila log masuk semula di dashboard.", ui.ButtonSet.OK);
}

function menuSendResetCode() {
  var ui = SpreadsheetApp.getUi();
  try {
    issueResetCode_();
    ui.alert("Kod Dihantar", "Kod reset 6-digit telah dihantar ke:\n" + adminEmail_() + "\n\nSah selama 15 minit. Masukkan kod itu di skrin 'Lupa Kata Laluan' dalam dashboard admin.", ui.ButtonSet.OK);
  } catch (e) {
    ui.alert("Gagal", "Tidak dapat hantar emel: " + e, ui.ButtonSet.OK);
  }
}

function menuShowUrl() {
  var ui = SpreadsheetApp.getUi();
  var url = "";
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = ""; }
  if (!url) {
    ui.alert("URL Tidak Tersedia", "Web App belum di-deploy. Pergi ke Deploy > New deployment (jenis: Web app).", ui.ButtonSet.OK);
    return;
  }
  ui.alert("URL Web App", url + "\n\nSalin URL ini ke APPS_SCRIPT_URL dalam fail config.js laman web.", ui.ButtonSet.OK);
}

function menuHealthCheck() {
  SpreadsheetApp.getUi().alert("Status Sistem — " + appName_(), healthReport_().join("\n"), SpreadsheetApp.getUi().ButtonSet.OK);
}

function menuRevokeSessions() {
  props_().deleteProperty(PROP_SESSIONS);
  SpreadsheetApp.getUi().alert("Selesai", "Semua sesi admin telah dibatalkan. Semua peranti kena log masuk semula.", SpreadsheetApp.getUi().ButtonSet.OK);
}


// =============================================================================
// 5. SETUP PERTAMA KALI
// =============================================================================

// Jalankan dari editor Apps Script (pilih "setupSystem" > Run).
// Editor tak boleh minta input, jadi kata laluan admin TIDAK ditetapkan di sini —
// selepas ini buka Sheet dan guna menu ⚙️ > Tetapkan / Tukar Kata Laluan Admin
// (atau guna menu "Setup Pertama Kali" yang sekali gus tanya kata laluan).
// Kata laluan sengaja tidak pernah disimpan dalam kod.
function setupSystem() {
  var report = runSetup_(null);
  Logger.log("\n" + report);
  return report;
}

// Semak kesihatan dari editor.
function checkSystem() {
  var lines = healthReport_();
  Logger.log("\n" + lines.join("\n"));
  return lines.join("\n");
}

function runSetup_(password) {
  assertClientConfigured_();
  var L = [];
  L.push("SETUP " + appName_().toUpperCase() + "  (" + APP_VERSION + ")");
  L.push("");

  var ss = ensureSpreadsheet_(L);
  ensureCategorySheets_(ss, L);
  ensureFolders_(L);

  if (password) {
    setAdminPassword_(password);
    L.push("✅ Kata laluan admin ditetapkan.");
  } else if (!hasAdminPassword_()) {
    L.push("⚠️ Kata laluan admin BELUM ditetapkan → menu ⚙️ > Tetapkan / Tukar Kata Laluan Admin.");
  } else {
    L.push("✅ Kata laluan admin sedia ada dikekalkan.");
  }

  props_().setProperty(P_SETUP_DONE, "1");
  props_().setProperty(P_SETUP_AT, new Date().toISOString());

  var url = "";
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = ""; }
  L.push("");
  L.push("LANGKAH SETERUSNYA:");
  L.push("1. Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).");
  L.push("2. Salin URL /exec ke APPS_SCRIPT_URL dalam site/config.js.");
  if (isPlaceholder_(CLIENT.SITE_URL)) {
    L.push("3. (Pilihan) Isi CLIENT.SITE_URL supaya suis 'tutup borang' dikuatkuasa di server juga.");
  }
  if (url) L.push("\nURL Web App semasa: " + url);
  return L.join("\n");
}

function ensureSpreadsheet_(L) {
  var p = props_();
  var ss = null;

  var savedId = p.getProperty(P_SS_ID);
  if (savedId) {
    try { ss = SpreadsheetApp.openById(savedId); } catch (e) { ss = null; }
  }
  if (!ss) {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(appName_() + " — Pangkalan Data");
    L.push("📄 Spreadsheet baharu dicipta: " + ss.getUrl());
  } else {
    L.push("📄 Spreadsheet: " + ss.getName());
  }
  try { ss.setSpreadsheetTimeZone("Asia/Kuala_Lumpur"); } catch (e) {}
  p.setProperty(P_SS_ID, ss.getId());
  return ss;
}

function ensureCategorySheets_(ss, L) {
  CATEGORY_KEYS.forEach(function (key) {
    var sh = ss.getSheetByName(key);
    var isNew = false;
    if (!sh) { sh = ss.insertSheet(key); isNew = true; }

    var hasHeader = sh.getLastRow() >= 1 && String(sh.getRange(1, 1).getValue()).trim() !== "";
    if (!hasHeader) {
      sh.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]).setFontWeight("bold").setBackground("#cfe2f3");
      sh.setFrozenRows(1);
    }

    // Lajur teks (elak "0123" jadi 123 / formula daripada input pengguna).
    var headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
    var idx = buildHeaderIndex_(headers);
    var maxRows = sh.getMaxRows();
    ["NO. RUJUKAN", "NO. TELEFON", "NO. KP"].forEach(function (h) {
      if (idx.hasOwnProperty(h)) sh.getRange(1, idx[h] + 1, maxRows, 1).setNumberFormat("@");
    });
    if (maxRows > 1) {
      ["TIMESTAMP", "TARIKH SELESAI"].forEach(function (h) {
        if (idx.hasOwnProperty(h)) sh.getRange(2, idx[h] + 1, maxRows - 1, 1).setNumberFormat("dd/MM/yyyy HH:mm");
      });
    }
    L.push((isNew ? "🆕 " : "✅ ") + "Tab '" + key + "' " + (isNew ? "dicipta" : "sedia ada"));
  });

  // Buang tab kosong lalai (Sheet1 / Helaian1) kalau ada.
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (CATEGORY_KEYS.indexOf(name) === -1 && /^(Sheet|Helaian|Lembaran)\s*\d+$/i.test(name) &&
        sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
    }
  });
}

function getOrCreateFolder_(propKey, parent, name) {
  var p = props_();
  var id = p.getProperty(propKey);
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* cipta semula di bawah */ }
  }
  var it = parent.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : parent.createFolder(name);
  p.setProperty(propKey, folder.getId());
  return folder;
}

function ensureFolders_(L) {
  var parent;
  if (CLIENT.FOLDER_PARENT_ID) {
    parent = DriveApp.getFolderById(CLIENT.FOLDER_PARENT_ID);
  } else {
    parent = DriveApp.getRootFolder();
  }
  var root    = getOrCreateFolder_(P_FOLDER_ROOT,    parent, appName_() + " — Data");
  var report  = getOrCreateFolder_(P_FOLDER_REPORT,  root,   "Laporan Serahan (PDF)");
  var upload  = getOrCreateFolder_(P_FOLDER_UPLOAD,  root,   "Muat Naik Fail Mentah");
  var closure = getOrCreateFolder_(P_FOLDER_CLOSURE, root,   "Laporan Penyelesaian");
  L.push("📁 Folder Drive: " + root.getName());
  L.push("   • " + report.getName());
  L.push("   • " + upload.getName());
  L.push("   • " + closure.getName());
}


// =============================================================================
// 6. SEMAK KESIHATAN SISTEM
// =============================================================================

function healthReport_() {
  var p = props_();
  var lines = [];
  lines.push("VERSI: " + APP_VERSION);
  lines.push("SETUP: " + (p.getProperty(P_SETUP_DONE) ? "✅ siap (" + p.getProperty(P_SETUP_AT) + ")" : "❌ BELUM — jalankan setupSystem()"));
  lines.push("KATA LALUAN ADMIN: " + (hasAdminPassword_() ? "✅ ditetapkan" : "❌ BELUM ditetapkan"));
  lines.push("EMEL ADMIN: " + (isPlaceholder_(CLIENT.ADMIN_EMAIL) ? "❌ belum diisi" : adminEmail_()));

  var sessions = readSessions_();
  var aktif = 0, now = Date.now();
  for (var k in sessions) { if (sessions[k] > now) aktif++; }
  lines.push("SESI ADMIN AKTIF: " + aktif);

  var url = "";
  try { url = ScriptApp.getService().getUrl(); } catch (e) {}
  lines.push("URL WEB APP: " + (url || "❌ belum deploy"));

  lines.push("");
  lines.push("SHEET:");
  var ssId = p.getProperty(P_SS_ID);
  if (!ssId) {
    lines.push("  ❌ belum disetup");
  } else {
    try {
      var ss = SpreadsheetApp.openById(ssId);
      CATEGORY_KEYS.forEach(function (key) {
        var sh = ss.getSheetByName(key);
        lines.push(sh ? ("  ✅ " + CATEGORY_LABELS[key] + " — " + Math.max(0, sh.getLastRow() - 1) + " rekod")
                      : ("  ❌ tab '" + key + "' TIDAK DIJUMPAI"));
      });
    } catch (e) {
      lines.push("  ❌ Spreadsheet tidak boleh dibuka: " + e);
    }
  }

  lines.push("");
  lines.push("FOLDER DRIVE:");
  [["Laporan Serahan", P_FOLDER_REPORT], ["Muat Naik", P_FOLDER_UPLOAD], ["Penyelesaian", P_FOLDER_CLOSURE]].forEach(function (f) {
    try { DriveApp.getFolderById(p.getProperty(f[1])); lines.push("  ✅ " + f[0]); }
    catch (e) { lines.push("  ❌ " + f[0] + " — tidak boleh diakses / belum disetup"); }
  });

  lines.push("");
  if (isPlaceholder_(CLIENT.SITE_URL)) {
    lines.push("LAMAN WEB (SITE_URL): belum diisi — suis tutup borang hanya berkuat kuasa di browser.");
  } else {
    var st = fetchSiteState_();
    lines.push("LAMAN WEB (SITE_URL): " + (st ? "✅ content/site.json boleh dibaca (maintenance=" + st.maintenance + ")" : "⚠️ content/site.json tidak boleh dibaca — semak SITE_URL / deploy Cloudflare Pages"));
  }
  return lines;
}
