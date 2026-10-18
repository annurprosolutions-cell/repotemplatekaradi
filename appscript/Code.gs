// =============================================================================
// Code.gs — BACKEND WEB APP  (template, berasaskan KARA-Di v5.2)
// -----------------------------------------------------------------------------
// Apa yang berbeza daripada KARA-Di v5.2 asal:
//   - Semua nilai khusus klien dipindah ke Setup.gs (blok CLIENT) dan Script
//     Properties yang dicipta oleh setupSystem(). Tiada ID Sheet/Folder hardcoded.
//   - Tab dicari ikut NAMA kategori (bukan GID), jadi salin Sheet tak pecahkan apa-apa.
//   - Konfigurasi laman (slides, memo, info, gov info, maintenance, suis kategori)
//     TIDAK lagi di Apps Script — ia diurus Sveltia CMS (content/site.json).
//     update_config & tab "Tetapan" dibuang. Server hanya BACA site.json untuk
//     menguatkuasakan suis tutup-borang (fail-open).
//   - check_status / get_history tidak lagi memulangkan data peribadi mentah
//     (No. KP, UID, alamat, emel; nama & telefon di-mask untuk carian awam).
//   - No. rujukan dijamin unik (dulu: IC 4 digit + tarikh → bertindih).
//   - Input pengguna ditulis sebagai TEKS (tiada formula injection) dan
//     di-escape dalam PDF. Jenis fail muat naik disekat.
//   - Kiraan cubaan log masuk hanya untuk percubaan GAGAL.
//   - Tiada kebergantungan Firebase di server.
// =============================================================================


// =============================================================================
// 1. PEMALAR
// =============================================================================

var SESSION_TTL_SECONDS = 21600;            // 6 jam
var RESET_CODE_TTL_MS   = 15 * 60 * 1000;   // 15 minit
var RESET_MAX_TRIES     = 5;

var ADMIN_ONLY_ACTIONS = ["get_admin_data", "update_status", "updateStatus", "complete_ticket"];
// Tindakan yang menulis data → diserialkan dengan LockService.
var LOCKED_ACTIONS = ["submit_form", "update_status", "updateStatus", "complete_ticket", "admin_login", "admin_logout", "reset_password"];

var ALLOWED_STATUS = ["DALAM SEMAKAN", "SEDANG DI PROSES", "TELAH SELESAI"];

var MAX_FILES = 5;
var MAX_FILE_B64 = 8 * 1024 * 1024 * 1.4;   // ~8MB fail asal
var ALLOWED_UPLOAD_MIME = {
  "image/jpeg": 1, "image/jpg": 1, "image/png": 1, "image/webp": 1, "image/gif": 1,
  "image/heic": 1, "image/heif": 1,
  "application/pdf": 1,
  "application/msword": 1,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 1,
  "application/vnd.ms-excel": 1,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 1,
  "text/plain": 1
};

// Lajur yang TIDAK PERNAH dipulangkan kepada orang awam / ahli.
var HIDE_ALWAYS = ["NO. KP", "IC", "NO. IC", "UID"];
// Lajur tambahan yang disorokkan untuk carian awam (check_status).
var HIDE_PUBLIC = ["LAMPIRAN", "ALAMAT", "EMEL"];


// =============================================================================
// 2. ENTRY POINTS
// =============================================================================

function doGet(e) {
  // Pemeriksaan kesihatan ringkas (boleh dibuka terus di browser).
  return jsonOut_({
    status: "success",
    app: appName_(),
    version: APP_VERSION,
    message: "Backend aktif. Kandungan laman diurus melalui Sveltia CMS (content/site.json)."
  });
}

function doPost(e) {
  var lock = null, gotLock = false;
  try {
    if (!e || !e.postData || !e.postData.contents) return responseError("Permintaan kosong / tidak sah.");

    var data;
    try { data = JSON.parse(e.postData.contents); }
    catch (pe) { return responseError("Format permintaan tidak sah (bukan JSON)."); }
    if (!data || typeof data !== "object") return responseError("Format permintaan tidak sah.");

    var action = String(data.action || "submit_form");

    if (LOCKED_ACTIONS.indexOf(action) !== -1) {
      lock = LockService.getScriptLock();
      gotLock = lock.tryLock(20000);
      if (!gotLock) return responseError("Pelayan sedang sibuk. Sila cuba lagi sebentar.");
    }

    // --- Tanpa auth ---
    if (action === "ping")            return handlePing();
    if (action === "admin_login")     return handleAdminLogin(data);
    if (action === "admin_logout")    return handleAdminLogout(data);
    if (action === "forgot_password") return handleForgotPassword(data);
    if (action === "reset_password")  return handleResetPassword(data);
    if (action === "check_status")    return handleCheckStatus(data);
    if (action === "get_history")     return handleGetHistory(data);
    if (action === "submit_form")     return handleSubmitForm(data);

    // --- Gate admin ---
    if (ADMIN_ONLY_ACTIONS.indexOf(action) !== -1) {
      var auth = checkAdminAuth_(data);
      if (!auth.ok) return responseError(auth.message);
      if (action === "get_admin_data")  return handleGetAdminData(data);
      if (action === "update_status" || action === "updateStatus") return handleUpdateStatus(data);
      if (action === "complete_ticket") return handleCompleteTicket(data);
    }

    return responseError("Tindakan tidak dikenali.");

  } catch (error) {
    var msg = String(error && error.message ? error.message : error);
    Logger.log("doPost ERROR: " + msg + (error && error.stack ? ("\n" + error.stack) : ""));
    if (msg.indexOf("belum disetup") !== -1) return responseError(msg);
    return responseError("Ralat pelayan. Sila cuba lagi atau hubungi pentadbir.");
  } finally {
    if (gotLock) { try { lock.releaseLock(); } catch (re) {} }
  }
}


// =============================================================================
// 3. HELPER AM
// =============================================================================

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function responseSuccess(msg) { return jsonOut_({ status: "success", message: msg }); }
function responseError(msg)   { return jsonOut_({ status: "error", message: msg }); }

