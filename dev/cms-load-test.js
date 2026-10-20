#!/usr/bin/env node
// =============================================================================
// cms-load-test.js — pastikan Sveltia CMS (versi yang dikunci dalam site/cms/index.html)
// berjaya memuat site/cms/config.yml template dan memaparkan skrin log masuk.
//
// Guna:  npm i playwright && npx playwright install chromium   (sekali)
//        node dev/cms-load-test.js
// Perlu: akses ke registry npm (untuk memuat turun versi Sveltia yang sama).
// Pilihan: CHROMIUM_PATH=/laluan/ke/chrome   PORT=8770
//
// Ia TIDAK log masuk ke GitHub dan TIDAK menyunting kandungan. Gunanya: mengesan
// config.yml yang rosak atau versi Sveltia yang tak lagi serasi SEBELUM anda naik taraf klien.
// =============================================================================
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), assert = require("assert");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const T = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8770);
const html = fs.readFileSync(path.join(T, "site/cms/index.html"), "utf8");
const ver = (html.match(/@sveltia\/cms@([0-9][^/"']*)\/dist\/sveltia-cms\.js/) || [])[1];
assert.ok(ver, "Versi Sveltia tidak dikunci dalam site/cms/index.html (cari @sveltia/cms@<versi>)");

const work = fs.mkdtempSync(path.join(os.tmpdir(), "karadi-cms-"));
const site = path.join(work, "site");
fs.cpSync(path.join(T, "site"), site, { recursive: true });
const cfgPath = path.join(site, "cms/config.yml");
fs.writeFileSync(cfgPath, fs.readFileSync(cfgPath, "utf8").split("__GITHUB_REPO__").join("contoh-org/contoh-repo"));

console.log(`Memuat turun @sveltia/cms@${ver} dari npm…`);
execFileSync("npm", ["pack", `@sveltia/cms@${ver}`, "--silent"], { cwd: work, stdio: "pipe" });
execFileSync("tar", ["xzf", `sveltia-cms-${ver}.tgz`], { cwd: work });
const pkg = path.join(work, "package");

const mime = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".yml": "text/yaml", ".svg": "image/svg+xml" };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(site, p);
  if (!f.startsWith(site) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": mime[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.getuid?.() === 0 ? ["--no-sandbox"] : [] });
  const ctx = await browser.newContext();
  // unpkg → fail tempatan daripada pakej npm yang sama (versi dikunci); hos lain disekat.
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "localhost") return route.continue();
    if (u.hostname === "unpkg.com") {
      const m = u.pathname.match(/@sveltia\/cms(?:@[^/]+)?\/(.+)$/);
      const f = m && path.join(pkg, m[1]);
      if (f && fs.existsSync(f) && fs.statSync(f).isFile()) {
        return route.fulfill({ status: 200, contentType: f.endsWith(".js") ? "text/javascript" : "application/octet-stream", body: fs.readFileSync(f) });
      }
      return route.fulfill({ status: 404, body: "" });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/cms/`, { waitUntil: "load" });
  await page.waitForFunction(() => /Sign In/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ");
  const buttons = await page.$$eval("button", (e) => e.map((x) => x.innerText.trim()).filter(Boolean));
  await browser.close(); server.close();

  let failed = 0;
  const ok = (n, f) => { try { f(); console.log("  ✓", n); } catch (e) { failed++; console.log("  ✗", n, "\n     ", e.message.split("\n")[0]); } };
  console.log(`\nSveltia CMS ${ver}:`);
  ok("tiada ralat JS semasa memuat", () => assert.deepStrictEqual(errs, []));
  ok("config.yml dimuat (nama repo muncul pada skrin)", () => assert.match(text, /contoh-repo/));
  ok("tiada mesej ralat konfigurasi", () => assert.doesNotMatch(text, /error|ralat|failed to load|invalid/i));
  ok('ada butang "Sign In with GitHub"', () => assert.ok(buttons.some((b) => /Sign In with/i.test(b)), JSON.stringify(buttons)));
  ok('ada butang "Sign In Using Access Token"', () => assert.ok(buttons.some((b) => /Access Token/i.test(b)), JSON.stringify(buttons)));
  fs.rmSync(work, { recursive: true, force: true });
  console.log(failed ? `\nGAGAL (${failed})\n` : "\nLulus\n");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(2); });
