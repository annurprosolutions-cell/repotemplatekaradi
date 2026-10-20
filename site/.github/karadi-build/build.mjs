// =============================================================================
// build.mjs — dijalankan oleh GitHub Actions (.github/workflows/build.yml) setiap
// kali kandungan berubah (simpan dalam CMS). TIDAK perlu dijalankan secara manual.
//
// Apa yang dijana (semua fail ini di-commit semula ke repo oleh Actions):
//   assets/icons/*          favicon, ikon PWA & apple-touch-icon dari logo CMS (perlu sharp)
//   manifest.webmanifest    PWA (nama, warna, ikon)
//   artikel/<slug>/         halaman statik setiap artikel (content/artikel/*.md)
//   artikel/index.html      senarai semua artikel
//   sitemap.xml, robots.txt
//   index.html              HANYA bahagian antara <!-- SEO:START/END --> dan <!-- ARTIKEL:START/END -->
//
// Prinsip selamat: kalau ada ralat, skrip berhenti SEBELUM menulis apa-apa,
// jadi laman sedia ada tidak terjejas. sharp pilihan: tanpanya, logo asal dipakai
// sebagai favicon dan ikon PWA.
//
// Uji di komputer sendiri (dari akar repo):
//   npm install --no-save --prefix .github/karadi-build marked@16.4.2 yaml@2.9.1 sharp@0.35.4
//   node .github/karadi-build/build.mjs
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = process.env.KARADI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const R = (...p) => path.join(ROOT, ...p);
const log = (...a) => console.log("•", ...a);

const { marked } = await import("marked");
const YAML = await import("yaml");
let sharp = null;
try { sharp = (await import("sharp")).default; } catch { log("sharp tiada — ikon PNG dilangkau, logo asal dipakai."); }

// ---------------------------------------------------------------- utiliti
const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const esc = (s) => str(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const isPlaceholder = (v) => /^__[A-Z0-9_]+__$/.test(str(v));
const BULAN = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
const tarikhBM = (d) => (d ? `${Number(d.slice(8, 10))} ${BULAN[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "");
const hexOk = (h) => /^#?[0-9a-f]{6}$/i.test(str(h)) ? "#" + str(h).replace(/^#/, "").toLowerCase() : "";
const isLocal = (u) => u && !/^([a-z]+:|\/\/)/i.test(u);
const clean = (u) => str(u).replace(/^\.?\//, "");

// ---------------------------------------------------------------- baca input (belum tulis apa-apa)
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(R("config.js"), "utf8"), sandbox, { timeout: 1000 });
const BASE = (sandbox.window.KARADI_CONFIG || {}).BRAND || {};
const site = JSON.parse(fs.readFileSync(R("content/site.json"), "utf8"));

const pick = (cms, base) => str(cms) || (isPlaceholder(base) ? "" : str(base));
const b = site.brand || {};
const brand = {
  name: pick(b.name, BASE.name) || "Portal",
  tagline: pick(b.tagline, BASE.tagline),
  orgName: pick(b.org_name, BASE.orgName),
  logo: clean(pick(b.logo, BASE.logo) || "assets/logo.svg"),
};
const colors = site.colors || {};
const primary = hexOk(colors.primary) || "#1a4a9a";
const accent = hexOk(colors.accent);
const seo = site.seo || {};
const siteUrl = /^https?:\/\/[^\s]+$/i.test(str(seo.site_url)) ? str(seo.site_url).replace(/\/+$/, "") : "";
if (!siteUrl) log("seo.site_url kosong — canonical/sitemap guna laluan relatif (isi 'Alamat Laman' dalam CMS → SEO).");
const absUrl = (p) => (siteUrl ? siteUrl + "/" + clean(p) : clean(p));
const description = str(seo.description) || str((site.hero || {}).subtitle) || brand.tagline || brand.name;

// ---------------------------------------------------------------- artikel
marked.use({
  gfm: true,
  renderer: {
    html({ text }) { return esc(text); }, // HTML mentah dalam artikel dipaparkan sebagai teks
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (/^\s*(javascript|data|vbscript):/i.test(href || "")) return text;
      const ext = /^https?:\/\//i.test(href || "");
      return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ""}${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
    },
    image({ href, title, text }) {
      if (/^\s*(javascript|data|vbscript):/i.test(href || "")) return "";
      return `<img src="${esc(clean(href).startsWith("http") ? href : clean(href))}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ""} loading="lazy">`;
    },
  },
});