function getSS_() {
  var id = props_().getProperty(P_SS_ID);
  if (!id) throw new Error("Sistem belum disetup. Jalankan setupSystem() dalam editor Apps Script.");
  return SpreadsheetApp.openById(id);
}

function getFolder_(propKey) {
  var id = props_().getProperty(propKey);
  if (!id) throw new Error("Folder Drive belum disetup. Jalankan setupSystem() dalam editor Apps Script.");
  return DriveApp.getFolderById(id);
}

function getSheetByGid(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === Number(gid)) return sheets[i];
  }
  return null;
}

// tabId = kunci kategori ("Aduan"). GID berangka masih diterima (keserasian).
function resolveSheet_(ss, tabId) {
  var t = String(tabId === null || tabId === undefined ? "" : tabId).trim();
  if (CATEGORY_LABELS.hasOwnProperty(t)) return ss.getSheetByName(t);
  if (/^\d+$/.test(t)) return getSheetByGid(ss, t);
  return null;
}

function categoryKey_(category) {
  return String(category || "").toLowerCase().replace(/\s+/g, "_");
}

function buildHeaderIndex_(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i]).trim().toUpperCase();
    if (key) map[key] = i;
  }
  return map;
}

function getColByName_(headerIndex, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var key = String(aliases[i]).toUpperCase();
    if (headerIndex.hasOwnProperty(key)) return headerIndex[key];
  }
  return -1;
}

function tz_() {
  return Session.getScriptTimeZone() || "Asia/Kuala_Lumpur";
}

function formatCellDate_(d) {
  if (Object.prototype.toString.call(d) === "[object Date]" && !isNaN(d)) {
    return Utilities.formatDate(d, tz_(), "dd/MM/yyyy HH:mm");
  }
  return d;
}

