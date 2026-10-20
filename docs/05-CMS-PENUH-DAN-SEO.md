# 05 — CMS penuh (jenama, warna, teks, hubungan) + Artikel & SEO

Dua lapisan, boleh dipasang berasingan:

| Lapisan | Apa | Perlu apa |
|---|---|---|
| **A. Tetapan masa-jalan** | Nama, tagline, logo, 1–3 warna, teks hero & kad halaman utama, footer, Hubungi Kami + media sosial, dasar privasi (BM/EN) | Tiada. Terus berfungsi selepas fail dikemas kini |
| **B. Build GitHub Actions** | Halaman artikel statik, sitemap.xml, robots.txt, tag SEO/OpenGraph/JSON-LD, favicon & ikon PWA dari logo | Workflow `.github/workflows/build.yml` + kebenaran tulis Actions |

Cloudflare **tidak berubah**: Build command kosong/None, deploy seperti biasa, root `/`.

## Peraturan "kosong"

Untuk setiap medan dalam CMS:

1. CMS diisi → nilai CMS dipakai.
2. CMS kosong → nilai asal (`config.js` untuk jenama/hubungan; teks asal dalam `index.html` untuk teks).
3. Kedua-dua kosong → elemen itu **disembunyikan** (cth. kad WhatsApp, ikon TikTok, kad alamat).

Teks EN kosong → teks Inggeris asal (bukan BM). Pengecualian: medan yang tiada teks Inggeris asal (cth. nota footer)
→ guna versi BM. Teks boleh guna `{{name}}` (nama sistem) dan `{{office}}` (label pejabat).

> Akibat peraturan 2: kalau emel/WhatsApp ada dalam `config.js`, mengosongkan medan CMS **tidak** menyembunyikannya.
> Untuk sembunyikan, kosongkan juga dalam `config.js`.

## A. Bagaimana ia berfungsi

- `assets/brand.js` membaca `content/site.json` (salinan terakhir disimpan dalam `localStorage` supaya warna/logo tak berkelip),
  gabungkan dengan `config.js`, dan isi elemen bertanda `data-brand`, `data-brand-show`, `data-social`.
- **Warna**: Tailwind dikonfigurasi dengan CSS variable (`--brand-rgb`, `--b50`…`--b900`, `--accent-rgb`) yang
  ada nilai asal. Kalau CMS tiada warna, rupa **sama seperti sebelum ini**. Warna Utama sahaja sudah cukup — skala
  biru (50–900) dan warna gelap dijana daripadanya. Warna Aksen hanya mengubah lencana hero & ikon pengumuman; teks atasnya
  automatik hitam/putih ikut kecerahan.
- Portal juga memuat semula `site.json` setiap 60 saat dan menerap semula semuanya.
- Dashboard admin turut ikut warna (butang, carta, PDF).

## B. Build GitHub Actions

`site/.github/workflows/build.yml` berjalan bila `content/**`, `assets/uploads/**`, `config.js` atau `index.html` berubah:

1. `npm install` `marked` + `yaml` (wajib) dan `sharp` (pilihan).
2. `node .github/karadi-build/build.mjs` — membaca **semua** input dahulu; kalau ada ralat (cth. `site.json` rosak),
   ia berhenti **sebelum menulis apa-apa**, job jadi merah, laman sedia ada tidak terjejas.
3. Commit balik hanya: `index.html` (antara penanda `SEO` dan `ARTIKEL` sahaja), `manifest.webmanifest`, `robots.txt`,
   `sitemap.xml`, `artikel/`, `assets/icons/`.
4. Commit itu mencetuskan deploy Cloudflare seperti biasa (jadi satu simpanan CMS = 2 deploy; tiada masalah dalam had percuma).

Tanpa `sharp`: ikon PNG dilangkau; logo asal dipakai sebagai favicon dan ikon manifest.