function readArticles() {
  const dir = R("content/artikel");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "");
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    let fm = {}, body = raw;
    if (m) {
      try { fm = YAML.parse(m[1]) || {}; } catch (e) { throw new Error(`Frontmatter rosak dalam content/artikel/${f}: ${e.message}`); }
      body = m[2];
    }
    if (fm.draft === true || str(fm.draft) === "true") { log(`draf dilangkau: ${f}`); continue; }
    const slug = f.replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    const title = str(fm.title);
    if (!slug || !title) { log(`dilangkau (tiada slug/tajuk): ${f}`); continue; }
    const d = fm.date instanceof Date ? fm.date.toISOString() : str(fm.date);
    const date = /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : "";
    const html = marked.parse(str(body) ? body : "");
    const plain = html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
    const desc = str(fm.description) || (plain.length > 160 ? plain.slice(0, 157).replace(/\s+\S*$/, "") + "…" : plain);
    out.push({ slug, title, date, cover: clean(fm.cover), desc, html });
  }
  return out.sort((a, z) => (z.date || "").localeCompare(a.date || "") || a.title.localeCompare(z.title));
}
const articles = readArticles();
log(`${articles.length} artikel diterbitkan`);

// ---------------------------------------------------------------- ikon (dalam memori dulu)
const files = new Map(); // laluan relatif → Buffer|string  (ditulis sekali gus di hujung)
let icons = null;
const logoFile = isLocal(brand.logo) ? R(brand.logo) : "";
if (sharp && logoFile && fs.existsSync(logoFile)) {
  try {
    const src = fs.readFileSync(logoFile);
    const sq = (size, pad, bg) => {
      const inner = Math.round(size * (1 - pad * 2));
      return sharp(src, { density: 384 })
        .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({ top: Math.floor((size - inner) / 2), bottom: Math.ceil((size - inner) / 2), left: Math.floor((size - inner) / 2), right: Math.ceil((size - inner) / 2), background: bg || { r: 0, g: 0, b: 0, alpha: 0 } })
        .flatten(bg ? { background: bg } : false)
        .png({ compressionLevel: 9 })
        .toBuffer();
    };
    const W = { r: 255, g: 255, b: 255 };
    files.set("assets/icons/favicon-32.png", await sq(32, 0));
    files.set("assets/icons/favicon-48.png", await sq(48, 0));
    files.set("assets/icons/icon-192.png", await sq(192, 0.04));
    files.set("assets/icons/icon-512.png", await sq(512, 0.04));
    files.set("assets/icons/icon-maskable-512.png", await sq(512, 0.14, W));
    files.set("assets/icons/apple-touch-icon.png", await sq(180, 0.08, W));
    icons = true;
    log("ikon dijana dari", brand.logo);
  } catch (e) {
    log("gagal jana ikon (logo dipakai terus):", e.message);
    for (const k of [...files.keys()]) if (k.startsWith("assets/icons/")) files.delete(k);
  }
} else if (!logoFile) log("logo ialah URL luar — ikon tidak dijana.");

const logoType = /\.svg$/i.test(brand.logo) ? "image/svg+xml" : /\.png$/i.test(brand.logo) ? "image/png" : /\.webp$/i.test(brand.logo) ? "image/webp" : "image/jpeg";
const iconLinks = (pre = "") => icons
  ? `<link rel="icon" type="image/png" sizes="32x32" href="${pre}assets/icons/favicon-32.png" data-built>
    <link rel="icon" type="image/png" sizes="48x48" href="${pre}assets/icons/favicon-48.png" data-built>
    <link rel="apple-touch-icon" href="${pre}assets/icons/apple-touch-icon.png">`
  : `<link rel="icon" type="${logoType}" href="${esc(isLocal(brand.logo) ? pre + brand.logo : brand.logo)}" data-built>`;