// Escape HTML untuk input pengguna sebelum masuk ke HTML PDF.
function esc_(v) {
  return String(v === null || v === undefined ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function clip_(v, max) {
  var s = String(v === null || v === undefined ? "" : v).trim();
  return s.length > max ? s.substring(0, max) : s;
}

function maskEmail_(email) {
  var parts = String(email).split("@");
  if (parts.length !== 2) return "***";
  var name = parts[0];
  var visible = name.length <= 2 ? name.charAt(0) : name.substring(0, 3);
  return visible + "***@" + parts[1];
}

function maskName_(name) {
  return String(name || "").split(/\s+/).map(function (w) {
    return w.length <= 2 ? w : w.substring(0, 2) + "***";
  }).join(" ");
}

function maskPhone_(phone) {
  return String(phone || "").replace(/^'/, "").replace(/\d(?=\d{4})/g, "*");
}

// ---- rate limit (CacheService) ----
function rateCount_(key) {
  try { return Number(CacheService.getScriptCache().get(key) || 0); } catch (e) { return 0; }
}
function rateHit_(key, windowSeconds) {
  try {
    var cache = CacheService.getScriptCache();
    cache.put(key, String(Number(cache.get(key) || 0) + 1), windowSeconds);
  } catch (e) {}
}
function rateClear_(key) {
  try { CacheService.getScriptCache().remove(key); } catch (e) {}
}
// Kira + semak serentak. true = dibenarkan.
function checkRateLimit_(key, maxCount, windowSeconds) {
  if (rateCount_(key) >= maxCount) return false;
  rateHit_(key, windowSeconds);
  return true;
}


// =============================================================================
// 4. STATUS LAMAN DARI SVELTIA (content/site.json)  — fail-open
// =============================================================================

function fetchSiteState_() {
  if (isPlaceholder_(CLIENT.SITE_URL)) return null;
  try {
    var base = String(CLIENT.SITE_URL).trim().replace(/\/?$/, "/");
    var resp = UrlFetchApp.fetch(base + "content/site.json?t=" + Date.now(), { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) return null;
    var j = JSON.parse(resp.getContentText());
    return { maintenance: j.maintenance === true, category_status: j.category_status || {} };
  } catch (e) {
    Logger.log("fetchSiteState_ gagal (dibenarkan terus): " + e);
    return null;
  }
}

function getSiteState_() {
  if (isPlaceholder_(CLIENT.SITE_URL)) return null;
  try {
    var hit = CacheService.getScriptCache().get("site_state");
    if (hit) return JSON.parse(hit);
  } catch (e) {}
  var st = fetchSiteState_();
  if (st) { try { CacheService.getScriptCache().put("site_state", JSON.stringify(st), 60); } catch (e) {} }
  return st;
}

// Pulangkan mesej kalau kategori ditutup / sistem maintenance; "" kalau boleh.
function categoryClosedReason_(category) {
  var st = getSiteState_();
  if (!st) return "";
  if (st.maintenance) return "Sistem sedang diselenggara. Sila cuba lagi kemudian.";
  if (st.category_status[categoryKey_(category)] === false) return "Perkhidmatan ini ditutup buat sementara waktu.";
  return "";
}


// =============================================================================
// 5. AUTH ADMIN (server-side, tanpa panggilan luar)
// =============================================================================

function hashPassword_(password, salt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + String(password), Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < raw.length; i++) {
    var b = raw[i]; if (b < 0) b += 256;
    var h = b.toString(16);
    hex += (h.length === 1 ? "0" : "") + h;
  }
  return hex;
}

function setAdminPassword_(password) {
  var salt = Utilities.getUuid().replace(/-/g, "");
  var p = props_();
  p.setProperty(PROP_PW_SALT, salt);
  p.setProperty(PROP_PW_HASH, hashPassword_(password, salt));
  p.deleteProperty(PROP_SESSIONS); // batalkan semua sesi lama
  p.deleteProperty(PROP_RESET);    // batalkan kod reset tertunggak
}

function readSessions_() {
  var raw = props_().getProperty(PROP_SESSIONS);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}
function writeSessions_(s) { props_().setProperty(PROP_SESSIONS, JSON.stringify(s)); }

function createSession_() {
  var sessions = readSessions_();
  var now = Date.now();
  for (var k in sessions) { if (!sessions[k] || sessions[k] < now) delete sessions[k]; }
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
  sessions[token] = now + (SESSION_TTL_SECONDS * 1000);
  writeSessions_(sessions);
  return { token: token, expiresAt: sessions[token] };
}

function validateSession_(token) {
  if (!token) return false;
  var sessions = readSessions_();
  var exp = sessions[token];
  if (!exp) return false;
  if (exp < Date.now()) { delete sessions[token]; writeSessions_(sessions); return false; }
  return true;
}

function destroySession_(token) {
  if (!token) return;
  var s = readSessions_();
  if (s[token]) { delete s[token]; writeSessions_(s); }
}

function revokeAllAdminSessions() {
  props_().deleteProperty(PROP_SESSIONS);
  return "Semua sesi admin dibatalkan.";
}

function checkAdminAuth_(data) {
  if (data.sessionToken && validateSession_(data.sessionToken)) return { ok: true };
  return { ok: false, message: "Sesi admin tamat atau tidak sah. Sila log masuk semula." };
}

function handleAdminLogin(data) {
  var email = String(data.email || "").trim().toLowerCase();
  var password = String(data.password || "");
  var bucket = "adminlogin_fail";

  if (rateCount_(bucket) >= 8) {
    return responseError("Terlalu banyak percubaan log masuk gagal. Sila cuba lagi dalam 15 minit, atau tetapkan semula kata laluan melalui menu dalam Google Sheet.");
  }

  var p = props_();
  var salt = p.getProperty(PROP_PW_SALT);
  var hash = p.getProperty(PROP_PW_HASH);
  if (!salt || !hash) {
    return responseError("Kata laluan admin belum ditetapkan. Buka Google Sheet > menu ⚙️ > Tetapkan / Tukar Kata Laluan Admin.");
  }
  if (email !== adminEmail_().toLowerCase() || hashPassword_(password, salt) !== hash) {
    rateHit_(bucket, 900);
    return responseError("Emel atau kata laluan tidak sah.");
  }

  rateClear_(bucket);
  var sess = createSession_();
  return jsonOut_({
    status: "success", message: "Log masuk berjaya.",
    sessionToken: sess.token, expiresAt: sess.expiresAt, adminEmail: adminEmail_()
  });
}

function handleAdminLogout(data) {
  destroySession_(data.sessionToken);
  return responseSuccess("Log keluar berjaya.");
}


// =============================================================================
// 6. LUPA KATA LALUAN — kod 6-digit ke emel admin
// =============================================================================

function randomCode6_() {
  // Terbitkan 6 digit dari UUID rawak (Apps Script tiada crypto.getRandomValues).
  var hex = Utilities.getUuid().replace(/-/g, "").substring(0, 12);
  return String(100000 + (parseInt(hex, 16) % 900000));
}

function issueResetCode_() {
  var code = randomCode6_();
  var salt = Utilities.getUuid().replace(/-/g, "");

  props_().setProperty(PROP_RESET, JSON.stringify({
    salt: salt,
    hash: hashPassword_(code, salt),
    exp: Date.now() + RESET_CODE_TTL_MS,
    tries: 0
  }));

  var color = brandColor_();
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">' +
      '<h2 style="color:' + color + ';margin:0 0 4px;">' + esc_(appName_()) + ' — Kod Reset Kata Laluan</h2>' +
      '<p style="color:#555;font-size:13px;margin:0 0 20px;">' + esc_(orgName_()) + '</p>' +
      '<p style="font-size:14px;color:#333;">Kod pengesahan untuk menetapkan semula kata laluan admin:</p>' +
      '<div style="background:#F1F5F9;border:2px dashed ' + color + ';border-radius:10px;padding:18px;text-align:center;margin:18px 0;">' +
        '<span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#12275B;font-family:monospace;">' + code + '</span>' +
      '</div>' +
      '<p style="font-size:13px;color:#555;">Kod ini sah selama <strong>15 minit</strong> dan hanya boleh digunakan sekali.</p>' +
      '<p style="font-size:12px;color:#B45309;background:#FEF3C7;padding:12px;border-radius:8px;">' +
        'Kalau bukan anda yang minta reset ini, abaikan emel ini — kata laluan sedia ada kekal tidak berubah.' +
      '</p>' +
      '<hr style="border:0;border-top:1px solid #E2E8F0;margin:22px 0;">' +
      '<p style="font-size:11px;color:#94A3B8;">Emel automatik dari sistem ' + esc_(appName_()) + '. Jangan balas emel ini.</p>' +
    '</div>';

  MailApp.sendEmail({
    to: adminEmail_(),
    subject: appName_() + " — Kod Reset Kata Laluan Admin",
    htmlBody: html,
    name: appName_()
  });
  return true;
}

function handleForgotPassword(data) {
  if (!checkRateLimit_("forgotpw_bucket", 3, 900)) {
    return responseError("Terlalu banyak permintaan kod. Sila cuba lagi dalam 15 minit.");
  }
  var email = String(data.email || "").trim().toLowerCase();

  // Mesej SAMA walaupun emel tak padan — elak dedahkan emel mana yang wujud.
  var generic = "Jika emel tersebut adalah emel admin berdaftar, kod 6-digit telah dihantar ke peti masuknya. Kod sah selama 15 minit.";
  if (email !== adminEmail_().toLowerCase()) return jsonOut_({ status: "success", message: generic });

  try {
    issueResetCode_();
  } catch (e) {
    Logger.log("handleForgotPassword gagal hantar emel: " + e);
    return responseError("Tidak dapat menghantar emel. Guna menu ⚙️ dalam Google Sheet untuk tukar kata laluan secara terus.");
  }
  return jsonOut_({ status: "success", message: generic, sentTo: maskEmail_(adminEmail_()) });
}

function handleResetPassword(data) {
  if (!checkRateLimit_("resetpw_bucket", 10, 900)) {
    return responseError("Terlalu banyak percubaan. Sila cuba lagi dalam 15 minit.");
  }
  var code = String(data.code || "").trim();
  var newPw = String(data.newPassword || "");
  if (!code) return responseError("Sila masukkan kod pengesahan.");
  if (newPw.length < 10) return responseError("Kata laluan baharu mesti sekurang-kurangnya 10 aksara.");

  var p = props_();
  var raw = p.getProperty(PROP_RESET);
  if (!raw) return responseError("Tiada permintaan reset aktif. Sila minta kod baharu.");

  var rec;
  try { rec = JSON.parse(raw); } catch (e) { return responseError("Rekod reset rosak. Sila minta kod baharu."); }

  if (Date.now() > rec.exp) { p.deleteProperty(PROP_RESET); return responseError("Kod telah luput. Sila minta kod baharu."); }
  if (rec.tries >= RESET_MAX_TRIES) { p.deleteProperty(PROP_RESET); return responseError("Terlalu banyak kod salah. Permintaan dibatalkan — sila minta kod baharu."); }
  if (hashPassword_(code, rec.salt) !== rec.hash) {
    rec.tries++;
    p.setProperty(PROP_RESET, JSON.stringify(rec));
    return responseError("Kod tidak sah. Baki percubaan: " + (RESET_MAX_TRIES - rec.tries) + ".");
  }

  setAdminPassword_(newPw); // ini juga padam PROP_RESET & semua sesi
  return responseSuccess("Kata laluan berjaya ditetapkan semula. Sila log masuk dengan kata laluan baharu.");
}

function handlePing() {
  return jsonOut_({
    status: "success",
    app: appName_(),
    version: APP_VERSION,
    setupDone: !!props_().getProperty(P_SETUP_DONE),
    adminPasswordSet: hasAdminPassword_(),
    adminEmailMasked: maskEmail_(adminEmail_()),
    categories: CATEGORY_LABELS
  });
}


// =============================================================================
// 7. USER — HANTAR BORANG
// =============================================================================

function generateRefNo_(ic, submissionDate) {
  var digits = String(ic || "").replace(/\D/g, "");
  var last4 = digits.length >= 4 ? digits.slice(-4) : digits;
  while (last4.length < 4) last4 = "0" + last4;
  return last4 + Utilities.formatDate(submissionDate || new Date(), tz_(), "ddMMyyyy");
}

// Pastikan no. rujukan tak bertindih merentas semua tab. Tambah "-2", "-3", dst.
function uniqueRefNo_(ss, base) {
  var used = {};
  CATEGORY_KEYS.forEach(function (key) {
    var sh = ss.getSheetByName(key);
    if (!sh || sh.getLastRow() < 2) return;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var col = getColByName_(buildHeaderIndex_(headers), ["No. Rujukan"]);
    if (col === -1) return;
    sh.getRange(2, col + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var v = String(r[0]).trim();
      if (v) used[v] = true;
    });
  });
  if (!used[base]) return base;
  var n = 2;
  while (used[base + "-" + n]) n++;
  return base + "-" + n;
}

function handleSubmitForm(data) {
  var category = String(data.category || "");
  if (!CATEGORY_LABELS.hasOwnProperty(category)) return responseError("Kategori tidak sah.");

  var closed = categoryClosedReason_(category);
  if (closed) return responseError(closed);

  var icDigits = String(data.ic || "").replace(/\D/g, "");
  var phoneDigits = String(data.phone || "").replace(/\D/g, "");
  if (!data.nama || icDigits.length < 12 || phoneDigits.length < 9) {
    return responseError("Maklumat asas tidak lengkap. Sila semak Nama, No. IC dan No. Telefon.");
  }
  if (!checkRateLimit_("submit_" + phoneDigits.substring(0, 15), 8, 3600)) {
    return responseError("Terlalu banyak penghantaran dari nombor ini. Sila cuba sebentar lagi.");
  }

  var files = (data.files && data.files.length) ? data.files : [];
  if (files.length > MAX_FILES) return responseError("Maksimum " + MAX_FILES + " fail setiap penghantaran.");
  for (var fi = 0; fi < files.length; fi++) {
    var f = files[fi];
    if (!f || !f.data || f.data.length > MAX_FILE_B64) return responseError("Saiz fail terlalu besar: " + ((f && f.name) || "?"));
    if (!ALLOWED_UPLOAD_MIME[String(f.mimeType || "").toLowerCase()]) {
      return responseError("Jenis fail tidak dibenarkan: " + clip_((f && f.name) || "?", 80) + ". Hanya gambar, PDF, Word, Excel atau teks.");
    }
  }

  var ss = getSS_();
  var sheet = ss.getSheetByName(category);
  if (!sheet) return responseError("Tab kategori tidak dijumpai: " + category + ". Jalankan setupSystem().");

  var submissionDate = new Date();
  var refNo = uniqueRefNo_(ss, generateRefNo_(icDigits, submissionDate));

  var f_ = {
    nama:          clip_(data.nama, 150),
    email:         clip_(data.email, 150),
    address:       clip_(data.address, 500),
    option_select: clip_(data.option_select, 200),
    detail_1:      clip_(data.detail_1, 3000),
    detail_2:      clip_(data.detail_2, 3000),
    location:      clip_(data.location, 500),
    date_time:     clip_(data.date_time, 50),
    date_pref:     clip_(data.date_pref, 50),
    time_slot:     clip_(data.time_slot, 50),
    uid:           clip_(data.uid, 128) || "Guest"
  };

  // Fail mentah — kekal disimpan di folder Muat Naik sebagai backup.
  var uploadedFiles = [];
  if (files.length) {
    var uploadFolder = getFolder_(P_FOLDER_UPLOAD);
    files.forEach(function (fd, index) {
      var ext = "";
      if (fd.name && String(fd.name).lastIndexOf(".") !== -1) ext = String(fd.name).substring(String(fd.name).lastIndexOf("."));
      if (!/^\.[A-Za-z0-9]{1,8}$/.test(ext)) ext = "";
      var newName = refNo + " (" + (index + 1) + ")" + ext;
      var blob = Utilities.newBlob(Utilities.base64Decode(fd.data), fd.mimeType, newName);
      var file = uploadFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      uploadedFiles.push({ name: newName, mimeType: fd.mimeType, url: file.getUrl() });
    });
  }

  // PDF serahan (gambar tertanam) — URL-nya disimpan dalam lajur Lampiran.
  var dataForPdf = {
    refNo: refNo, submittedAt: submissionDate, category: category, uid: f_.uid,
    nama: f_.nama, phone: String(data.phone || ""), email: f_.email, address: f_.address,
    option_select: f_.option_select, detail_1: f_.detail_1, detail_2: f_.detail_2,
    location: f_.location, date_time: f_.date_time, date_pref: f_.date_pref, time_slot: f_.time_slot
  };
  var pdfUrl = buildAndSaveReport_(refNo, dataForPdf, uploadedFiles, files);

  // Kalau PDF gagal langsung, jatuh balik ke pautan fail mentah (bukti tak hilang).
  var lampiran = pdfUrl || uploadedFiles.map(function (u) { return u.url; }).join(", ");

  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var hIndex = buildHeaderIndex_(headers);
  if (getColByName_(hIndex, ["UID"]) === -1) {
    sheet.getRange(1, headers.length + 1).setValue("UID").setFontWeight("bold").setBackground("#cfe2f3");
    headers.push("UID");
  }

  var valueMap = {
    "TIMESTAMP":        submissionDate,
    "NO. RUJUKAN":      refNo,
    "NAMA PENUH":       f_.nama,
    "NO. KP":           icDigits,
    "NO. TELEFON":      String(data.phone || "").replace(/^'/, "").trim(),
    "EMEL":             f_.email,
    "ALAMAT":           f_.address,
    "PILIHAN/KATEGORI": f_.option_select,
    "PERINCIAN 1":      f_.detail_1,
    "PERINCIAN 2":      f_.detail_2 || f_.location,
    "TARIKH/MASA":      [f_.date_time || f_.date_pref, f_.time_slot].filter(Boolean).join(" · "),
    "LAMPIRAN":         lampiran,
    "STATUS":           "DALAM SEMAKAN",
    "UID":              f_.uid
  };

  var rowData = [], formats = [];
  for (var c = 0; c < headers.length; c++) {
    var key = String(headers[c]).trim().toUpperCase();
    rowData.push(valueMap.hasOwnProperty(key) ? valueMap[key] : "");
    formats.push((key === "TIMESTAMP" || key === "TARIKH SELESAI") ? "dd/MM/yyyy HH:mm" : "@");
  }

  // Tulis sebagai TEKS (format "@") supaya input pengguna tak ditafsir sebagai
  // formula (=IMPORTXML(...)) dan "0123" kekal "0123". Lock sudah dipegang oleh doPost.
  var targetRow = sheet.getLastRow() + 1;
  var rng = sheet.getRange(targetRow, 1, 1, rowData.length);
  rng.setNumberFormats([formats]);
  rng.setValues([rowData]);

  return jsonOut_({ status: "success", message: "Data berjaya disimpan.", refNo: refNo });
}

// Jana PDF serahan + simpan ke Drive. Pulangkan URL, atau "" kalau semua gagal.
//   Cubaan 1: dengan gambar tertanam
//   Cubaan 2: tanpa gambar (senarai pautan sahaja)
function buildAndSaveReport_(refNo, dataForPdf, uploadedFiles, rawFiles) {
  var folder = getFolder_(P_FOLDER_REPORT);
  var attempts = [rawFiles || [], []];

  for (var i = 0; i < attempts.length; i++) {
    try {
      var blob = createPdfReport(dataForPdf, uploadedFiles, attempts[i]);
      blob.setName(refNo + ".pdf");
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return file.getUrl();
    } catch (err) {
      Logger.log("Jana PDF serahan cubaan " + (i + 1) + " gagal: " + err);
      if (!attempts[0].length) break; // tiada gambar pun, cubaan 2 sama sahaja
    }
  }
  return "";
}


// =============================================================================
// 8. USER — SEMAK STATUS & SEJARAH
// =============================================================================

function handleCheckStatus(data) {
  var query = String(data.query || "").trim();
  if (!query) return responseError("Sila masukkan nombor rujukan atau nombor telefon.");
  if (query.length > 40) return responseError("Input terlalu panjang.");
  if (!checkRateLimit_("checkstatus_bucket", 60, 60)) {
    return responseError("Terlalu ramai semakan buat masa ini. Sila cuba sebentar lagi.");
  }
  var clean = query.replace(/\D/g, "");
  return jsonOut_({
    status: "success",
    records: scanRecords_(function (row, cols) {
      var ref = String(row[cols.ref] || "").trim();
      var phone = cols.phone !== -1 ? String(row[cols.phone] || "").replace(/\D/g, "") : "";
      if (ref && ref === query) return true;
      if (clean.length >= 8 && phone && phone === clean) return true;
      return false;
    }, "public")
  });
}

function handleGetHistory(data) {
  var uid = String(data.uid || "").trim().substring(0, 128);
  if (!uid || uid === "Guest" || uid.length < 10) return responseError("Sesi tidak sah. Sila log masuk semula.");
  if (!checkRateLimit_("history_" + uid, 30, 300)) return responseError("Terlalu banyak permintaan. Sila cuba sebentar lagi.");
  return jsonOut_({
    status: "success",
    records: scanRecords_(function (row, cols) {
      return cols.uid !== -1 && String(row[cols.uid]).trim() === uid;
    }, "member")
  });
}

// level "public": carian awam (mask nama/telefon, sorok alamat/emel/lampiran)
// level "member": sejarah ahli berdaftar (sorok IC & UID sahaja)
function sanitizeRow_(headers, row, level) {
  var outH = [], outV = [];
  for (var i = 0; i < headers.length; i++) {
    var hu = String(headers[i]).trim().toUpperCase();
    if (HIDE_ALWAYS.indexOf(hu) !== -1) continue;
    if (level === "public" && HIDE_PUBLIC.indexOf(hu) !== -1) continue;
    var v = row[i] instanceof Date ? formatCellDate_(row[i]) : String(row[i]);
    if (level === "public") {
      if (hu === "NAMA PENUH")  v = maskName_(v);
      if (hu === "NO. TELEFON") v = maskPhone_(v);
    }
    outH.push(headers[i]);
    outV.push(v);
  }
  return { headers: outH, values: outV };
}

function scanRecords_(matchFn, level) {
  var ss = getSS_();
  var records = [];

  CATEGORY_KEYS.forEach(function (cat) {
    var sheet = ss.getSheetByName(cat);
    if (!sheet) return;

    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    var headers = values[0];
    var hIndex = buildHeaderIndex_(headers);
    var cols = {
      ref:    getColByName_(hIndex, ["No. Rujukan"]),
      phone:  getColByName_(hIndex, ["No. Telefon"]),
      uid:    getColByName_(hIndex, ["UID"]),
      status: getColByName_(hIndex, ["STATUS"]),
      ts:     getColByName_(hIndex, ["Timestamp"]),
      tarikh: getColByName_(hIndex, ["Tarikh/Masa"])
    };
    if (cols.ref === -1) return;

    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (!matchFn(row, cols)) continue;
      var dateVal = cols.ts !== -1 ? row[cols.ts] : (cols.tarikh !== -1 ? row[cols.tarikh] : "");
      var safe = sanitizeRow_(headers, row, level);
      records.push({
        category: CATEGORY_LABELS[cat] || cat,
        categoryKey: cat,
        date: formatCellDate_(dateVal),
        refNo: String(row[cols.ref] || "").trim(),
        status: cols.status !== -1 ? (row[cols.status] || "DALAM SEMAKAN") : "DALAM SEMAKAN",
        headers: safe.headers,
        fullData: safe.values
      });
    }
  });
  return records;
}


// =============================================================================
// 9. ADMIN — DATA DASHBOARD
// =============================================================================

function handleGetAdminData(data) {
  var ss = getSS_();
  var tabs = {}, errors = {};

  CATEGORY_KEYS.forEach(function (cat) {
    try {
      var sheet = ss.getSheetByName(cat);
      if (!sheet) { tabs[cat] = []; errors[cat] = "Tab '" + cat + "' tidak dijumpai. Jalankan setupSystem()."; return; }

      var values = sheet.getDataRange().getValues();
      if (values.length < 1) { tabs[cat] = []; return; }

      var headers = values[0], rows = [];
      for (var i = 1; i < values.length; i++) {
        var obj = {}, kosong = true;
        for (var h = 0; h < headers.length; h++) {
          var name = String(headers[h]).trim();
          if (!name) continue;
          var val = values[i][h];
          if (val !== "" && val !== null && val !== undefined) kosong = false;
          obj[name] = (val instanceof Date) ? formatCellDate_(val) : val;
        }
        if (!kosong) rows.push(obj);
      }
      tabs[cat] = rows;
    } catch (catErr) {
      Logger.log("get_admin_data '" + cat + "' ERROR: " + catErr);
      tabs[cat] = [];
      errors[cat] = String(catErr);
    }
  });

  return jsonOut_({ status: "success", tabs: tabs, errors: errors, categories: CATEGORY_LABELS });
}


// =============================================================================
// 10. ADMIN — KEMAS KINI STATUS & LAPORAN TINDAKAN
// =============================================================================

function findRowByRef_(sheet, refNo) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { error: "Tab kosong." };
  var headers = values[0];
  var hIndex = buildHeaderIndex_(headers);
  var refCol = getColByName_(hIndex, ["No. Rujukan"]);
  if (refCol === -1) return { error: "Lajur 'No. Rujukan' tidak dijumpai." };
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][refCol]).trim() === String(refNo).trim()) {
      return { rowIndex: i + 1, headers: headers, hIndex: hIndex, row: values[i] };
    }
  }
  return { error: "No. Rujukan " + refNo + " tidak dijumpai." };
}

