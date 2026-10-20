// =============================================================================
// e2e-browser-test.js — ujian hujung-ke-hujung: laman template (portal + admin)
// berbual dengan mock backend Apps Script (dev/appscript-mock-test.js) dalam
// Chromium sebenar. Menguji kontrak frontend↔backend, jenama dari config.js,
// kandungan Sveltia (content/site.json), suis tutup borang, privasi semak status,
// dan aliran admin.
//
// Guna (sekali sahaja):  npm i playwright && npx playwright install chromium
// Jalankan:              node dev/e2e-browser-test.js
// Uji folder klien yang dijana:  SITE_SRC=clients/abc/site node dev/e2e-browser-test.js
// Pilihan: CHROMIUM_PATH=/laluan/ke/chrome   PORT=8765
//
// TIDAK diuji di sini: Firebase sebenar (daftar/log masuk rakyat), Tailwind/CSS
// dari CDN, Google Apps Script sebenar, Cloudflare Pages, log masuk Sveltia CMS. Lihat README.
// =============================================================================
const fs = require("fs"),
  os = require("os"),
  path = require("path"),
  http = require("http"),
  assert = require("assert");
const { chromium } = require("playwright");
const T = path.resolve(__dirname, "..");
const { makeEnv, load, run, post, png } = require("./appscript-mock-test.js");

const SITE = path.join(os.tmpdir(), "karadi-e2e-site");
const PORT = Number(process.env.PORT || 8765);
const EXEC = "https://script.google.com/macros/s/TEST/exec";

// ---------- sediakan laman ujian (token diisi seperti new-client.sh)
fs.rmSync(SITE, { recursive: true, force: true });
fs.cpSync(path.resolve(process.env.SITE_SRC || path.join(T, "site")), SITE, { recursive: true });
const TOK = {
  __APP_NAME__: "Test-Di",
  __TAGLINE__: "Digital Uji",
  __ORG_NAME__: "Pusat Ujian Rakyat",
  __ORG_SHORT__: "Ujian",
  __OFFICE_LABEL__: "Pejabat Ujian",
  __CONTACT_EMAIL__: "hubungi@ujian.my",
  __WHATSAPP__: "60123456789",
  __PHONE_DISPLAY__: "012-345 6789",
  __GITHUB_REPO__: "x/y",
};
for (const f of ["config.js", "content/site.json"]) {
  let s = fs.readFileSync(`${SITE}/${f}`, "utf8");
  for (const [k, v] of Object.entries(TOK)) s = s.split(k).join(v);
  s = s.split('APPS_SCRIPT_URL: "URL_APPSCRIPT_ANDA_DI_SINI"').join('APPS_SCRIPT_URL: "' + EXEC + '"');
  fs.writeFileSync(`${SITE}/${f}`, s);
}
const siteJson = {
  maintenance: false,
  category_status: { jemputan: true, permohonan: true, aduan: false, temujanji: true, maklum_balas: true, sukarelawan: true },
  info: { hours: "Sabtu 9-12", location: "Dewan Ujian", map_link: "https://maps.example/x" },
  slides: ["assets/placeholder-slide.svg", { image: "assets/logo.svg" }],
  memos: ["Pengumuman Satu", "Pengumuman Dua"],
  gov_info: [{ title: "Bantuan Ujian", image: "assets/logo.svg", desc: "Mohon di https://contoh.my/mohon" }],
};
fs.writeFileSync(`${SITE}/content/site.json`, JSON.stringify(siteJson));

// ---------- backend mock
const env = makeEnv();
load(env);
run(env, `CLIENT.APP_NAME="Test-Di"; CLIENT.ORG_NAME="Pusat Ujian Rakyat"; CLIENT.ADMIN_EMAIL="admin@ujian.my"; CLIENT.PRIMARY_COLOR="#1A4A9A"`);
run(env, `runSetup_("KataLaluanKuat123")`);
const ss = env.spreadsheets[env.store.KARADI_SS_ID];

