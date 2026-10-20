/* brand.js — mengisi jenama, hubungan, warna dan logo ke dalam halaman.
   Tidak perlu diedit. Dimuatkan oleh index.html dan admin/index.html selepas config.js.

   Sumber nilai (yang pertama TIDAK kosong menang):
     1) content/site.json  → diurus melalui Sveltia CMS (/cms/)
     2) config.js BRAND    → nilai asal semasa setup
   Kalau kedua-duanya kosong, elemen berkaitan disembunyikan.

   Penanda dalam HTML:
     data-brand="name"                → textContent = BRAND.name
     data-brand-logo                  → src = URL logo
     data-brand-href="mailto|wa|tel"  → href dibina dari BRAND.email / whatsapp / phone
     data-brand-show="email"          → elemen disembunyikan kalau BRAND.email kosong
     data-social="facebook"           → href = pautan media sosial, sembunyi kalau kosong
*/
(function () {
  var cfg = window.KARADI_CONFIG || {};
  var B = cfg.BRAND || {};
  var BASE = {};
  for (var k0 in B) BASE[k0] = B[k0];

  // URL akar laman = lokasi brand.js tanpa "assets/brand.js" (berfungsi dari / dan /admin/)
  var src = (document.currentScript && document.currentScript.src) || "";
  var siteBase = src.replace(/assets\/brand\.js(\?.*)?$/, "");
  function abs(u) {
    u = String(u || "");
    return /^(https?:|data:|\/\/)/i.test(u) ? u : siteBase + u.replace(/^\.?\//, "");
  }
  function str(v) { return (v === undefined || v === null) ? "" : String(v).trim(); }

  window.KARADI_BRAND = B;
  window.KARADI_SITE_BASE = siteBase;
  window.KARADI_SITE = {};

  // ---------------------------------------------------------------- warna
  var DEFAULT = { primary: "#1A4A9A", secondary: "#12275B" };
  function hexRgb(h) {
    h = str(h).replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/(.)/g, "$1$1");
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mix(c, t, w) { return [0, 1, 2].map(function (i) { return Math.round(c[i] + (t[i] - c[i]) * w); }); }
  function rgbStr(c) { return c.join(" "); }
  function hexStr(c) { return "#" + c.map(function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function isLight(c) { return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) > 160; }
  var W = [255, 255, 255], K = [0, 0, 0];
  // Skala biru Tailwind (50–900) dijana dari warna utama (warna utama = 700)
  var SCALE = { 50: [W, .94], 100: [W, .87], 200: [W, .74], 300: [W, .58], 400: [W, .38],
                500: [W, .2], 600: [W, .09], 800: [K, .2], 900: [K, .38] };

  function applyColors(c) {
    c = c || {};
    var root = document.documentElement, s = root.style;
    var p = hexRgb(c.primary), sec = hexRgb(c.secondary), acc = hexRgb(c.accent);
    var names = ["--brand-rgb", "--brand2-rgb", "--navy-rgb", "--brand-light-rgb", "--accent-rgb", "--accent-fg"];
    for (var n in SCALE) names.push("--b" + n);
    names.push("--b700");
    names.forEach(function (v) { s.removeProperty(v); });
    if (p) {
      s.setProperty("--brand-rgb", rgbStr(p));
      s.setProperty("--b700", rgbStr(p));
      for (var sh in SCALE) s.setProperty("--b" + sh, rgbStr(mix(p, SCALE[sh][0], SCALE[sh][1])));
      s.setProperty("--brand-light-rgb", rgbStr(mix(p, W, .09)));
    }
    var dark = sec || (p ? mix(p, K, .2) : null);
    if (dark) {
      s.setProperty("--brand2-rgb", rgbStr(dark));
      s.setProperty("--navy-rgb", rgbStr(sec || mix(p, K, .4)));
      s.setProperty("--b800", rgbStr(dark));
      s.setProperty("--b900", rgbStr(mix(dark, K, .25)));
    }
    if (acc) {
      s.setProperty("--accent-rgb", rgbStr(acc));
      s.setProperty("--accent-fg", isLight(acc) ? "#1f2937" : "#ffffff");
    }
    root.classList.toggle("has-accent", !!acc);
    B.colors = {
      primary: p ? hexStr(p) : DEFAULT.primary,
      secondary: sec ? hexStr(sec) : (p ? hexStr(mix(p, K, .4)) : DEFAULT.secondary),
      accent: acc ? hexStr(acc) : ""
    };
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta && document.head) {
      meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta);
    }
    if (meta) meta.content = B.colors.primary;
  }

  // ---------------------------------------------------------------- data CMS → BRAND
  var MAP_BRAND = { name: "name", tagline: "tagline", org_name: "orgName", org_short: "orgShort",
                    office_label: "officeLabel", logo: "logo" };
  var MAP_CONTACT = { email: "email", whatsapp: "whatsapp", phone: "phone", phone_display: "phoneDisplay",
                      address: "address" };
  var SOCIALS = ["facebook", "instagram", "tiktok", "x", "youtube", "threads", "telegram", "website"];

  function merge(site) {
    var b = site.brand || {}, c = site.contact || {}, k;
    for (k in BASE) B[k] = BASE[k];
    for (k in MAP_BRAND) if (str(b[k])) B[MAP_BRAND[k]] = str(b[k]);
    for (k in MAP_CONTACT) if (str(c[k])) B[MAP_CONTACT[k]] = str(c[k]);
    B.social = {};
    SOCIALS.forEach(function (s) {
      var u = str(c[s]) || str((BASE.social || {})[s]);
      if (/^https?:\/\//i.test(u)) B.social[s] = u;
    });
    // Elakkan token placeholder (cth. __WHATSAPP__) dipaparkan kepada orang ramai
    for (k in B) if (typeof B[k] === "string" && /^__[A-Z0-9_]+__$/.test(B[k])) B[k] = "";
    B.logoUrl = abs(B.logo || "assets/logo.svg");
    applyColors(site.colors);
  }

  function setFavicon() {
    if (!document.head || document.querySelector('link[rel="icon"][data-built]')) return;
    var l = document.querySelector('link[rel="icon"]');
    if (!l) { l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l); }
    l.href = B.logoUrl;
  }

  window.applyBrand = function (titleSuffix) {
    var i, els;
    if (titleSuffix !== undefined) window.applyBrand.suffix = titleSuffix;
    titleSuffix = window.applyBrand.suffix;
    els = document.querySelectorAll("[data-brand]");
    for (i = 0; i < els.length; i++) {
      var v = B[els[i].getAttribute("data-brand")];
      if (v !== undefined && v !== null && v !== "") els[i].textContent = v;
    }
    els = document.querySelectorAll("[data-brand-logo]");
    for (i = 0; i < els.length; i++) if (els[i].getAttribute("src") !== B.logoUrl) els[i].src = B.logoUrl;

    var wa = String(B.whatsapp || "").replace(/\D/g, "");
    var tel = String(B.phone || "").replace(/\D/g, "") || wa;
    if (!B.phoneDisplay && tel) B.phoneDisplay = "+" + tel;
    var has = { email: !!B.email, whatsapp: !!wa, phone: !!tel, address: !!B.address };
    els = document.querySelectorAll("[data-brand-href]");
    for (i = 0; i < els.length; i++) {
      var k = els[i].getAttribute("data-brand-href");
      if (k === "mailto" && B.email) els[i].href = "mailto:" + B.email;
      if (k === "wa" && wa) els[i].href = "https://wa.me/" + wa;
      if (k === "tel" && tel) els[i].href = "tel:+" + tel;
    }
    els = document.querySelectorAll("[data-brand-show]");
    for (i = 0; i < els.length; i++) {
      var need = els[i].getAttribute("data-brand-show").split(/\s+/);
      var ok = need.some(function (n) { return n === "social" ? Object.keys(B.social || {}).length > 0 : has[n]; });
      els[i].style.display = ok ? "" : "none";
    }
    els = document.querySelectorAll("[data-social]");
    for (i = 0; i < els.length; i++) {
      var u = (B.social || {})[els[i].getAttribute("data-social")];
      if (u) { els[i].href = u; els[i].style.display = ""; } else els[i].style.display = "none";
    }
    setFavicon();
    // Halaman statik (artikel) ada tajuk SEO sendiri: <html data-keep-title>
    if (B.name && !document.documentElement.hasAttribute("data-keep-title")) document.title = B.name + (titleSuffix ? " — " + titleSuffix : "");
  };

  // Dipanggil dengan isi content/site.json (portal memanggil ini setiap kali ia memuat semula)
  window.KARADI_applySite = function (site) {
    if (!site || typeof site !== "object") return;
    window.KARADI_SITE = site;
    try { localStorage.setItem("karadi_site", JSON.stringify(site)); } catch (e) {}
    merge(site);
    if (document.body) window.applyBrand();
    try { document.dispatchEvent(new CustomEvent("karadi:site", { detail: site })); } catch (e) {}
  };

  // Guna salinan terakhir (localStorage) dulu supaya warna/logo tidak "berkelip"
  var cached = {};
  try { cached = JSON.parse(localStorage.getItem("karadi_site") || "{}") || {}; } catch (e) {}
  window.KARADI_SITE = cached;
  merge(cached);

  // Muat versi terkini sekali (portal juga memuat semula setiap 60 saat)
  function load() {
    if (!window.fetch) return;
    fetch(siteBase + "content/site.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(window.KARADI_applySite)
      .catch(function (e) { console.warn("content/site.json tidak dapat dimuat (tidak kritikal):", e); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