function handleUpdateStatus(data) {
  var ss = getSS_();
  var sheet = resolveSheet_(ss, data.tabId);
  if (!sheet) return responseError("Tab tidak dijumpai: " + data.tabId);

  var newStatus = String(data.newStatus || "");
  if (ALLOWED_STATUS.indexOf(newStatus) === -1) return responseError("Status tidak sah.");

  var hit = findRowByRef_(sheet, data.refNo);
  if (hit.error) return responseError(hit.error);
  var statusIdx = getColByName_(hit.hIndex, ["STATUS"]);
  if (statusIdx === -1) return responseError("Lajur 'STATUS' tidak dijumpai.");

  sheet.getRange(hit.rowIndex, statusIdx + 1).setValue(newStatus);
  return jsonOut_({ status: "success", message: "Status dikemaskini kepada: " + newStatus });
}

function handleCompleteTicket(data) {
  var ss = getSS_();
  var sheet = resolveSheet_(ss, data.tabId);
  if (!sheet) return responseError("Tab tidak dijumpai: " + data.tabId);

  var hit = findRowByRef_(sheet, data.refNo);
  if (hit.error) return responseError(hit.error);

  var rowMap = {};
  for (var h = 0; h < hit.headers.length; h++) rowMap[String(hit.headers[h]).trim()] = hit.row[h];

  var newStatus = data.newStatus || "TELAH SELESAI";
  if (ALLOWED_STATUS.indexOf(newStatus) === -1) return responseError("Status tidak sah.");

  var reportLink = "";
  var closureFolder = getFolder_(P_FOLDER_CLOSURE);

  if (data.reportMethod === "upload" && data.fileData) {
    var f = data.fileData;
    if (!f.data || f.data.length > MAX_FILE_B64) return responseError("Saiz fail terlalu besar.");
    if (!ALLOWED_UPLOAD_MIME[String(f.mimeType || "").toLowerCase()]) return responseError("Jenis fail tidak dibenarkan.");
    var safeName = String(f.name || "laporan").replace(/[^\w.\- ]/g, "_");
    var blob = Utilities.newBlob(
      Utilities.base64Decode(f.data), f.mimeType,
      "Laporan_" + String(newStatus).replace(/\s+/g, "_") + "_" + data.refNo + "_" + safeName
    );
    var file = closureFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    reportLink = file.getUrl();

  } else if (data.reportMethod === "build") {
    var images = [];
    if (data.images && data.images.length) {
      data.images.forEach(function (img, idx) {
        if (img && img.data && /^image\//i.test(String(img.mimeType || "")) && /^[A-Za-z0-9+\/=]+$/.test(img.data)) {
          images.push({ mimeType: img.mimeType, data: img.data, name: "Bukti " + (idx + 1) });
        }
      });
    }
    try {
      var cBlob = createClosurePdf({
        refNo: data.refNo,
        summary: data.summary || "-",
        originalName: rowMap["Nama Penuh"] || "-",
        originalCat: rowMap["Pilihan/Kategori"] || "-",
        status: newStatus
      }, images);
      var cFile = closureFolder.createFile(cBlob);
      cFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      reportLink = cFile.getUrl();
    } catch (be) {
      Logger.log("Gagal bina PDF laporan: " + be);
      return responseError("Gagal bina PDF laporan. Cuba kurangkan bilangan/saiz gambar.");
    }
  }

  var statusCol = getColByName_(hit.hIndex, ["STATUS"]);
  var dateCol   = getColByName_(hit.hIndex, ["Tarikh Selesai", "Tarikh Tindakan/Selesai", "Tarikh Tindakan"]);
  var reportCol = getColByName_(hit.hIndex, ["Laporan Penyelesaian", "Laporan Tindakan/Selesai", "Laporan Tindakan"]);

  if (statusCol === -1) return responseError("Lajur 'STATUS' tidak dijumpai.");
  if (dateCol === -1) {
    dateCol = sheet.getLastColumn();
    sheet.getRange(1, dateCol + 1).setValue("Tarikh Selesai").setFontWeight("bold").setBackground("#d9ead3");
  }
  if (reportCol === -1) {
    reportCol = sheet.getLastColumn();
    sheet.getRange(1, reportCol + 1).setValue("Laporan Penyelesaian").setFontWeight("bold").setBackground("#d9ead3");
  }

  var completedDate = new Date();
  sheet.getRange(hit.rowIndex, statusCol + 1).setValue(newStatus);
  sheet.getRange(hit.rowIndex, dateCol + 1).setNumberFormat("dd/MM/yyyy HH:mm").setValue(completedDate);
  if (reportLink) sheet.getRange(hit.rowIndex, reportCol + 1).setValue(reportLink);

  return jsonOut_({
    status: "success", message: "Maklumat tindakan direkodkan.",
    reportLink: reportLink, completedDate: formatCellDate_(completedDate)
  });
}


