/* =============================================================================
   config.js — SATU-SATUNYA FAIL LAMAN WEB YANG KENA DIEDIT UNTUK SETIAP KLIEN
   -----------------------------------------------------------------------------
   Dibaca oleh portal rakyat (index.html) dan dashboard admin (admin/index.html).
   Kalau guna new-client.sh, nilai placeholder (diapit dua garis-bawah) diisi automatik; selebihnya
   (URL Apps Script & Firebase) anda tampal selepas deploy.

   Kandungan yang kerap berubah (slide, pengumuman, waktu operasi, suis tutup
   borang) BUKAN di sini — ia diurus melalui Sveltia CMS: content/site.json.

   Fail ini boleh dilihat orang awam. Itu OK: URL Web App dan kunci Firebase web
   memang tidak rahsia. JANGAN letak kata laluan, token GitHub atau apa-apa
   rahsia di sini.
   ============================================================================= */
window.KARADI_CONFIG = {

  // 1) URL Web App Apps Script — dapat selepas Deploy. Berakhir dengan /exec
  //    Biarkan "URL_APPSCRIPT_ANDA_DI_SINI" kalau belum deploy.
  APPS_SCRIPT_URL: "URL_APPSCRIPT_ANDA_DI_SINI",

  // 2) Firebase (akaun rakyat). Firebase console > Project settings > General >
  //    Your apps > Web app > "firebaseConfig". Lihat docs/02-FIREBASE.md
  FIREBASE: {
    apiKey:            "__FIREBASE_API_KEY__",
    authDomain:        "__FIREBASE_PROJECT_ID__.firebaseapp.com",
    projectId:         "__FIREBASE_PROJECT_ID__",
    storageBucket:     "__FIREBASE_PROJECT_ID__.firebasestorage.app",
    messagingSenderId: "__FIREBASE_SENDER_ID__",
    appId:             "__FIREBASE_APP_ID__"
  },

  // 3) Jenama & maklumat hubungan (keluar di header, footer, dasar privasi, PDF admin)
  BRAND: {
    name:         "__APP_NAME__",        // Cth: KARA-Di
    tagline:      "__TAGLINE__",         // Cth: Karambunai Digital Interaction
    orgName:      "__ORG_NAME__",        // Cth: Pusat Khidmat Rakyat Karambunai
    orgShort:     "__ORG_SHORT__",       // Cth: Karambunai  (dalam mesej "team ... telah menerima")
    officeLabel:  "__OFFICE_LABEL__",    // Cth: Pejabat ADUN Karambunai  (kad lokasi di halaman utama)
    logo:         "assets/logo.svg",     // Letak logo klien di assets/ dan tukar nama fail di sini
    email:        "__CONTACT_EMAIL__",   // Emel awam untuk orang ramai (BOLEH berbeza dari emel admin)
    whatsapp:     "__WHATSAPP__",        // Digit sahaja + kod negara. Cth: 60123456789
    phoneDisplay: "__PHONE_DISPLAY__",   // Cara nombor dipaparkan. Cth: 012-345 6789
    year:         new Date().getFullYear()
  }
};