// ---------------------------------------------------------------- manifest
const manifest = {
  name: brand.name + (brand.tagline ? " — " + brand.tagline : ""),
  short_name: brand.name.slice(0, 24),
  description,
  lang: "ms",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: primary,
  icons: icons
    ? [
        { src: "assets/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "assets/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "assets/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [{ src: brand.logo, sizes: logoType === "image/svg+xml" ? "any" : "512x512", type: logoType, purpose: "any" }],
};
files.set("manifest.webmanifest", JSON.stringify(manifest, null, 2) + "\n");

// ---------------------------------------------------------------- templat halaman artikel
const ogImageDefault = clean(seo.og_image) || (icons ? "assets/icons/icon-512.png" : brand.logo);
const orgLd = { "@type": "Organization", name: brand.orgName || brand.name, url: siteUrl ? siteUrl + "/" : undefined, logo: absUrl(icons ? "assets/icons/icon-512.png" : brand.logo) };
const TW = `<script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    <script>tailwind.config = { theme: { extend: { colors: { brand: 'rgb(var(--brand-rgb, 26 74 154) / <alpha-value>)', brand2: 'rgb(var(--brand2-rgb, 20 58 122) / <alpha-value>)' } } } };</script>`;
const head = ({ title, desc, url, image, type, ld, base }) => `<!DOCTYPE html>
<html lang="ms" data-keep-title>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <base href="${base}">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <meta name="theme-color" content="${primary}">
    ${siteUrl ? `<link rel="canonical" href="${esc(absUrl(url))}">\n    <meta property="og:url" content="${esc(absUrl(url))}">` : ""}
    <meta property="og:type" content="${type}">
    <meta property="og:site_name" content="${esc(brand.name)}">
    <meta property="og:locale" content="ms_MY">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:image" content="${esc(absUrl(image))}">
    <meta name="twitter:card" content="summary_large_image">
    ${iconLinks()}
    <link rel="manifest" href="manifest.webmanifest">
    <script type="application/ld+json">${jsonLd(ld)}</script>
    <script src="config.js"></script>
    <script src="assets/brand.js"></script>
    ${TW}
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Inter',system-ui,sans-serif;background:#F5F6F8}</style>
</head>
<body class="min-h-screen flex flex-col text-gray-800">
    <header class="bg-brand shadow-md">
        <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="./" class="flex items-center gap-3">
                <span class="w-10 h-10 bg-white rounded-full flex items-center justify-center p-1"><img src="${esc(isLocal(brand.logo) ? brand.logo : brand.logo)}" data-brand-logo alt="Logo" class="h-full w-full object-contain"></span>
                <span>
                    <span class="block text-lg font-bold leading-none text-white" data-brand="name">${esc(brand.name)}</span>
                    <span class="block text-[0.7rem] text-white/70 uppercase tracking-wider" data-brand="tagline">${esc(brand.tagline)}</span>
                </span>
            </a>
            <a href="./" class="text-white/90 hover:text-white text-sm font-semibold"><i class="fas fa-home mr-1"></i> Utama</a>
        </div>
    </header>
    <main class="flex-grow max-w-4xl w-full mx-auto px-4 py-8">`;
const foot = `
    </main>
    <footer class="bg-gray-800 text-gray-400 py-6 text-center text-xs">
        <p class="font-bold text-white mb-1"><span data-brand="name">${esc(brand.name)}</span></p>
        <p>&copy; ${new Date().getFullYear()} <span data-brand="orgName">${esc(brand.orgName)}</span></p>
        <p class="mt-3 space-x-4"><a href="./" class="hover:text-white">Utama</a><a href="artikel/" class="hover:text-white">Artikel</a></p>
    </footer>
    <script>if (window.applyBrand) applyBrand();</script>
</body>
</html>
`;
const card = (a, pre = "") => `<a href="${pre}artikel/${a.slug}/" class="block bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition group">
                ${a.cover ? `<img src="${esc(isLocal(a.cover) ? pre + a.cover : a.cover)}" alt="" loading="lazy" class="w-full h-40 object-cover">` : ""}
                <div class="p-4">
                    ${a.date ? `<p class="text-xs text-gray-400 mb-1">${tarikhBM(a.date)}</p>` : ""}
                    <h3 class="font-bold text-gray-800 group-hover:text-brand leading-snug">${esc(a.title)}</h3>
                    <p class="text-xs text-gray-500 mt-2 line-clamp-3">${esc(a.desc)}</p>
                </div>
            </a>`;

const articleCrumb = (title) => `
        <nav class="text-xs text-gray-500 mb-4"><a href="./" class="hover:text-brand">Utama</a> <span class="mx-1">›</span> <a href="artikel/" class="hover:text-brand">Artikel</a>${title ? ` <span class="mx-1">›</span> <span class="text-gray-700">${esc(title)}</span>` : ""}</nav>`;

for (const a of articles) {
  const url = `artikel/${a.slug}/`;
  const ld = {
    "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.desc,
    datePublished: a.date || undefined, dateModified: a.date || undefined,
    image: a.cover ? [absUrl(a.cover)] : undefined, mainEntityOfPage: siteUrl ? absUrl(url) : undefined,
    author: orgLd, publisher: orgLd,
  };
  files.set(`${url}index.html`, head({ title: `${a.title} — ${brand.name}`, desc: a.desc, url, image: a.cover || ogImageDefault, type: "article", ld, base: "../../" }) + articleCrumb(a.title) + `
        <article class="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            ${a.cover ? `<img src="${esc(a.cover)}" alt="${esc(a.title)}" class="w-full max-h-[420px] object-cover">` : ""}
            <div class="p-6 md:p-10">
                <h1 class="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">${esc(a.title)}</h1>
                ${a.date ? `<p class="text-sm text-gray-400 mt-2"><i class="far fa-calendar mr-1"></i> <time datetime="${a.date}">${tarikhBM(a.date)}</time></p>` : ""}
                <div class="prose prose-slate max-w-none mt-6 prose-a:text-brand prose-img:rounded-lg">
${a.html}
                </div>
            </div>
        </article>
        <p class="mt-8"><a href="artikel/" class="text-brand font-semibold hover:underline"><i class="fas fa-arrow-left mr-1"></i> Semua artikel</a></p>` + foot);
}
if (articles.length) {
  const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: `Artikel — ${brand.name}`, url: siteUrl ? absUrl("artikel/") : undefined,
    hasPart: articles.map((a) => ({ "@type": "Article", headline: a.title, url: siteUrl ? absUrl(`artikel/${a.slug}/`) : undefined })) };
  files.set("artikel/index.html", head({ title: `Artikel — ${brand.name}`, desc: `Berita, pengumuman dan artikel terkini daripada ${brand.orgName || brand.name}.`, url: "artikel/", image: ogImageDefault, type: "website", ld, base: "../" }) + articleCrumb("") + `
        <h1 class="text-2xl font-bold text-gray-900 mb-6">Artikel &amp; Berita</h1>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            ${articles.map((a) => card(a)).join("\n            ")}
        </div>` + foot);
}

// ---------------------------------------------------------------- sitemap & robots
const sm = [{ loc: "", lastmod: articles[0] ? articles[0].date : "", pr: "1.0" }];
if (articles.length) sm.push({ loc: "artikel/", lastmod: articles[0].date, pr: "0.8" });
for (const a of articles) sm.push({ loc: `artikel/${a.slug}/`, lastmod: a.date, pr: "0.7" });
if (siteUrl) {
  files.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sm.map((u) => `  <url><loc>${esc(siteUrl + "/" + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.pr}</priority></url>`).join("\n")}
</urlset>
`);
}
files.set("robots.txt", `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /cms/
${siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : ""}`);

// ---------------------------------------------------------------- index.html (antara penanda sahaja)
let index = fs.readFileSync(R("index.html"), "utf8");
function between(html, name, content) {
  const re = new RegExp(`(<!-- ${name}:START[^>]*-->)[\\s\\S]*?(\\n?[ \\t]*<!-- ${name}:END -->)`);
  if (!re.test(html)) { log(`penanda ${name} tiada dalam index.html — dilangkau`); return html; }
  return html.replace(re, (_, a, z) => a + content + z);
}
const homeTitle = `${brand.name}${brand.tagline ? " — " + brand.tagline : ""}`;
const homeLd = [
  { "@context": "https://schema.org", "@type": "WebSite", name: brand.name, url: siteUrl ? siteUrl + "/" : undefined, description },
  Object.assign({ "@context": "https://schema.org" }, orgLd, {
    email: pick((site.contact || {}).email, BASE.email) || undefined,
    sameAs: ["facebook", "instagram", "tiktok", "x", "youtube", "threads", "telegram", "website"].map((k) => str((site.contact || {})[k])).filter((u) => /^https?:\/\//.test(u)),
  }),
];
index = between(index, "SEO", `
    <title>${esc(homeTitle)}</title>
    <meta name="description" content="${esc(description)}">
    <meta name="theme-color" content="${primary}">
    ${siteUrl ? `<link rel="canonical" href="${esc(siteUrl)}/">\n    <meta property="og:url" content="${esc(siteUrl)}/">\n    ` : ""}<meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(brand.name)}">
    <meta property="og:locale" content="ms_MY">
    <meta property="og:title" content="${esc(homeTitle)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:image" content="${esc(absUrl(ogImageDefault))}">
    <meta name="twitter:card" content="summary_large_image">
    ${str(seo.google_verification) ? `<meta name="google-site-verification" content="${esc(seo.google_verification)}">\n    ` : ""}${iconLinks()}
    <link rel="manifest" href="manifest.webmanifest">
    <script type="application/ld+json">${jsonLd(homeLd)}</script>`);
index = between(index, "ARTIKEL", articles.length ? `
            <section aria-labelledby="artikel-terkini">
                <div class="flex items-center justify-between mb-4">
                    <h2 id="artikel-terkini" class="text-lg font-bold text-gray-800"><i class="far fa-newspaper text-brand mr-2"></i>Artikel &amp; Berita Terkini</h2>
                    <a href="artikel/" class="text-sm font-semibold text-brand hover:underline">Lihat semua</a>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            ${articles.slice(0, 3).map((a) => card(a)).join("\n            ")}
                </div>
            </section>` : "");
files.set("index.html", index);

// ---------------------------------------------------------------- tulis (semua input berjaya dibaca)
// Buang fail lama yang tidak dijana lagi (cth. artikel yang dipadam / jadi draf)
for (const dir of ["artikel", "assets/icons"]) {
  const walk = (d) => fs.existsSync(R(d)) ? fs.readdirSync(R(d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]) : [];
  for (const rel of walk(dir)) if (!files.has(rel)) fs.rmSync(R(rel), { force: true });
  const prune = (d) => { if (!fs.existsSync(R(d))) return; for (const e of fs.readdirSync(R(d), { withFileTypes: true })) if (e.isDirectory()) prune(`${d}/${e.name}`); if (!fs.readdirSync(R(d)).length) fs.rmdirSync(R(d)); };
  prune(dir);
}
if (!siteUrl) fs.rmSync(R("sitemap.xml"), { force: true });
let n = 0;
for (const [rel, data] of files) {
  const f = R(rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  if (fs.existsSync(f) && fs.readFileSync(f).equals(buf)) continue;
  fs.writeFileSync(f, buf); n++;
}
log(`siap — ${files.size} fail dijana, ${n} berubah.`);