// =============================================================================
// 11. PENJANAAN PDF
// =============================================================================

function createClosurePdf(data, images) {
  var statusColor = data.status === "SEDANG DI PROSES" ? "#f59e0b" : "#10b981";
  var statusText = data.status || "TELAH SELESAI";
  var color = brandColor_();

  var imgHtml = "";
  if (images && images.length) {
    imgHtml = '<div style="margin-top:20px;"><h3>Lampiran Bukti Bergambar</h3>';
    images.forEach(function (img) {
      imgHtml += '<div style="margin-bottom:15px;border:1px solid #ddd;padding:5px;display:inline-block;width:45%;margin-right:2%;vertical-align:top;">' +
        '<img src="data:' + esc_(img.mimeType) + ';base64,' + img.data + '" style="width:100%;height:auto;display:block;" />' +
        '<div style="font-size:10px;text-align:center;background:#eee;">' + esc_(img.name) + '</div></div>';
    });
    imgHtml += '</div>';
  }

  var html =
    '<html><body style="font-family:Arial,sans-serif;padding:40px;">' +
      '<div style="border-bottom:3px solid ' + color + ';padding-bottom:10px;margin-bottom:20px;">' +
        '<h1 style="color:' + color + ';margin:0;">LAPORAN TINDAKAN MAKLUM BALAS</h1>' +
        '<p style="margin:5px 0;color:#555;">' + esc_(orgName_()) + '</p></div>' +
      '<div style="background:#f9f9f9;padding:15px;border-radius:5px;border-left:5px solid ' + statusColor + ';margin-bottom:20px;">' +
        '<strong>Status:</strong> <span style="color:' + statusColor + ';font-weight:bold;">' + esc_(statusText) + '</span><br>' +
        '<strong>Tarikh Tindakan:</strong> ' + esc_(Utilities.formatDate(new Date(), tz_(), "dd/MM/yyyy")) + '<br>' +
        '<strong>No. Rujukan:</strong> ' + esc_(data.refNo) + '</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">' +
        '<tr><td style="padding:8px;border-bottom:1px solid #eee;width:150px;font-weight:bold;">Nama Pemohon</td><td style="padding:8px;border-bottom:1px solid #eee;">' + esc_(data.originalName) + '</td></tr>' +
        '<tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">Kategori</td><td style="padding:8px;border-bottom:1px solid #eee;">' + esc_(data.originalCat) + '</td></tr>' +
      '</table>' +
      '<div style="margin-top:20px;"><h3 style="border-bottom:1px solid #ccc;padding-bottom:5px;">Ringkasan Maklum Balas / Tindakan</h3>' +
        '<p style="white-space:pre-wrap;line-height:1.5;">' + esc_(data.summary) + '</p></div>' + imgHtml +
      '<div style="margin-top:50px;text-align:center;font-size:10px;color:#888;border-top:1px solid #ccc;padding-top:10px;">' +
        'Laporan ini dijana secara automatik oleh Sistem ' + esc_(appName_()) + '.</div>' +
    '</body></html>';

  var blob = Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF);
  blob.setName("Laporan_Tindakan_" + data.refNo + ".pdf");
  return blob;
}

