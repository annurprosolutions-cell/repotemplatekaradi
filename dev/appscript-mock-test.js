#!/usr/bin/env node
// =============================================================================
// appscript-mock-test.js — ujian logik Code.gs + Setup.gs di Node (TANPA Google)
// -----------------------------------------------------------------------------
// Guna: node dev/appscript-mock-test.js
//
// Ini mock dalam memori bagi SpreadsheetApp / DriveApp / PropertiesService dll.
// Ia menguji LOGIK kita (setup, submit, auth, sanitasi, rujukan unik, suis tutup
// borang). Ia BUKAN pengganti ujian sebenar dalam Apps Script: tingkah laku
// Google (PDF converter, kuota, format sel) hanya dimodelkan secara kasar.
// Jalankan semula selepas setiap perubahan pada appscript/*.gs.
// =============================================================================

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const assert = require("assert");

// ---------------------------------------------------------------- mock Google
function makeEnv() {
  const env = { mails: [], fetches: [], fetchImpl: null, ids: 0 };

  const store = {};
  const propsObj = {
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => {
      store[k] = String(v);
    },
    deleteProperty: (k) => {
      delete store[k];
    },
  };
  const cacheStore = {};
  const cacheObj = {
    get: (k) => (k in cacheStore ? cacheStore[k] : null),
    put: (k, v) => {
      cacheStore[k] = String(v);
    },
    remove: (k) => {
      delete cacheStore[k];
    },
  };
  env.store = store;
  env.cacheStore = cacheStore;

  // ---- Sheets mock (model kasar auto-parse: format bukan "@" → nombor/formula)
  class Range {
    constructor(sheet, r, c, nr, nc) {
      this.s = sheet;
      this.r = r;
      this.c = c;
      this.nr = nr;
      this.nc = nc;
    }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) row.push(this.s.cell(this.r + i, this.c + j).v);
        out.push(row);
      }
      return out;
    }
    getValue() {
      return this.s.cell(this.r, this.c).v;
    }
    setValues(vals) {
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.s.put(this.r + i, this.c + j, vals[i][j]);
      return this;
    }
    setValue(v) {
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.s.put(this.r + i, this.c + j, v);
      return this;
    }
    setNumberFormat(f) {
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.s.cell(this.r + i, this.c + j).f = f;
      return this;
    }
    setNumberFormats(fs_) {
      for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.s.cell(this.r + i, this.c + j).f = fs_[i][j];
      return this;
    }
    setFontWeight() {
      return this;
    }
    setBackground() {
      return this;
    }
  }
  class Sheet {
    constructor(name, id) {
      this.name = name;
      this.id = id;
      this.cells = {};
      this.frozen = 0;
    }
    key(r, c) {
      return r + ":" + c;
    }
    cell(r, c) {
      return this.cells[this.key(r, c)] || (this.cells[this.key(r, c)] = { v: "", f: "General" });
    }
    put(r, c, v) {
      const cell = this.cell(r, c);
      if (cell.f === "@") {
        cell.v = v === null || v === undefined ? "" : v instanceof Date ? String(v) : String(v);
        return;
      }
      if (typeof v === "string") {
        if (/^=/.test(v)) {
          cell.v = { formula: v };
          return;
        } // formula dinilai!
        if (/^\d+$/.test(v) && v.length < 16) {
          cell.v = Number(v);
          return;
        } // "0123" → 123
      }
      cell.v = v === undefined ? "" : v;
    }
    getName() {
      return this.name;
    }
    getSheetId() {
      return this.id;
    }
    getMaxRows() {
      return 1000;
    }
    getLastRow() {
      let m = 0;
      for (const k in this.cells) {
        const [r] = k.split(":").map(Number);
        const v = this.cells[k].v;
        if (v !== "" && v !== null) m = Math.max(m, r);
      }
      return m;
    }
    getLastColumn() {
      let m = 0;
      for (const k in this.cells) {
        const [, c] = k.split(":").map(Number);
        const v = this.cells[k].v;
        if (v !== "" && v !== null) m = Math.max(m, c);
      }
      return m;
    }
    getRange(r, c, nr, nc) {
      return new Range(this, r, c, nr || 1, nc || 1);
    }
    getDataRange() {
      return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
    }
    setFrozenRows(n) {
      this.frozen = n;
    }
  }
  class Spreadsheet {
    constructor(name) {
      this.name = name;
      this.id = "ss_" + ++env.ids;
      this.sheets = [new Sheet("Sheet1", 0)];
      this.n = 1;
    }
    getId() {
      return this.id;
    }
    getName() {
      return this.name;
    }
    getUrl() {
      return "https://docs.google.com/spreadsheets/d/" + this.id;
    }
    getSheets() {
      return this.sheets.slice();
    }
    getSheetByName(n) {
      return this.sheets.find((s) => s.name === n) || null;
    }
    insertSheet(n) {
      const s = new Sheet(n, ++this.n * 1000);
      this.sheets.push(s);
      return s;
    }
    deleteSheet(s) {
      this.sheets = this.sheets.filter((x) => x !== s);
    }
    setSpreadsheetTimeZone() {}
  }
  env.spreadsheets = {};
  env.boundSS = null;

  const SpreadsheetApp = {
    create: (name) => {
      const s = new Spreadsheet(name);
      env.spreadsheets[s.id] = s;
      return s;
    },
    openById: (id) => {
      if (!env.spreadsheets[id]) throw new Error("not found " + id);
      return env.spreadsheets[id];
    },
    getActiveSpreadsheet: () => env.boundSS,
    getUi: () => {
      throw new Error("no ui in tests");
    },
  };

  // ---- Drive mock
  class DFile {
    constructor(blob, parent) {
      this.blob = blob;
      this.id = "file_" + ++env.ids;
      this.parent = parent;
      this.shared = null;
    }
    setSharing(a, p) {
      this.shared = [a, p];
      return this;
    }
    getUrl() {
      return "https://drive.google.com/file/d/" + this.id + "/view";
    }
    getName() {
      return this.blob.name;
    }
  }
  class Folder {
    constructor(name, parent) {
      this.name = name;
      this.parent = parent;
      this.id = "fld_" + ++env.ids;
      this.folders = [];
      this.files = [];
      this.trashed = false;
      env.folders[this.id] = this;
    }
    getId() {
      return this.id;
    }
    getName() {
      return this.name;
    }
    isTrashed() {
      return this.trashed;
    }
    createFolder(n) {
      const f = new Folder(n, this);
      this.folders.push(f);
      return f;
    }
    getFoldersByName(n) {
      const m = this.folders.filter((f) => f.name === n && !f.trashed);
      let i = 0;
      return { hasNext: () => i < m.length, next: () => m[i++] };
    }
    createFile(blob) {
      const f = new DFile(blob, this);
      this.files.push(f);
      env.files.push(f);
      return f;
    }
  }
  env.folders = {};
  env.files = [];
  const rootFolder = new Folder("My Drive", null);
  const DriveApp = {
    getRootFolder: () => rootFolder,
    getFolderById: (id) => {
      if (!env.folders[id]) throw new Error("folder not found " + id);
      return env.folders[id];
    },
    Access: { ANYONE_WITH_LINK: "ANYONE_WITH_LINK" },
    Permission: { VIEW: "VIEW" },
  };

  // ---- Utilities
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const Utilities = {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    computeDigest: (alg, str) => Array.from(crypto.createHash("sha256").update(String(str), "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),
    getUuid: () => crypto.randomUUID(),
    base64Decode: (s) => Array.from(Buffer.from(String(s), "base64")),
    newBlob: (data, mime, name) => {
      const blob = {
        data,
        mime,
        name: name || "blob",
        setName(n) {
          this.name = n;
          return this;
        },
        getAs(m) {
          return {
            data: this.data,
            mime: m,
            name: this.name,
            setName(n) {
              this.name = n;
              return this;
            },
            getAs: this.getAs,
          };
        },
      };
      return blob;
    },
    formatDate: (d, tz, fmt) =>
      fmt
        .replace("dd", pad(d.getDate()))
        .replace("MM", pad(d.getMonth() + 1))
        .replace("yyyy", d.getFullYear())
        .replace("HH", pad(d.getHours()))
        .replace("mm", pad(d.getMinutes()))
        .replace("ss", pad(d.getSeconds())),
  };

  const ctx = {
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Object,
    Array,
    RegExp,
    Error,
    parseInt,
    isNaN,
    Buffer,
    Logger: {
      log: (...a) => {
        if (process.env.VERBOSE) console.log("[Logger]", ...a);
      },
    },
    PropertiesService: { getScriptProperties: () => propsObj },
    CacheService: { getScriptCache: () => cacheObj },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Session: { getScriptTimeZone: () => "Asia/Kuala_Lumpur" },
    ScriptApp: { getService: () => ({ getUrl: () => "https://script.google.com/macros/s/TEST/exec" }) },
    MimeType: { HTML: "text/html", PDF: "application/pdf" },
    ContentService: {
      MimeType: { JSON: "JSON" },
      createTextOutput: (s) => ({
        content: s,
        setMimeType() {
          return this;
        },
      }),
    },
    MailApp: { sendEmail: (m) => env.mails.push(m) },
    UrlFetchApp: {
      fetch: (url, opts) => {
        env.fetches.push(url);
        if (!env.fetchImpl) throw new Error("fetch disabled");
        return env.fetchImpl(url, opts);
      },
    },
    SpreadsheetApp,
    DriveApp,
    Utilities,
  };
  env.ctx = vm.createContext(ctx);
  return env;
}

function load(env) {
  const dir = path.join(__dirname, "..", "appscript");
  ["Setup.gs", "Code.gs"].forEach((f) => vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), env.ctx, { filename: f }));
}
const run = (env, code) => vm.runInContext(code, env.ctx);
function post(env, payload) {
  const out = run(env, "doPost").call(null, { postData: { contents: JSON.stringify(payload) } });
  return JSON.parse(out.content);
}
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==", "base64").toString(
  "base64",
);

