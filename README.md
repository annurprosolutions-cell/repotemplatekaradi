# Template Sistem Aduan Rakyat (berasaskan KARA-Di v5.2)

Satu folder untuk bina sistem aduan / permohonan / temujanji yang sama bagi **klien berbeza**,
setiap satu dengan emel, Google Sheet, Drive, Firebase dan laman web sendiri.

- **Kandungan laman** (slide, pengumuman, waktu operasi, info kerajaan, suis tutup/buka borang, maintenance) → diurus melalui **Sveltia CMS** (fail dalam repo GitHub).
- **Jenama, logo, warna, teks, hubungan & media sosial, dasar privasi (BM/EN), artikel SEO** → juga dalam CMS; medan kosong = nilai asal. Lihat `docs/05`.
- **Borang, data, PDF, status, dashboard admin** → kekal di **Google Apps Script + Sheet + Drive** (pilihan A yang dipersetujui).
- **Akaun rakyat** (daftar / log masuk / profil) → **Firebase**.

## Seni bina

```
 Rakyat ──▶ site/index.html (Cloudflare Pages) ┬──▶ content/site.json ◀─── Sveltia CMS (/cms/) ◀─── Staf klien (akaun GitHub)
                                             ├──▶ Firebase Auth + Firestore   (akaun rakyat sahaja)
                                             └──▶ Apps Script Web App ───┬──▶ Google Sheet  (6 tab kategori)
 Admin ───▶ site/admin/index.html ───────────────────────────────────────┤──▶ Google Drive  (3 folder: PDF serahan,
                                                                          │                  fail mentah, laporan penyelesaian)
                                                                          └──▶ Gmail         (kod reset kata laluan admin)
```

| Perkara | Disimpan di | Siapa ubah |
|---|---|---|
| Slide, pengumuman, info pejabat, info kerajaan | `content/site.json` (repo GitHub) | Staf → Sveltia CMS `/cms/` |
| Tutup/buka borang, maintenance | `content/site.json` | Staf → Sveltia CMS |
| Nama, logo, warna, teks halaman, hubungan, privasi, SEO | `content/site.json` (kosong = `config.js`/teks asal) | Staf → Sveltia CMS |
| Artikel | `content/artikel/*.md` → halaman statik oleh GitHub Actions | Staf → Sveltia CMS |
| Aduan, permohonan, dll. | Google Sheet (6 tab) | Rakyat hantar; admin urus melalui `/admin/` |
| PDF serahan, fail muat naik, laporan penyelesaian | Google Drive | Sistem jana automatik |
| Kata laluan admin, sesi | Script Properties (hash + salt) | Menu ⚙️ dalam Google Sheet |
| Akaun rakyat + profil | Firebase Auth + Firestore | Rakyat sendiri |
| Nilai asal nama/logo/hubungan, URL Apps Script, Firebase | `site/config.js` | Anda (pembangun) |
| Emel admin, nama organisasi, URL laman | blok `CLIENT` dalam `appscript/Setup.gs` | Anda (pembangun) |

## Mula pantas — klien baharu

```bash
./new-client.sh          # jawab beberapa soalan → jana clients/<slug>/ (Mac / Linux / Git Bash / WSL)
```

Kemudian ikut `clients/<slug>/CHECKLIST.md`, dalam urutan ini:

0. **`docs/00-MAKLUMAT-KLIEN.md`** — apa yang perlu diminta daripada klien *sebelum* mula (akaun, jenama, staf, PDPA).
1. **`docs/01-APPS-SCRIPT.md`** — Sheet baharu → tampal kod → menu **🚀 Setup Pertama Kali** (cipta tab, folder Drive, kata laluan admin dalam satu klik) → Deploy → dapat URL `/exec`.
2. **`docs/02-FIREBASE.md`** — projek Firebase baharu → dapat `firebaseConfig`.
3. Edit **`site/config.js`** — tampal URL `/exec` + `firebaseConfig`, letak logo klien.
4. **`docs/03-CLOUDFLARE-DAN-SVELTIA.md`** — push `site/` ke repo GitHub klien → Cloudflare Pages (`pages.dev` → subdomain → domain utama) → Worker log masuk → `/cms/`.
5. **`docs/04-ONBOARD-DAN-SERAHAN.md`** — ujian penerimaan, PDPA, penyelenggaraan, senarai serahan.
6. **`docs/05-CMS-PENUH-DAN-SEO.md`** — (pilihan, disyorkan) aktifkan build GitHub Actions untuk artikel, sitemap, SEO & ikon PWA; senarai medan CMS jenama/warna/teks.