// Laporan Serahan (dijana bila rakyat hantar borang).
//   rawFiles = data.files (name, mimeType, data base64), SELARI dengan uploadedFiles.
//   Hantar [] untuk versi tanpa gambar.
function createPdfReport(data, uploadedFiles, rawFiles) {
  var when = Utilities.formatDate(data.submittedAt || new Date(), tz_(), "dd/MM/yyyy, HH:mm:ss");
  var color = brandColor_();

  uploadedFiles = uploadedFiles || [];
  rawFiles = rawFiles || [];

  var footer = '<div class="footer">Dijana automatik oleh Sistem ' + esc_(appName_()) + ' &mdash; ' + esc_(orgName_()) + '.</div>';

  var attachHtml = "";
  if (uploadedFiles.length) {
    var items = "";
    uploadedFiles.forEach(function (uf, i) {
      var raw = rawFiles[i];
      var isImage = raw && raw.data && /^image\//i.test(String(raw.mimeType || "")) && /^[A-Za-z0-9+\/=\s]+$/.test(raw.data);
      if (isImage) {
        items +=
          '<div style="display:inline-block;width:46%;margin:0 2% 14px 0;vertical-align:top;border:1px solid #9CA3AF;background:#fff;page-break-inside:avoid;">' +
            '<img src="data:' + esc_(raw.mimeType) + ';base64,' + raw.data + '" style="width:100%;height:auto;display:block;" />' +
            '<div style="font-size:10px;font-weight:700;text-align:center;background:#E5E7EB;padding:5px;">' + esc_(uf.name) + '</div>' +
          '</div>';
      } else {
        items +=
          '<div style="margin-bottom:10px;padding:10px;border:1px solid #9CA3AF;background:#fff;font-size:11px;">' +
            '<strong>' + esc_(uf.name) + '</strong><br>' +
            '<span style="color:' + color + ';word-break:break-all;">' + esc_(uf.url) + '</span>' +
          '</div>';
      }
    });
    attachHtml =
      '<div style="page-break-before:always;"></div>' +
      '<div class="head"><div class="title">Lampiran &amp; Bukti</div>' +
        '<div class="sub">Dokumen Sokongan Rujukan: ' + esc_(data.refNo) + '</div></div>' +
      '<div class="box"><div class="boxtitle">C. Senarai Lampiran</div>' + items + '</div>' +
      footer;
  }

  var html =
    '<html><head><style>' +
      '@page { size: A4 portrait; margin: 0; }' +
      'body { font-family: Arial, sans-serif; background:#F0EAD6; margin:0; padding:0; }' +
      // min-height sengaja tiada — 290mm + padding 30mm > A4 = punca halaman kosong.
      '.a4-page { width:100%; max-width:210mm; padding:15mm; box-sizing:border-box; background:#F0EAD6; margin:0 auto; }' +
      '.box { background:#fff; border-radius:4px; padding:15px; border-left:6px solid ' + color + '; margin-bottom:20px; }' +
      '.label { font-size:10px; text-transform:uppercase; color:#4B5563; font-weight:700; margin-bottom:3px; }' +
      '.value { color:#111827; font-weight:600; font-size:13px; line-height:1.4; white-space:pre-wrap; }' +
      '.head { text-align:center; margin-bottom:30px; border-bottom:3px solid ' + color + '; padding-bottom:15px; }' +
      '.title { font-size:24px; font-weight:800; color:' + color + '; text-transform:uppercase; }' +
      '.sub { font-size:13px; color:#374151; font-weight:600; margin-top:5px; text-transform:uppercase; }' +
      '.boxtitle { font-size:13px; font-weight:700; color:' + color + '; text-transform:uppercase; border-bottom:1px solid #E5E7EB; padding-bottom:8px; margin-bottom:15px; }' +
      '.group { margin-bottom:12px; }' +
      '.footer { font-size:10px; text-align:center; color:#4B5563; margin-top:30px; padding-top:15px; border-top:1px solid #9CA3AF; }' +
    '</style></head><body><div class="a4-page">' +
      '<div class="head"><div class="title">Laporan Serahan ' + esc_(appName_()) + '</div><div class="sub">' + esc_(orgName_()) + '</div></div>' +
      '<div class="box"><div class="boxtitle">Maklumat Rujukan</div>' +
        '<div class="group"><div class="label">Nombor Rujukan</div><div class="value" style="font-size:18px;color:' + color + ';">' + esc_(data.refNo || '-') + '</div></div>' +
        '<div class="group"><div class="label">Tarikh Serahan</div><div class="value">' + esc_(when) + '</div></div>' +
        '<div class="group"><div class="label">Kategori</div><div class="value">' + esc_(CATEGORY_LABELS[data.category] || data.category || '-') + '</div></div>' +
        '<div class="group"><div class="label">User ID (Sistem)</div><div class="value">' + esc_(data.uid || 'Guest') + '</div></div></div>' +
      '<div class="box" style="border-left-color:#4B5563;"><div class="boxtitle">A. Butiran Pemohon</div>' +
        '<div class="group"><div class="label">Nama Penuh</div><div class="value">' + esc_(data.nama || '-') + '</div></div>' +
        '<div class="group"><div class="label">No. Telefon</div><div class="value">' + esc_(data.phone || '-') + '</div></div>' +
        '<div class="group"><div class="label">Emel</div><div class="value">' + esc_(data.email || '-') + '</div></div>' +
        '<div class="group"><div class="label">Alamat / Lokasi</div><div class="value">' + esc_(data.address || '-') + '</div></div></div>' +
      '<div class="box" style="border-left-color:#4B5563;"><div class="boxtitle">B. Butiran Borang</div>' +
        '<div class="group"><div class="label">Pilihan / Jenis</div><div class="value">' + esc_(data.option_select || '-') + '</div></div>' +
        '<div class="group"><div class="label">Perincian Utama</div><div class="value">' + esc_(data.detail_1 || '-') + '</div></div>' +
        ((data.detail_2 || data.location) ? '<div class="group"><div class="label">Perincian Tambahan / Lokasi</div><div class="value">' + esc_(data.detail_2 || data.location) + '</div></div>' : '') +
        ((data.date_time || data.date_pref) ? '<div class="group"><div class="label">Tarikh Berkaitan</div><div class="value">' + esc_(data.date_time || data.date_pref) + '</div></div>' : '') +
        ((data.time_slot) ? '<div class="group"><div class="label">Sesi Masa</div><div class="value">' + esc_(data.time_slot) + '</div></div>' : '') +
      '</div>' +
      (uploadedFiles.length ? '' : footer) +
      attachHtml +
    '</div></body></html>';

  return Utilities.newBlob(html, MimeType.HTML).getAs(MimeType.PDF);
}
