#!/usr/bin/env node
// =============================================================================
// cms-features-test.js — uji ciri CMS (jenama, warna, teks, hubungan, privasi)
// dan skrip build GitHub Actions (artikel, SEO, sitemap, ikon PWA).
//
// Guna:  node dev/cms-features-test.js
// Perlu: playwright + Chromium (sama seperti e2e-browser-test.js) dan akses ke
//        registry npm (memasang tailwindcss@3, marked, yaml, sharp dalam folder sementara).
// Pilihan: CHROMIUM_PATH=/laluan/ke/chrome
//
// Tailwind CDN disekat dalam ujian, jadi CSS dibina dengan Tailwind CLI v3 dan
// konfigurasi warna yang SAMA seperti dalam index.html / admin/index.html.
// =============================================================================
const fs = require("fs"), os = require("os"), path = require("path");
const { execFileSync } = require("child_process");

const T = path.resolve(__dirname, "..");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "karadi-feat-"));
const run = (cmd, args, opt = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opt });
const BUILD = ".github/karadi-build";
const deps = (fs.readFileSync(path.join(T, "site/.github/workflows/build.yml"), "utf8").match(/(marked@[\d.]+|yaml@[\d.]+|sharp@[\d.]+)/g) || []);

console.log("1) Pasang alat dalam", work);
fs.writeFileSync(path.join(work, "package.json"), "{}");
run("npm", ["install", "--no-audit", "--no-fund", "--silent", "tailwindcss@3.4.17", ...deps], { cwd: work });

console.log("2) Bina CSS Tailwind dengan warna CSS-variable yang sama seperti halaman");
const blue = { 50: "239 246 255", 100: "219 234 254", 200: "191 219 254", 300: "147 197 253", 400: "96 165 250", 500: "59 130 246", 600: "37 99 235", 700: "29 78 216", 800: "30 64 175", 900: "30 58 138" };
const portalCfg = { content: [path.join(T, "site/index.html"), path.join(T, "site/.github/karadi-build/build.mjs")], theme: { extend: { colors: {
  brand: "rgb(var(--brand-rgb, 26 74 154) / <alpha-value>)", brand2: "rgb(var(--brand2-rgb, 20 58 122) / <alpha-value>)",
  blue: Object.fromEntries(Object.entries(blue).map(([k, v]) => [k, `rgb(var(--b${k}, ${v}) / <alpha-value>)`])) } } } };
const adminCfg = { content: [path.join(T, "site/admin/index.html")], theme: { extend: { colors: {
  ink: "#0F172A", mist: "#F1F5F9", navy: "rgb(var(--navy-rgb, 18 39 91) / <alpha-value>)",
  brand: "rgb(var(--brand-rgb, 26 74 154) / <alpha-value>)", brand2: "rgb(var(--brand-light-rgb, 37 99 235) / <alpha-value>)" } } } };
// Pastikan konfigurasi di atas masih sepadan dengan halaman
const idx = fs.readFileSync(path.join(T, "site/index.html"), "utf8"), adm = fs.readFileSync(path.join(T, "site/admin/index.html"), "utf8");
for (const s of ["rgb(var(--brand-rgb, 26 74 154) / <alpha-value>)", "rgb(var(--b600, 37 99 235) / <alpha-value>)"]) if (!idx.includes(s)) throw new Error("index.html tailwind.config berubah: " + s);
if (!adm.includes("rgb(var(--navy-rgb, 18 39 91) / <alpha-value>)")) throw new Error("admin tailwind.config berubah");
fs.writeFileSync(path.join(work, "p.config.js"), "module.exports=" + JSON.stringify(portalCfg));
fs.writeFileSync(path.join(work, "a.config.js"), "module.exports=" + JSON.stringify(adminCfg));
fs.writeFileSync(path.join(work, "in.css"), "@tailwind base;@tailwind components;@tailwind utilities;");
const tw = path.join(work, "node_modules/.bin/tailwindcss");
run(tw, ["-c", "p.config.js", "-i", "in.css", "-o", "portal.css"], { cwd: work, stdio: "ignore" });
run(tw, ["-c", "a.config.js", "-i", "in.css", "-o", "admin.css"], { cwd: work, stdio: "ignore" });