Anggaran masa (agakan aku, bukan diukur): klien pertama ~1–1.5 jam termasuk belajar; klien seterusnya ~40 minit.
Tanpa Mac/Linux: salin folder `site/`, `appscript/`, `firebase/`, `docs/` secara manual dan ganti setiap
`__TOKEN__` (cari `__` dalam `site/config.js`, `site/content/site.json`, `site/cms/config.yml`, `appscript/Setup.gs`);
tukar warna `#1A4A9A` dalam `site/index.html` dan `site/admin/index.html` kalau mahu warna lain.

## Struktur folder

```
karadi-template/
├── README.md                 ← fail ini
├── new-client.sh             ← penjana folder klien
├── site/                     ← ISI folder ini = akar repo GitHub klien (dihoskan di Cloudflare Pages)
│   ├── index.html            ← portal rakyat
│   ├── admin/index.html      ← dashboard admin
│   ├── cms/                  ← Sveltia CMS (index.html + config.yml)
│   ├── content/site.json     ← kandungan yang diurus CMS
│   ├── _headers              ← header keselamatan (Cloudflare Pages / Netlify)
│   ├── config.js             ← ★ SATU fail konfigurasi klien untuk laman web
│   └── assets/               ← logo, brand.js, imej lalai, uploads/ (gambar dari CMS)
├── appscript/
│   ├── Setup.gs              ← ★ blok CLIENT + setup pertama kali + menu
│   ├── Code.gs               ← logik Web App
│   └── appsscript.json       ← manifest (zon masa, kebenaran, deploy)
├── firebase/firestore.rules
├── docs/                     ← panduan 00–04
├── dev/                      ← ujian automatik (pilihan, untuk pembangun)
└── clients/                  ← dijana oleh new-client.sh (diabaikan git — ada emel klien)
```

## Apa yang berubah berbanding KARA-Di v5.2

**Seni bina**
- Konfigurasi laman keluar dari Apps Script/Sheet ("Tetapan", `update_config`, panel admin di dalam `index.html`) → **Sveltia CMS + `content/site.json`**. Panel admin tersembunyi di portal awam **dibuang** (admin hanya di `/admin/`).
- Tiada ID Sheet / Folder / GID / emel / URL hardcoded. `setupSystem()` cipta semuanya dan simpan ID dalam Script Properties. Tab dicari ikut **nama kategori**, bukan GID — salin Sheet tak memecahkan apa-apa.
- Semua jenama (nama, logo, hubungan, organisasi, warna) dari `config.js` / blok `CLIENT`.
- Dashboard admin **tidak lagi guna Firebase** (kata laluan admin tidak lagi dihantar ke Firebase; tiada bacaan Firestore). No. KP disimpan dalam lajur Sheet sejak hari pertama.

**Keselamatan & ketepatan data** (hasil review kod asal)
- `check_status` / `get_history` tak lagi pulangkan baris mentah: **No. KP & UID tak pernah keluar**; carian awam turut menyorok alamat, emel, pautan lampiran dan **mask** nama & telefon.
- **No. rujukan unik** (dulu 4 digit IC + tarikh bertindih jika orang sama hantar dua kali sehari, lalu satu rekod tak boleh dikemas kini).
- Data pengguna ditulis sebagai **teks** (format sel `@`): tiada formula injection (`=IMPORTXML(...)`), sifar depan (`0123…`) tak hilang.
- Semua input di-escape dalam PDF (termasuk laporan tindakan — dulu tidak).
- Jenis fail muat naik disekat (gambar, PDF, Word, Excel, teks); had panjang medan; had cubaan log masuk hanya mengira percubaan **gagal** (dulu setiap cubaan, sehingga log masuk betul pun menghabiskan kuota).
- Kod reset 6-digit **tidak lagi dalam subjek emel**.
- Penulisan data diserialkan dengan `LockService`; kalau lock tak diperoleh, permintaan ditolak (dulu diteruskan tanpa lock).
- Server turut menguatkuasakan suis tutup-borang/maintenance dari `content/site.json` (fail-open jika fail tak boleh dibaca).
- Imej fallback tempatan (`assets/no-image.svg`) — kod asal boleh berpusing tanpa henti jika `placehold.co` tak dapat dicapai.

## Ujian yang telah dijalankan — dan yang belum

