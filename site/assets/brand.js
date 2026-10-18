/* brand.js — mengisi jenama (nama, logo, hubungan) daripada config.js ke dalam halaman.
   Tidak perlu diedit. Dimuatkan oleh index.html dan admin/index.html selepas config.js.

   Penanda dalam HTML:
     data-brand="name"            → textContent = BRAND.name
     data-brand-logo              → src = URL logo
     data-brand-href="mailto|wa|tel" → href dibina dari BRAND.email / BRAND.whatsapp
*/
(function () {
  var cfg = window.KARADI_CONFIG || {};
  var B = cfg.BRAND || {};

  // URL akar laman = lokasi brand.js tanpa "assets/brand.js" (berfungsi dari / dan /admin/)
  var src = (document.currentScript && document.currentScript.src) || "";
  var siteBase = src.replace(/assets\/brand\.js(\?.*)?$/, "");
  function abs(u) {
    u = String(u || "");
    return /^(https?:|data:|\/\/)/i.test(u) ? u : siteBase + u.replace(/^\.?\//, "");
  }

  B.logoUrl = abs(B.logo || "assets/logo.svg");
  window.KARADI_BRAND = B;
  window.KARADI_SITE_BASE = siteBase;

  window.applyBrand = function (titleSuffix) {
    var i, els;
    els = document.querySelectorAll("[data-brand]");
    for (i = 0; i < els.length; i++) {
      var v = B[els[i].getAttribute("data-brand")];
      if (v !== undefined && v !== null && v !== "") els[i].textContent = v;
    }
    els = document.querySelectorAll("[data-brand-logo]");
    for (i = 0; i < els.length; i++) els[i].src = B.logoUrl;

    var digits = String(B.whatsapp || "").replace(/\D/g, "");
    els = document.querySelectorAll("[data-brand-href]");
    for (i = 0; i < els.length; i++) {
      var k = els[i].getAttribute("data-brand-href");
      if (k === "mailto" && B.email) els[i].href = "mailto:" + B.email;
      if (k === "wa" && digits) els[i].href = "https://wa.me/" + digits;
      if (k === "tel" && digits) els[i].href = "tel:+" + digits;
    }
    if (B.name) document.title = B.name + (titleSuffix ? " — " + titleSuffix : "");
  };
})();