const node = (script, ...args) => run(process.execPath, [path.join(__dirname, script), ...args], { env: { ...process.env, NODE_PATH: [process.env.NODE_PATH, path.join(work, "node_modules")].filter(Boolean).join(path.delimiter) } });

console.log("\n3) Tetapan CMS pada portal & admin (site.json template)");
node("lib-cms-runtime-check.js", path.join(T, "site"), work);

console.log("\n4) Skrip build: jana artikel/SEO/ikon dari kandungan contoh");
const repo = path.join(work, "repo");
fs.cpSync(path.join(T, "site"), repo, { recursive: true });
fs.symlinkSync(path.join(work, "node_modules"), path.join(repo, BUILD, "node_modules"), "dir");
const site = JSON.parse(fs.readFileSync(path.join(repo, "content/site.json"), "utf8"));
Object.assign(site.brand, { name: "E-Bintong", tagline: "Sistem Interaksi Digital", org_name: "PKMB Bintong", logo: "assets/uploads/logo.png" });
site.colors.primary = "#0F7B3F";
Object.assign(site.seo, { site_url: "https://ebintong.example.my/", description: "Portal rasmi E-Bintong." });
fs.writeFileSync(path.join(repo, "content/site.json"), JSON.stringify(site, null, 2));
run(process.execPath, ["-e", `require(${JSON.stringify(path.join(work, "node_modules/sharp"))})({create:{width:600,height:400,channels:4,background:{r:15,g:123,b:63,alpha:1}}}).png().toFile(${JSON.stringify(path.join(repo, "assets/uploads/logo.png"))})`]);
fs.mkdirSync(path.join(repo, "content/artikel"), { recursive: true });
fs.writeFileSync(path.join(repo, "content/artikel/gotong-royong-perdana.md"), `---
title: Gotong-Royong Perdana "Bintong" 2026
date: 2026-10-18
cover: assets/uploads/logo.png
description: Program gotong-royong bersama penduduk Bintong.
---
## Butiran

Program ini **terbuka** kepada semua. [Facebook](https://facebook.com/bintong) [klik](javascript:alert(1))

<script>alert('xss')</script>
`);
fs.writeFileSync(path.join(repo, "content/artikel/bantuan-banjir.md"), "---\ntitle: Bantuan Banjir Fasa 2\ndate: 2026-10-19T09:00\n---\nPermohonan dibuka.\n");
fs.writeFileSync(path.join(repo, "content/artikel/draf.md"), "---\ntitle: Draf\ndate: 2026-10-20\ndraft: true\n---\nBelum.\n");
run(process.execPath, [path.join(repo, BUILD, "build.mjs")]);
const before = fs.readFileSync(path.join(repo, "index.html"), "utf8");
const out2 = execFileSync(process.execPath, [path.join(repo, BUILD, "build.mjs")], { encoding: "utf8" });
const assert = require("assert");
assert.ok(/0 berubah/.test(out2), "build kedua sepatutnya tiada perubahan (idempoten)");
assert.strictEqual(fs.readFileSync(path.join(repo, "index.html"), "utf8"), before);
assert.ok(!fs.existsSync(path.join(repo, "artikel/draf")), "draf tidak diterbitkan");
const art = fs.readFileSync(path.join(repo, "artikel/gotong-royong-perdana/index.html"), "utf8");
assert.ok(!art.includes("<script>alert") && !art.includes("javascript:"), "HTML/pautan berbahaya dalam artikel dineutralkan");
// site.json rosak → build gagal TANPA menulis apa-apa
const snap = fs.readFileSync(path.join(repo, "sitemap.xml"), "utf8");
fs.writeFileSync(path.join(repo, "content/site.json"), "{rosak");
assert.throws(() => execFileSync(process.execPath, [path.join(repo, BUILD, "build.mjs")], { stdio: "ignore" }));
assert.strictEqual(fs.readFileSync(path.join(repo, "sitemap.xml"), "utf8"), snap);
fs.writeFileSync(path.join(repo, "content/site.json"), JSON.stringify(site, null, 2));
console.log("  ✓ idempoten, draf dilangkau, XSS dineutralkan, gagal-selamat bila site.json rosak");

console.log("\n5) Halaman yang dijana dalam pelayar");
node("lib-build-output-check.js", repo, work);
fs.rmSync(work, { recursive: true, force: true });
console.log("\nSemua ujian ciri CMS lulus.");