| Ujian | Hasil | Skop sebenar |
|---|---|---|
| `node dev/appscript-mock-test.js` | 38 lulus | Logik `Code.gs`/`Setup.gs` terhadap **mock** Sheets/Drive/Properties. Model auto-parse sel (nombor/formula) adalah andaian aku tentang Google Sheets. |
| `node dev/e2e-browser-test.js` | 19 lulus | Portal + admin dalam Chromium sebenar ↔ mock backend; diuji juga pada folder yang dijana `new-client.sh`. CDN (Tailwind, Font Awesome, Firebase SDK) disekat dalam sandbox, jadi **gaya visual & Firebase tidak diuji**. |
| Mutation test pada ujian mock | 3 mutasi ditangkap | Sahkan ujian betul-betul gagal bila fix dibuang. |
| `node dev/cms-features-test.js` | 38 + 17 lulus + semakan build | Tetapan CMS (warna, teks BM/EN, hubungan, privasi, logo) pada portal & admin, dan skrip build artikel/SEO/ikon (idempoten, XSS, gagal-selamat). Tailwind CDN diganti CSS yang dibina dengan konfigurasi sama. Lihat `docs/05`. |
| `node dev/cms-load-test.js` | skrin log masuk dipaparkan | Sveltia **0.248.1 sebenar** (dari npm) memuat `cms/config.yml` template dan papar "Sign In with GitHub" + "Sign In Using Access Token". `config.yml` turut sah terhadap skema rasmi dalam pakej. Tidak termasuk log masuk sebenar atau suntingan. |

**Belum diuji (perlu anda sahkan pada klien pertama):** Apps Script sebenar (kebenaran, menu, PDF converter, kuota), tingkah laku format sel `@` dalam Google Sheets sebenar, aliran Firebase (daftar/log masuk/reset) dan `firestore.rules`, **Cloudflare Pages** (tetapan build, custom domain, `_headers`), **GitHub Actions sebenar** (workflow build), **Worker `sveltia-cms-auth`** dan log masuk/suntingan CMS sebenar ke GitHub, rupa visual di telefon.

## Had & keputusan reka bentuk yang perlu anda tahu

- **Tutup borang/maintenance tak serta-merta.** Ia commit ke GitHub → Cloudflare Pages build/deploy (~1–2 minit, belum diukur) → portal ambil dalam ≤60 saat. Untuk kecemasan ini lebih perlahan berbanding suis dalam Sheet dulu.
- **Staf CMS perlu akaun GitHub** dan dijemput sebagai collaborator. Dengan Worker `sveltia-cms-auth` (satu per klien, dalam akaun Cloudflare klien) staf cuma klik "Sign In with GitHub"; tanpa Worker mereka perlu urus token sendiri.
- **Setiap simpanan CMS = 1 build Cloudflare** (pelan percuma ~500 build/bulan menurut perbandingan pihak ketiga). Galakkan staf mengumpul suntingan.
- **Fail muat naik & PDF serahan dikongsi "sesiapa dengan pautan"** (sama seperti asal). Pautan sukar diteka tetapi sesiapa yang memegangnya boleh buka — dan PDF mengandungi alamat/telefon. Lihat `docs/04` untuk pilihan.
- **Format no. rujukan** masih 4 digit akhir IC + tarikh (+ `-2` jika bertindih). Dengan data awam sudah di-mask, risiko turun, tetapi ia masih boleh diteka. Tambah akhiran rawak kalau klien mahu lebih ketat (ubah `generateRefNo_`).
- **Had percubaan (check status, lupa kata laluan, log masuk) adalah global**, bukan per-IP (Apps Script tiada IP). Penyerang boleh menyekat sementara; admin sentiasa boleh set semula kata laluan melalui menu Sheet.
- **Satu admin sahaja** (satu emel + satu kata laluan) — sama seperti asal.
- **Tailwind guna CDN "play"** (sama seperti asal). Berfungsi tetapi bukan cara dicadangkan Tailwind untuk produksi; boleh dikompil kemudian.
- Header keselamatan asas disediakan melalui `site/_headers`, tetapi **tiada CSP** (portal guna Tailwind CDN, Firebase SDK dan skrip inline; CSP ketat akan memecahkannya).

## Ujian & penyelenggaraan template

```bash
node dev/appscript-mock-test.js            # tiada kebergantungan
npm i playwright && npx playwright install chromium
node dev/e2e-browser-test.js               # atau: SITE_SRC=clients/abc/site node dev/e2e-browser-test.js
```

Ubah `appscript/*.gs` atau `site/*.html` → jalankan kedua-dua ujian dulu → baru salin ke klien.
Perbaikan template (bukan khusus klien) dibuat di sini, bukan dalam folder `clients/`.