| Fail dijana | Isi |
|---|---|
| `artikel/<slug>/index.html` | Halaman statik: `<title>`, meta description, canonical, OpenGraph, JSON-LD `Article` |
| `artikel/index.html` | Senarai semua artikel |
| `index.html` (penanda) | Tajuk, meta description, OG, JSON-LD `WebSite`+`Organization`, ikon, manifest; 3 artikel terkini di halaman utama |
| `sitemap.xml` | Hanya jika **SEO → Alamat Laman** diisi (sitemap perlukan URL penuh) |
| `robots.txt` | Sekat `/admin/` dan `/cms/`; rujuk sitemap |
| `assets/icons/*` | favicon 32/48, ikon 192/512, maskable 512, apple-touch-icon 180 |

Artikel: `content/artikel/<slug>.md` (frontmatter `title`, `date`, `cover`, `description`, `draft` + isi markdown).
Slug dijana dari tajuk semasa artikel dicipta. Draf tidak diterbitkan. HTML mentah dalam isi dipaparkan sebagai teks dan
pautan `javascript:` dibuang.

### Pasang pada repo klien (sekali)

1. Pastikan fail berikut ada dalam repo (folder bertitik — di Mac tekan **Cmd + Shift + .** dalam Finder untuk nampak):
   `.github/workflows/build.yml`, `.github/karadi-build/build.mjs`, `.github/karadi-build/.gitignore`, `.assetsignore`.
   Kalau drag-and-drop tak bawa folder bertitik: GitHub → **Add file → Create new file** → taip nama penuh
   (cth. `.github/workflows/build.yml`) → tampal isi.
2. Repo → **Settings → Actions → General → Workflow permissions → Read and write permissions → Save**.
3. Repo → tab **Actions** → *Bina laman (SEO & artikel)* → **Run workflow** (sekali untuk mula). Hijau = berjaya.
4. CMS → **SEO & Perkongsian → Alamat Laman** = URL laman (cth. `https://aduan.klien.my`). Simpan.

### Kos

- Repo **public**: GitHub Actions percuma tanpa had untuk runner standard.
- Repo **private** (pelan Free): 2,000 minit/bulan. Satu build ≈ 30–60 saat → ±2,000 simpanan CMS sebulan.
  Kalau habis, job berhenti; **tiada caj** melainkan akaun ada kaedah bayaran dan bajet melebihi $0
  (*Settings → Billing → Budgets*: pastikan Actions = $0 / "Stop usage").
- Cloudflare Workers Builds: 3,000 minit/bulan percuma (tiada perubahan — build command tetap kosong).

## Ujian

`node dev/cms-features-test.js` — memasang Tailwind CLI v3, marked, yaml, sharp dalam folder sementara, kemudian:

- Portal dengan `site.json` kosong: warna/teks **sama seperti asal**.
- Portal dengan nilai CMS: warna header/lencana, teks BM/EN, logo, favicon, theme-color, kad hubungan/alamat/sosial
  muncul & sembunyi, URL sosial tidak sah disembunyikan, privasi CMS selamat XSS, admin ikut warna.
- Build: 2 artikel + 1 draf → halaman dijana, idempoten (build kedua 0 perubahan), XSS dineutralkan,
  `site.json` rosak → gagal tanpa menulis.
- Pelayar: halaman artikel (canonical, OG, JSON-LD, gambar, logo), senarai, seksyen artikel di halaman utama,
  favicon & ikon manifest wujud, tiada 404/ralat JS.

Tidak diuji di sini: GitHub Actions sebenar (runner GitHub), deploy Cloudflare sebenar, Tailwind CDN sebenar
(diganti CSS yang dibina dengan konfigurasi yang sama).

## Naik taraf klien sedia ada

Ganti fail kod sahaja — **jangan timpa** `config.js` dan `content/site.json` (ada kandungan hidup).
Medan baru yang tiada dalam `site.json` dianggap kosong, jadi laman kekal sama sehingga staf mengisinya di CMS.
Fail yang diganti: `index.html`, `admin/index.html`, `assets/brand.js`, `cms/config.yml` (kekalkan `repo:` dan `base_url:` klien),
serta fail `.github/…` dan `.assetsignore` untuk lapisan B.