// -------------------------------------------------------------------- ujian
function runTests() {
  let passed = 0,
    failed = 0;
  function t(name, fn) {
    try {
      fn();
      passed++;
      console.log("  ✓", name);
    } catch (e) {
      failed++;
      console.log("  ✗", name, "\n     ", e.message.split("\n")[0]);
    }
  }

  const env = makeEnv();
  load(env);

  console.log("\n[1] Setup");
  t("setup ditolak selagi placeholder belum diisi", () => {
    assert.throws(() => run(env, "runSetup_(null)"), /CLIENT\.APP_NAME/);
  });
  run(env, `CLIENT.APP_NAME="Test-Di"; CLIENT.ORG_NAME="Pusat Ujian"; CLIENT.ADMIN_EMAIL="admin@example.com"; CLIENT.PRIMARY_COLOR="#112233";`);
  env.boundSS = null; // standalone → mesti cipta spreadsheet sendiri
  let report;
  t("setup berjaya (standalone) + tetapkan kata laluan", () => {
    report = run(env, `runSetup_("KataLaluanKuat123")`);
    assert.match(report, /Kata laluan admin ditetapkan/);
  });
  const ssId = env.store["KARADI_SS_ID"];
  const ss = env.spreadsheets[ssId];
  t("6 tab kategori dicipta, tab Sheet1 lalai dibuang", () => {
    assert.deepStrictEqual(
      ss.getSheets().map((s) => s.name),
      ["Jemputan", "Permohonan", "Aduan", "Temujanji", "Maklum Balas", "Sukarelawan"],
    );
  });
  t("header betul & beku", () => {
    const sh = ss.getSheetByName("Aduan");
    assert.strictEqual(sh.getRange(1, 2).getValue(), "No. Rujukan");
    assert.strictEqual(sh.getRange(1, 4).getValue(), "No. KP");
    assert.strictEqual(sh.frozen, 1);
  });
  t("3 folder Drive dicipta di bawah folder akar", () => {
    ["KARADI_FOLDER_REPORT", "KARADI_FOLDER_UPLOAD", "KARADI_FOLDER_CLOSURE"].forEach((k) => assert.ok(env.folders[env.store[k]], k));
    assert.strictEqual(env.folders[env.store["KARADI_FOLDER_ROOT"]].name, "Test-Di — Data");
  });
  t("setup boleh dijalankan semula tanpa duplikasi", () => {
    const nFolders = Object.keys(env.folders).length,
      nSheets = ss.getSheets().length;
    run(env, "runSetup_(null)");
    assert.strictEqual(Object.keys(env.folders).length, nFolders);
    assert.strictEqual(ss.getSheets().length, nSheets);
  });

  console.log("\n[2] Ping & routing");
  t("ping", () => {
    const r = post(env, { action: "ping" });
    assert.strictEqual(r.status, "success");
    assert.strictEqual(r.setupDone, true);
    assert.strictEqual(r.adminPasswordSet, true);
    assert.match(r.adminEmailMasked, /^adm\*\*\*@example\.com$/);
  });
  t("tindakan tidak dikenali (termasuk update_config lama) ditolak", () => {
    assert.strictEqual(post(env, { action: "update_config", sessionToken: "x" }).message, "Tindakan tidak dikenali.");
    assert.strictEqual(post(env, { action: "xyz" }).status, "error");
  });

  console.log("\n[3] Auth admin");
  let token;
  t("log masuk salah ditolak, betul berjaya", () => {
    assert.strictEqual(post(env, { action: "admin_login", email: "admin@example.com", password: "salah" }).status, "error");
    const r = post(env, { action: "admin_login", email: "ADMIN@example.com", password: "KataLaluanKuat123" });
    assert.strictEqual(r.status, "success");
    token = r.sessionToken;
    assert.ok(token.length >= 60);
  });
  t("had percubaan GAGAL sahaja dikira (log masuk betul tak menghabiskan kuota)", () => {
    for (let i = 0; i < 20; i++)
      assert.strictEqual(post(env, { action: "admin_login", email: "admin@example.com", password: "KataLaluanKuat123" }).status, "success");
  });
  t("8 kegagalan → disekat, walaupun kata laluan betul", () => {
    for (let i = 0; i < 8; i++) post(env, { action: "admin_login", email: "admin@example.com", password: "salah" });
    const r = post(env, { action: "admin_login", email: "admin@example.com", password: "KataLaluanKuat123" });
    assert.match(r.message, /Terlalu banyak/);
    Object.keys(env.cacheStore).forEach((k) => delete env.cacheStore[k]);
  });
  t("tindakan admin tanpa sesi ditolak", () => {
    assert.match(post(env, { action: "get_admin_data" }).message, /Sesi admin/);
    assert.match(post(env, { action: "update_status", refNo: "x", tabId: "Aduan", newStatus: "TELAH SELESAI" }).message, /Sesi admin/);
  });

  console.log("\n[4] Hantar borang");
  const base = {
    category: "Aduan",
    nama: '=IMPORTXML("http://evil")',
    ic: "990101010123",
    phone: "0123456789",
    email: "a@b.com",
    address: "Kg. Contoh <b>1</b>",
    option_select: "Banjir / Parit",
    detail_1: "Parit tersumbat",
    location: "Jalan 1",
    uid: "Guest",
  };
  let ref1, ref2;
  t("hantar dengan gambar berjaya + rujukan bermula '0123' kekal teks", () => {
    const r = post(env, { ...base, files: [{ name: "bukti.png", mimeType: "image/png", data: png }] });
    assert.strictEqual(r.status, "success", r.message);
    ref1 = r.refNo;
    assert.match(ref1, /^0123\d{8}$/);
    const sh = ss.getSheetByName("Aduan");
    assert.strictEqual(sh.getRange(2, 2).getValue(), ref1); // masih string "0123..."
    assert.strictEqual(typeof sh.getRange(2, 2).getValue(), "string");
  });
  t("input bermula '=' disimpan sebagai TEKS, bukan formula", () => {
    const v = ss.getSheetByName("Aduan").getRange(2, 3).getValue();
    assert.strictEqual(typeof v, "string");
    assert.ok(v.startsWith("=IMPORTXML"));
  });
  t("No. telefon & No. KP disimpan sebagai teks (kekalkan sifar depan)", () => {
    const sh = ss.getSheetByName("Aduan");
    assert.strictEqual(sh.getRange(2, 5).getValue(), "0123456789");
    assert.strictEqual(sh.getRange(2, 4).getValue(), "990101010123");
  });
  t("lajur Lampiran = pautan PDF; fail mentah turut disimpan", () => {
    const lamp = ss.getSheetByName("Aduan").getRange(2, 12).getValue();
    assert.match(lamp, /^https:\/\/drive\.google\.com\/file\/d\/file_\d+\/view$/);
    const names = env.files.map((f) => f.blob.name);
    assert.ok(names.includes(ref1 + ".pdf"));
    assert.ok(names.includes(ref1 + " (1).png"));
    env.files.forEach((f) => assert.deepStrictEqual(f.shared, ["ANYONE_WITH_LINK", "VIEW"]));
  });
  t("HTML pengguna di-escape dalam PDF", () => {
    const pdf = env.files.find((f) => f.blob.name === ref1 + ".pdf").blob.data;
    assert.ok(pdf.includes("Kg. Contoh &lt;b&gt;1&lt;/b&gt;"));
    assert.ok(!pdf.includes("<b>1</b>"));
  });
  t("penghantaran kedua (IC + hari sama) dapat rujukan UNIK", () => {
    const r = post(env, { ...base, nama: "Siti Aminah Binti Ali", files: [] });
    assert.strictEqual(r.status, "success", r.message);
    ref2 = r.refNo;
    assert.strictEqual(ref2, ref1 + "-2");
  });
  t("jenis fail berbahaya ditolak", () => {
    const r = post(env, { ...base, files: [{ name: "a.exe", mimeType: "application/x-msdownload", data: png }] });
    assert.match(r.message, /tidak dibenarkan/);
  });
  t("fail terlalu banyak / terlalu besar ditolak", () => {
    assert.match(post(env, { ...base, files: Array(6).fill({ name: "a.png", mimeType: "image/png", data: png }) }).message, /Maksimum 5/);
    assert.match(
      post(env, { ...base, files: [{ name: "a.png", mimeType: "image/png", data: "A".repeat(12 * 1024 * 1024) }] }).message,
      /terlalu besar/,
    );
  });
  t("maklumat asas tak lengkap / kategori palsu ditolak", () => {
    assert.match(post(env, { ...base, ic: "123" }).message, /tidak lengkap/);
    assert.match(post(env, { ...base, category: "Palsu" }).message, /Kategori tidak sah/);
  });
  t("Temujanji: sesi masa digabung ke Tarikh/Masa", () => {
    const r = post(env, {
      category: "Temujanji",
      nama: "Ali",
      ic: "880808080808",
      phone: "0198887777",
      detail_1: "Jumpa YB",
      date_pref: "2026-11-02",
      time_slot: "Pagi (9:00 - 12:00)",
      uid: "Guest",
    });
    assert.strictEqual(r.status, "success", r.message);
    assert.strictEqual(ss.getSheetByName("Temujanji").getRange(2, 11).getValue(), "2026-11-02 · Pagi (9:00 - 12:00)");
  });

  console.log("\n[5] Semak status & sejarah (privasi)");
  const FORBIDDEN_PUBLIC = ["NO. KP", "UID", "LAMPIRAN", "ALAMAT", "EMEL"];
  t("check_status ikut rujukan: tiada IC/UID/alamat/emel/lampiran; nama & telefon di-mask", () => {
    const r = post(env, { action: "check_status", query: ref2 });
    assert.strictEqual(r.records.length, 1);
    const rec = r.records[0];
    const up = rec.headers.map((h) => h.toUpperCase());
    FORBIDDEN_PUBLIC.forEach((h) => assert.ok(!up.includes(h), "bocor: " + h));
    const val = (h) => rec.fullData[up.indexOf(h)];
    assert.strictEqual(val("NAMA PENUH"), "Si*** Am*** Bi*** Al***");
    assert.strictEqual(val("NO. TELEFON"), "******6789");
    assert.ok(!JSON.stringify(r).includes("990101010123"));
    assert.ok(!JSON.stringify(r).includes("a@b.com"));
  });
  t("check_status ikut telefon berfungsi", () => {
    assert.strictEqual(post(env, { action: "check_status", query: "012-3456789" }).records.length, 2);
  });
  t("check_status: hasil kosong & input kosong", () => {
    assert.strictEqual(post(env, { action: "check_status", query: "99999999999" }).records.length, 0);
    assert.strictEqual(post(env, { action: "check_status", query: "" }).status, "error");
  });
  t("get_history: sorok IC & UID tetapi benarkan lampiran/alamat milik sendiri", () => {
    const uid = "uid_ahli_berdaftar_123456";
    const r0 = post(env, { ...base, uid, nama: "Ahli Biasa", files: [] });
    assert.strictEqual(r0.status, "success", r0.message);
    const r = post(env, { action: "get_history", uid });
    assert.strictEqual(r.records.length, 1);
    const up = r.records[0].headers.map((h) => h.toUpperCase());
    assert.ok(!up.includes("NO. KP"));
    assert.ok(!up.includes("UID"));
    assert.ok(up.includes("ALAMAT"));
    assert.ok(up.includes("LAMPIRAN"));
    assert.strictEqual(post(env, { action: "get_history", uid: "Guest" }).status, "error");
  });

  console.log("\n[6] Dashboard admin");
  t("get_admin_data ikut kunci kategori, ada No. KP untuk admin", () => {
    const r = post(env, { action: "get_admin_data", sessionToken: token });
    assert.strictEqual(r.status, "success");
    assert.deepStrictEqual(Object.keys(r.tabs), ["Jemputan", "Permohonan", "Aduan", "Temujanji", "Maklum Balas", "Sukarelawan"]);
    assert.strictEqual(r.tabs["Aduan"].length, 3);
    assert.strictEqual(r.tabs["Aduan"][0]["No. KP"], "990101010123");
    assert.strictEqual(r.tabs["Aduan"][0]["No. Rujukan"], ref1);
  });
  t("update_status sah; status/tab/rujukan palsu ditolak", () => {
    assert.strictEqual(
      post(env, { action: "update_status", sessionToken: token, tabId: "Aduan", refNo: ref2, newStatus: "SEDANG DI PROSES" }).status,
      "success",
    );
    const sh = ss.getSheetByName("Aduan");
    assert.strictEqual(sh.getRange(3, 13).getValue(), "SEDANG DI PROSES"); // baris ref2 — bukan ref1
    assert.strictEqual(sh.getRange(2, 13).getValue(), "DALAM SEMAKAN");
    assert.match(
      post(env, { action: "update_status", sessionToken: token, tabId: "Aduan", refNo: ref2, newStatus: "HACKED" }).message,
      /Status tidak sah/,
    );
    assert.match(
      post(env, { action: "update_status", sessionToken: token, tabId: "Palsu", refNo: ref2, newStatus: "TELAH SELESAI" }).message,
      /Tab tidak dijumpai/,
    );
    assert.match(
      post(env, { action: "update_status", sessionToken: token, tabId: "Aduan", refNo: "tiada", newStatus: "TELAH SELESAI" }).message,
      /tidak dijumpai/,
    );
  });
  t("complete_ticket (bina PDF) rekod tarikh & pautan laporan", () => {
    const r = post(env, {
      action: "complete_ticket",
      sessionToken: token,
      tabId: "Aduan",
      refNo: ref1,
      newStatus: "TELAH SELESAI",
      reportMethod: "build",
      summary: "Parit <script>x</script> dibersihkan",
      images: [{ mimeType: "image/png", data: png }],
    });
    assert.strictEqual(r.status, "success", r.message);
    assert.match(r.reportLink, /drive\.google\.com/);
    const sh = ss.getSheetByName("Aduan");
    assert.strictEqual(sh.getRange(2, 13).getValue(), "TELAH SELESAI");
    assert.ok(sh.getRange(2, 15).getValue() instanceof Date);
    assert.strictEqual(sh.getRange(2, 16).getValue(), r.reportLink);
    const pdf = env.files.find((f) => f.blob.name === "Laporan_Tindakan_" + ref1 + ".pdf").blob.data;
    assert.ok(!pdf.includes("<script>"));
    assert.ok(pdf.includes("&lt;script&gt;"));
  });
  t("complete_ticket: muat naik fail jenis salah ditolak", () => {
    const r = post(env, {
      action: "complete_ticket",
      sessionToken: token,
      tabId: "Aduan",
      refNo: ref2,
      newStatus: "TELAH SELESAI",
      reportMethod: "upload",
      fileData: { name: "x.exe", mimeType: "application/x-msdownload", data: png },
    });
    assert.match(r.message, /tidak dibenarkan/);
  });
  t("GID berangka lama masih diterima (keserasian)", () => {
    const gid = ss.getSheetByName("Aduan").getSheetId();
    assert.strictEqual(
      post(env, { action: "update_status", sessionToken: token, tabId: String(gid), refNo: ref2, newStatus: "DALAM SEMAKAN" }).status,
      "success",
    );
  });

  console.log("\n[7] Lupa kata laluan");
  t("kod reset dihantar (bukan dalam subjek) & boleh set semula", () => {
    const g = post(env, { action: "forgot_password", email: "admin@example.com" });
    assert.strictEqual(g.status, "success");
    const mail = env.mails[env.mails.length - 1];
    assert.strictEqual(mail.to, "admin@example.com");
    assert.ok(!/\d{6}/.test(mail.subject), "kod bocor dalam subjek");
    const code = mail.htmlBody.match(/letter-spacing:8px[^>]*>(\d{6})</)[1];
    assert.strictEqual(post(env, { action: "reset_password", code: "000000", newPassword: "BaharuKuat12345" }).status, "error");
    assert.strictEqual(post(env, { action: "reset_password", code, newPassword: "pendek" }).status, "error");
    assert.strictEqual(post(env, { action: "reset_password", code, newPassword: "BaharuKuat12345" }).status, "success");
    assert.strictEqual(post(env, { action: "admin_login", email: "admin@example.com", password: "KataLaluanKuat123" }).status, "error");
    assert.strictEqual(post(env, { action: "admin_login", email: "admin@example.com", password: "BaharuKuat12345" }).status, "success");
    assert.match(post(env, { action: "get_admin_data", sessionToken: token }).message, /Sesi admin/); // sesi lama dibatalkan
  });
  t("emel bukan admin dapat mesej sama & tiada emel dihantar", () => {
    const n = env.mails.length;
    const r = post(env, { action: "forgot_password", email: "lain@example.com" });
    assert.strictEqual(r.status, "success");
    assert.strictEqual(env.mails.length, n);
  });

  console.log("\n[8] Suis tutup borang dari Sveltia (content/site.json)");
  run(env, `CLIENT.SITE_URL="https://klien.github.io/portal/"`);
  const flushCache = () => Object.keys(env.cacheStore).forEach((k) => delete env.cacheStore[k]);
  const site = (o) => {
    env.fetchImpl = () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(o) });
    flushCache();
  };
  t("kategori ditutup (category_status.aduan=false) → ditolak; kategori lain dibenarkan", () => {
    site({ maintenance: false, category_status: { aduan: false, maklum_balas: false } });
    assert.match(post(env, base).message, /ditutup/);
    assert.match(post(env, { ...base, category: "Maklum Balas" }).message, /ditutup/);
    assert.strictEqual(post(env, { ...base, category: "Sukarelawan", nama: "Ali" }).status, "success");
    assert.ok(env.fetches[env.fetches.length - 1].startsWith("https://klien.github.io/portal/content/site.json?t="));
  });
  t("maintenance=true → semua ditolak", () => {
    site({ maintenance: true, category_status: {} });
    assert.match(post(env, base).message, /diselenggara/);
  });
  t("fail-open: 404 / ralat rangkaian / JSON rosak → borang tetap diterima", () => {
    env.fetchImpl = () => ({ getResponseCode: () => 404, getContentText: () => "" });
    flushCache();
    assert.strictEqual(post(env, { ...base, nama: "Ali" }).status, "success");
    env.fetchImpl = () => {
      throw new Error("DNS");
    };
    flushCache();
    assert.strictEqual(post(env, { ...base, nama: "Ali" }).status, "success");
    env.fetchImpl = () => ({ getResponseCode: () => 200, getContentText: () => "<html>" });
    flushCache();
    assert.strictEqual(post(env, { ...base, nama: "Ali" }).status, "success");
  });

  console.log("\n[9] Belum disetup");
  t("sistem baharu tanpa setup → mesej jelas, bukan crash", () => {
    const e2 = makeEnv();
    load(e2);
    run(e2, `CLIENT.APP_NAME="X"; CLIENT.ORG_NAME="Y"; CLIENT.ADMIN_EMAIL="a@b.com"`);
    assert.match(post(e2, { ...base }).message, /belum disetup/);
    assert.strictEqual(post(e2, { action: "ping" }).setupDone, false);
  });
  t("setup (bound) guna spreadsheet sedia ada & kekalkan tab lain", () => {
    const e3 = makeEnv();
    load(e3);
    run(e3, `CLIENT.APP_NAME="X"; CLIENT.ORG_NAME="Y"; CLIENT.ADMIN_EMAIL="a@b.com"`);
    const bound = vm.runInContext("SpreadsheetApp", e3.ctx).create("Sheet Klien");
    bound.insertSheet("Nota Saya");
    e3.boundSS = bound;
    run(e3, "runSetup_(null)");
    assert.strictEqual(e3.store["KARADI_SS_ID"], bound.getId());
    assert.ok(bound.getSheetByName("Nota Saya"));
    assert.ok(bound.getSheetByName("Aduan"));
  });

  console.log(`\nKeputusan: ${passed} lulus, ${failed} gagal\n`);
  process.exit(failed ? 1 : 0);
}

module.exports = { makeEnv, load, run, post, png };
if (require.main === module) runTests();