// ---------- server statik
const mime = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".yml": "text/yaml" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const fp = path.join(SITE, p);
  if (!fp.startsWith(SITE) || !fs.existsSync(fp)) {
    res.writeHead(404);
    return res.end("nf");
  }
  res.writeHead(200, { "content-type": mime[path.extname(fp)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(fp).pipe(res);
});

let passed = 0,
  failed = 0;
const ok = (n) => {
  passed++;
  console.log("  ✓", n);
};
const bad = (n, e) => {
  failed++;
  console.log("  ✗", n, "\n     ", String(e.message || e).split("\n")[0]);
};
async function step(n, fn) {
  try {
    await fn();
    ok(n);
  } catch (e) {
    bad(n, e);
  }
}

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const BASE = `http://localhost:${PORT}`;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: process.env.CI || process.getuid?.() === 0 ? ["--no-sandbox"] : [],
  });
  const context = await browser.newContext();
  const external = new Set();
  await context.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "localhost") return route.continue();
    if (u.hostname === "script.google.com") {
      const body = route.request().postData();
      let out;
      try {
        out = route.request().method() === "POST" ? post(env, JSON.parse(body)) : { status: "success" };
      } catch (e) {
        console.log("BACKEND THROW:", e.stack.split("\n").slice(0, 4).join(" | "));
        out = { status: "error", message: "throw" };
      }
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(out) });
    }
    external.add(u.hostname);
    return route.abort();
  });
  await context.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = ".hidden{display:none!important}";
      document.head.appendChild(st);
    });
  });

  const errors = [];
  const watch = (page, tag) => {
    page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push(`[${tag}] ${m.text()}`);
    });
  };

  // ================= PORTAL
  console.log("\n[Portal rakyat]");
  const page = await context.newPage();
  watch(page, "portal");
  await page.goto(BASE + "/");
  await page.waitForFunction(() => {
    try {
      return JSON.parse(localStorage.getItem("app_memos") || "[]").length > 0;
    } catch (e) {
      return false;
    }
  });
  await page.waitForTimeout(900);

  await step("jenama dari config.js: header, loader, tajuk, footer, tiada sisa klien lama", async () => {
    assert.strictEqual(await page.title(), "Test-Di — Digital Uji");
    const names = await page.$$eval('[data-brand="name"]', (e) => e.map((x) => x.textContent));
    assert.ok(names.length >= 3 && names.every((n) => n === "Test-Di"), JSON.stringify(names));
    const body = await page.evaluate(() => document.body.innerText + document.documentElement.innerHTML.replace(/<script[\s\S]*?<\/script>/g, ""));
    assert.ok(!/karambunai|kara-di|n16/i.test(body.replace(/KARADI_/g, "")), "sisa jenama lama");
    assert.ok(body.includes("Pusat Ujian Rakyat"));
    assert.ok(body.includes("012-345 6789"));
  });
  await step("hero & kad lokasi guna terjemahan berjenama", async () => {
    assert.strictEqual(await page.textContent('[data-i18n="hero_title"]'), "Selamat Datang ke Test-Di");
  });
  await step("pautan hubungan dibina dari config (mailto / wa / tel)", async () => {
    const h = await page.$$eval("[data-brand-href]", (e) => e.map((x) => x.getAttribute("href")));
    assert.ok(h.includes("mailto:hubungi@ujian.my"));
    assert.ok(h.includes("https://wa.me/60123456789"));
    assert.ok(h.includes("tel:+60123456789"));
  });
  await step("kandungan site.json (Sveltia) dipaparkan: slide(2, termasuk format objek), ticker, waktu operasi", async () => {
    assert.strictEqual(await page.$$eval(".slide", (e) => e.length), 2);
    assert.match(await page.textContent("#news-ticker-content"), /Pengumuman Satu[\s\S]*Pengumuman Dua/);
    await page.evaluate(() => showView("view-home"));
    assert.strictEqual(await page.textContent("#display-op-hours"), "Sabtu 9-12");
    assert.strictEqual(await page.textContent("#display-location"), "Dewan Ujian");
  });
  await step("info kerajaan dipaparkan & pautan di-linkify", async () => {
    await page.evaluate(() => showView("view-gov-info"));
    assert.match(await page.textContent("#gov-info-list"), /Bantuan Ujian/);
    await page.evaluate(() => openGovInfoModal(0));
    assert.ok(await page.$('#modal-gov-desc a[href="https://contoh.my/mohon"]'));
  });
  await step("tiada panel/log masuk admin dalam portal awam", async () => {
    assert.strictEqual(await page.$("#view-admin-login"), null);
    assert.strictEqual(await page.$("#view-admin-panel"), null);
    assert.strictEqual(
      await page.evaluate(() => typeof window.adminLogin + typeof window.syncConfigToCloud + typeof window.toggleMaintenance),
      "undefinedundefinedundefined",
    );
  });
  await step("Firebase belum dikonfigurasi → portal tetap jalan sebagai tetamu (tiada crash)", async () => {
    assert.strictEqual(await page.evaluate(() => !!window.firebaseLoaded), false);
    await page.evaluate(() => handleGuestAccess());
    assert.ok(await page.evaluate(() => !document.getElementById("view-dashboard").classList.contains("hidden")));
  });
  await step("kategori ditutup dari CMS (aduan=false): kad DITUTUP & borang disekat", async () => {
    assert.match(await page.textContent("#cat-Aduan"), /DITUTUP/);
    await page.evaluate(() => startForm("Aduan"));
    assert.match(await page.textContent("#toast-container"), /ditutup sementara/);
    assert.ok(await page.evaluate(() => document.getElementById("view-form").classList.contains("hidden")));
    assert.doesNotMatch(await page.textContent("#cat-Permohonan"), /DITUTUP/);
  });
  await step("kemas kini CMS dikesan tanpa reload: buka Aduan, tutup Permohonan", async () => {
    const j = { ...siteJson, category_status: { ...siteJson.category_status, aduan: true, permohonan: false }, memos: ["Baharu!"] };
    fs.writeFileSync(`${SITE}/content/site.json`, JSON.stringify(j));
    await page.evaluate(() => fetchGlobalConfig());
    await page.waitForFunction(
      () => /Baharu!/.test(document.getElementById("news-ticker-content").textContent) || JSON.parse(localStorage.getItem("app_memos"))[0] === "Baharu!",
    );
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem("app_category_status")));
    assert.strictEqual(st.Aduan, true);
    assert.strictEqual(st.Permohonan, false);
    fs.writeFileSync(`${SITE}/content/site.json`, JSON.stringify(siteJson)); // pulihkan keadaan asal
    await page.evaluate(() => fetchGlobalConfig());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("app_category_status")).Permohonan === true);
  });

  let ref;
  await step("hantar borang Permohonan sebagai tetamu dengan lampiran → rujukan diterima", async () => {
    await page.evaluate(() => startForm("Permohonan"));
    await page.fill('input[name="nama"]', "Ahmad Bin Ali");
    await page.fill('input[name="ic"]', "990101015555");
    await page.fill('input[name="phone"]', "0123456789");
    await page.fill('input[name="email"]', "ahmad@contoh.my");
    await page.fill('textarea[name="address"]', "No 1, Jalan <b>Ujian</b>");
    await page.fill('input[name="detail_1"]', "RM 200");
    await page.fill('textarea[name="detail_2"]', "Bantuan kecemasan");
    await page.setInputFiles('#dynamic-fields input[type="file"]', { name: "ic.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await page.check("#form-consent");
    await page.evaluate(() => document.getElementById("submissionForm").requestSubmit());
    await page.waitForFunction(() => /^\d{4}\d{8}/.test(document.getElementById("output-refNo").textContent), null, { timeout: 15000 });
    ref = await page.textContent("#output-refNo");
    assert.match(ref, /^5555\d{8}$/);
    assert.match(await page.textContent("#popup-success-msg"), /team Ujian telah menerima/);
  });
  await step("rekod sampai ke Sheet sebagai teks + PDF serahan & fail mentah di Drive", async () => {
    const sh = ss.getSheetByName("Permohonan");
    assert.strictEqual(sh.getRange(2, 2).getValue(), ref);
    assert.strictEqual(sh.getRange(2, 3).getValue(), "Ahmad Bin Ali");
    assert.strictEqual(sh.getRange(2, 4).getValue(), "990101015555");
    const names = env.files.map((f) => f.blob.name);
    assert.ok(names.includes(ref + ".pdf"));
    assert.ok(names.includes(ref + " (1).png"));
  });
  await step("semak status awam: butiran dipaparkan tetapi IC/telefon penuh/alamat/emel TIDAK bocor", async () => {
    await page.evaluate(() => showView("view-status"));
    await page.fill("#check-refNo", ref);
    await page.evaluate(() => checkStatus());
    await page.waitForFunction((r) => document.getElementById("status-result-list").textContent.includes(r), ref);
    await page.evaluate(() => openHistoryDetail(0));
    const modal = await page.textContent("#modal-history-detail");
    assert.ok(modal.includes("RM 200"));
    assert.ok(modal.includes("Bantuan kecemasan"));
    for (const secret of ["990101015555", "0123456789", "ahmad@contoh.my", "Jalan", "Ahmad Bin Ali", "drive.google.com"])
      assert.ok(!modal.includes(secret), "bocor: " + secret);
    assert.ok(modal.includes("Ah***") && modal.includes("******6789"));
  });
  await step("semak ikut nombor telefon turut berfungsi", async () => {
    await page.fill("#check-refNo", "0123456789");
    await page.evaluate(() => checkStatus());
    await page.waitForFunction((r) => document.getElementById("status-result-list").textContent.includes(r), ref);
  });

  // ================= ADMIN
  console.log("\n[Dashboard admin]");
  const ap = await context.newPage();
  watch(ap, "admin");
  await ap.goto(BASE + "/admin/");
  await ap.waitForSelector("#screen-login.flex");
  await step("jenama & tajuk dari config.js; URL dikunci dari config (skrin setup dilangkau)", async () => {
    assert.strictEqual(await ap.title(), "Test-Di — Dashboard Admin");
    assert.match(await ap.textContent("#screen-login"), /Test-Di · Ujian/);
    assert.ok(await ap.$eval("#screen-login img", (i) => i.src.endsWith("/assets/logo.svg")));
    assert.ok(await ap.$eval("#btn-change-url", (b) => b.classList.contains("hidden")));
  });
  await step("kata laluan salah ditolak dengan mesej jelas", async () => {
    await ap.fill("#login-email", "admin@ujian.my");
    await ap.fill("#login-pass", "salahsalahsalah");
    await ap.click("#login-btn");
    await ap.waitForFunction(() => !document.getElementById("login-msg").classList.contains("hidden"));
    assert.match(await ap.textContent("#login-msg"), /tidak sah/);
  });
  await step("log masuk berjaya → data dimuat, rekod Permohonan keluar dengan kunci kategori", async () => {
    await ap.fill("#login-pass", "KataLaluanKuat123");
    await ap.click("#login-btn");
    await ap.waitForSelector("#app:not(.hidden)", { timeout: 10000 });
    await ap.evaluate(() => App.go(1));
    await ap.waitForSelector("table.data tbody tr");
    assert.match(await ap.textContent("table.data tbody"), new RegExp(ref));
    assert.match(await ap.textContent("table.data tbody"), /Ahmad Bin Ali/);
  });
  await step("kemas kini status (bina laporan PDF) berjaya & tersimpan di Sheet", async () => {
    await ap.evaluate((r) => App.openEdit(r, "Permohonan"), ref);
    await ap.selectOption("#edit-status", "SEDANG DI PROSES");
    await ap.evaluate(() => App.onStatusChange());
    await ap.check('input[name="rmethod"][value="build"]');
    await ap.fill("#build-summary", "Sedang disemak oleh pegawai.");
    await ap.click("#save-btn");
    await ap.waitForFunction(() => /dikemaskini|direkodkan|berjaya/i.test(document.getElementById("toasts").textContent), null, { timeout: 15000 });
    const sh = ss.getSheetByName("Permohonan");
    assert.strictEqual(sh.getRange(2, 13).getValue(), "SEDANG DI PROSES");
    assert.match(sh.getRange(2, 16).getValue(), /drive\.google\.com/);
  });
  await step("log keluar → sesi di server dibatalkan", async () => {
    const tok = await ap.evaluate(() => sessionStorage.getItem("karadi_session_token"));
    assert.ok(tok);
    await ap.evaluate(() => App.logout());
    await ap.waitForSelector("#screen-login.flex");
    assert.match(post(env, { action: "get_admin_data", sessionToken: tok }).message, /Sesi admin/);
  });

  // ================= ringkasan
  console.log("\n[Kebergantungan luar & ralat konsol]");
  await step("tiada ralat JS (pageerror/console.error) pada kedua-dua halaman", async () => {
    const real = errors.filter((e) => !/Firebase belum dikonfigurasi|Firebase failed to init|tailwind is not defined/.test(e));
    assert.deepStrictEqual(real, [], JSON.stringify(real));
  });
  console.log("  i  hos luar yang disekat sandbox (tidak menjejaskan logik):", [...external].join(", "));

  await browser.close();
  server.close();
  console.log(`\nKeputusan E2E: ${passed} lulus, ${failed} gagal\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
