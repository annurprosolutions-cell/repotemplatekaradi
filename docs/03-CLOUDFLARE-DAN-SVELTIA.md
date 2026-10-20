# 03 — GitHub + Cloudflare Pages + Sveltia CMS (±45 minit kali pertama)

Hasil akhir: laman hidup di alamat klien, staf boleh ubah slide, pengumuman, waktu operasi, info kerajaan,
**tutup/buka borang** dan **maintenance** di `…/cms/` tanpa sentuh kod.

## Keputusan reka bentuk

- **Setiap klien pegang akaun sendiri**: Google (Sheet/Drive/Apps Script/Firebase), GitHub (repo), Cloudflare (hosting + Worker). Pembangun dijemput sebagai collaborator/member.
- **Peralihan alamat**: `nama-projek.pages.dev` (uji) → **subdomain klien** (`aduan.klien.my`) → **domain utama** bila klien berpuas hati. Bahagian D dan G ialah senarai semak untuk setiap peralihan.
- **Log masuk CMS**: Worker `sveltia-cms-auth` dalam akaun Cloudflare klien (staf tak perlu urus token). Token peribadi (PAT) kekal sebagai kaedah ujian/pembangun.

## Bagaimana ia berfungsi

```
Staf edit di /cms/ ──▶ Sveltia commit ke repo GitHub (content/site.json, assets/uploads/…)
                       ──▶ Cloudflare Pages build & deploy (biasanya ±1–2 min; belum diukur)
                       ──▶ portal ambil content/site.json (setiap 60 saat atau bila refresh)
                       ──▶ Apps Script baca fail yang sama (CLIENT.SITE_URL) untuk menolak hantaran jika borang ditutup
```

Repo boleh **private**. Ia hanya mengandungi HTML, `config.js` (URL Apps Script + kunci Firebase web — memang tidak rahsia) dan
kandungan awam. **Tiada data peribadi dalam repo.** Jangan commit eksport Sheet, token atau kata laluan.

## A. Repo GitHub

1. Akaun GitHub **klien** → **New repository** → nama = slug klien → **Private** → tanpa README → **Create**.
   Jemput pembangun: *Settings → Collaborators → Add people* (Admin).
2. Muat naik **isi** `clients/<slug>/site/` (bukan folder `site` itu) ke akar repo:
   ```bash
   cd clients/<slug>/site
   git init -b main
   git add .
   git commit -m "Tapak awal"
   git remote add origin https://github.com/<owner>/<slug>.git
   git push -u origin main
   ```
3. Di akar repo mesti ada: `index.html`, `config.js`, `_headers`, `admin/`, `cms/`, `content/`, `assets/`.

## B. Cloudflare Pages (akaun Cloudflare klien)

> Cloudflare sedang menyatukan Pages dengan Workers, jadi nama menu/butang mungkin berbeza sedikit. Langkah di bawah
> ditulis daripada ingatan — ikut paparan semasa, dan kenal pasti tiga tetapan penting: **sambung ke Git**, **tiada build command**, **output = akar**.

1. dash.cloudflare.com → **Workers & Pages → Create → Pages → Import an existing Git repository** → benarkan Cloudflare App di GitHub (pilih **repo ini sahaja**) → pilih repo → **Begin setup**.
2. *Project name*: cth `abc-klien` (jadi `abc-klien.pages.dev`). *Production branch*: `main`.
3. *Framework preset*: **None**. *Build command*: **kosong**. *Build output directory*: **`/`**.
4. **Save and Deploy**. Tunggu → buka `https://abc-klien.pages.dev/` — portal sepatutnya keluar.
5. Kemas kini terus (supaya ujian berfungsi):
   - `Setup.gs` → `CLIENT.SITE_URL = "https://abc-klien.pages.dev/"` → Apps Script **New version** (`01`).
   - Firebase → Authorized domains → tambah `abc-klien.pages.dev` (`02`, langkah 3).

> Had percuma (daripada perbandingan pihak ketiga; semak halaman harga Cloudflare): ~500 build sebulan. **Setiap simpanan di CMS = 1 build**,
> jadi galakkan staf mengumpul beberapa suntingan sebelum menyimpan.

Alternatif Netlify: sama konsepnya (sambung repo, publish directory `.`, tiada build command), tetapi pelan percumanya berasaskan kredit
dan boleh menghentikan site bila kredit habis. Tidak diuji dalam template ini.

## C. Subdomain klien

1. Pages project → **Custom domains → Set up a custom domain** → `aduan.klien.my`.
2. Kalau DNS klien di Cloudflare, rekod ditambah automatik. Kalau DNS di tempat lain (registrar), tambah di sana:
   `CNAME  aduan  →  abc-klien.pages.dev`.
3. Tunggu status *Active* dan SSL siap (minit hingga beberapa jam). Buka `https://aduan.klien.my/`.
4. Lakukan senarai semak **D** di bawah untuk alamat baharu ini.

## D. Bila alamat laman berubah — kemas kini 5 tempat

Lakukan setiap kali ada alamat baharu (pages.dev → subdomain → domain utama). **Tambah** alamat baharu, jangan buang yang lama sehingga peralihan selesai.

| # | Tempat | Apa |
|---|---|---|
| 1 | `Setup.gs` → `CLIENT.SITE_URL` | Alamat baharu (berakhir `/`) → Apps Script **New version**. Kalau terlepas: server tak nampak suis tutup-borang (borang terus diterima). |
| 2 | Firebase → Authentication → Authorized domains | Tambah nama hos baharu. Tanpa ini log masuk rakyat gagal (`auth/unauthorized-domain`). |
| 3 | Google Cloud → Credentials → Browser key → HTTP referrers | Tambah `https://<hos-baharu>/*`. |
| 4 | Worker `sveltia-cms-auth` → `ALLOWED_DOMAINS` | Tambah nama hos baharu (lihat E2). Tanpa ini log masuk CMS gagal. |
| 5 | Semak `/`, `/admin/`, `/cms/` | Portal, log masuk admin, dan CMS semuanya berfungsi di alamat baharu. |

Tidak perlu diubah: `site/config.js` (laluan relatif), `cms/config.yml` (`base_url` ialah alamat Worker, bukan laman), dan *callback URL* GitHub OAuth App (ia menuju ke Worker).

## E. Log masuk Sveltia CMS

CMS di **`/cms/`**. Versi Sveltia **dikunci** dalam `cms/index.html` (`@sveltia/cms@0.248.1`) — versi yang diuji dengan `config.yml` template ini.
Skrin log masuk ada dua butang: **Sign In with GitHub** (OAuth, perlu Worker) dan **Sign In Using Access Token** (PAT).

### E1. Ujian cepat — Access Token (pembangun)
1. Staf/pembangun ada akaun GitHub dan peranan **Write** pada repo (*Settings → Collaborators*).
2. GitHub → foto profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:
   *Resource owner* = pemilik repo; *Expiration* cth 90 hari; *Repository access* = **Only select repositories** → repo ini; *Repository permissions* → **Contents: Read and write**.
3. Salin token (dipaparkan sekali). Buka `/cms/` → **Sign In Using Access Token** → tampal. Token tersimpan dalam pelayar itu sahaja.

### E2. Untuk staf — Worker `sveltia-cms-auth` (akaun Cloudflare klien)
Tiada token untuk diurus; staf klik **Sign In with GitHub** sahaja. Ikut README projek `github.com/sveltia/sveltia-cms-auth` jika langkah berubah.

1. **Deploy Worker:** dalam akaun Cloudflare klien, klik butang *Deploy to Cloudflare Workers* di README itu (atau clone + `wrangler deploy`).
   Salin URL: `https://sveltia-cms-auth.<subdomain>.workers.dev`.
2. **Daftar GitHub OAuth App** (akaun GitHub pemilik repo): `github.com/settings/applications/new`
   - *Homepage URL*: alamat laman klien
   - *Authorization callback URL*: `<URL Worker>/callback`
   - **Register** → **Generate a new client secret** → catat *Client ID* dan *Client Secret*.
3. **Pembolehubah Worker** (Cloudflare → Worker → Settings → Variables):
   - `GITHUB_CLIENT_ID` = Client ID
   - `GITHUB_CLIENT_SECRET` = Client Secret (tekan **Encrypt**)
   - `ALLOWED_DOMAINS` = senarai nama hos dipisah koma, cth `aduan.klien.my, abc-klien.pages.dev`.
     Wildcard `*.klien.my` padan subdomain sahaja, **bukan** `klien.my`. Untuk kedua-duanya: `klien.my, *.klien.my`. Sangat disyorkan diisi.
   - Simpan dan deploy.
4. **`cms/config.yml`**: buang `#` pada `base_url:` dan isi URL Worker (atau beri `CMS_AUTH_URL` kepada `new-client.sh`):
   ```yaml
   backend:
     name: github
     repo: <owner>/<slug>
     branch: main
     base_url: https://sveltia-cms-auth.<subdomain>.workers.dev
   ```
   Commit → tunggu deploy.
5. Buka `/cms/` → **Sign In with GitHub** → benarkan. Kalau repo milik **organisasi** GitHub, pemilik organisasi mungkin perlu meluluskan OAuth App itu.
6. Staf mesti collaborator **Write** pada repo.

## F. Cara guna

1. `/cms/` → log masuk → **Laman Web → Kandungan & Tetapan Laman**.
2. Ubah medan → **Save**. Sveltia membuat commit terus ke `main`.
3. Tunggu Cloudflare deploy (Pages project → *Deployments* hijau).
4. Portal yang sedang dibuka mengambil perubahan dalam ≤60 saat; yang baru dibuka terus nampak.

| Medan dalam CMS | Kesan |
|---|---|
| **Mod Penyelenggaraan** | HIDUP → butang "Masuk Sistem" dikunci + server menolak semua hantaran borang. |
| **Status Borang** (6 suis) | MATI → kad kategori jadi "DITUTUP" + server menolak hantaran kategori itu. |
| **Maklumat Pejabat** | Waktu operasi, nama lokasi, pautan Google Maps. |
| **Galeri Utama** | Slide halaman utama. Gambar landskap (~1200×500, <500 KB). |
| **Pengumuman** | Teks bergerak. Kosongkan senarai → "Sistem Beroperasi Seperti Biasa." |
| **Info Kerajaan & Bantuan** | Kad biasiswa/bantuan: tajuk, gambar (pilihan), penerangan (pautan `https://…` boleh diklik). |

Gambar dimuat naik ke `assets/uploads/` dalam repo.

### Header keselamatan (`site/_headers`)
Cloudflare Pages membaca fail ini: `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` + `noindex` untuk `/admin/` dan `/cms/`, dan `no-cache` untuk `/content/*`.
**Tiada CSP** — portal guna Tailwind CDN, Firebase SDK dan skrip inline; CSP ketat akan memecahkannya.

## G. Bila klien berpuas hati — tukar ke domain utama

1. Pages project → **Custom domains** → tambah `klien.my` (atau `www.klien.my`). Domain "apex" (`klien.my` tanpa `www`) biasanya memerlukan DNS di Cloudflare; `www` boleh guna CNAME di mana-mana DNS *(dari ingatan — semak dokumentasi Cloudflare)*.
2. Ulang **senarai D** untuk domain utama (tambah, jangan ganti).
3. Pilih: biar subdomain lama hidup, atau tambah **redirect** (Cloudflare → Rules → Redirect Rules) dari subdomain ke domain utama.
4. Beritahu staf URL baharu `/admin/` dan `/cms/` (bookmark lama).
5. **Kesan kepada rakyat:** sesi log masuk Firebase disimpan per alamat, jadi rakyat perlu **log masuk semula** di alamat baharu. Akaun dan rekod aduan **tidak hilang**.
6. Selepas stabil beberapa minggu, buang alamat lama daripada senarai (Firebase, referrer, `ALLOWED_DOMAINS`).

## H. Ujian penerimaan bahagian ini

- [ ] `https://<alamat>/` terbuka; nama, logo, hubungan klien betul.
- [ ] `/admin/` terbuka; log masuk dengan `ADMIN_EMAIL` + kata laluan dari `01`.
- [ ] `/cms/` → **Sign In with GitHub** (atau token) berjaya.
- [ ] Tukar satu pengumuman → Save → ≤3 minit muncul di portal.
- [ ] Matikan satu kategori → kad "DITUTUP" → hantaran kategori itu ditolak oleh server (uji dengan borang yang dibuka sebelum penutupan). Hidupkan semula.
- [ ] Daftar akaun rakyat & log masuk di alamat ini (bukti Authorized domains betul).

## Selesai masalah

| Gejala | Punca | Penyelesaian |
|---|---|---|
| Pages: deploy gagal / laman kosong | Build command tak kosong, atau output bukan `/` | Semak tetapan build (bahagian B langkah 3). |
| 404 pada `/cms/` atau `/admin/` | Fail tak di akar repo | Semak struktur repo (bahagian A langkah 3). |
| Subdomain tak aktif | CNAME salah / belum merebak / SSL belum siap | Semak rekod DNS; tunggu; lihat status di *Custom domains*. |
| `/cms/` skrin kosong | Skrip Sveltia disekat atau `config.yml` salah YAML | Konsol pelayar; `repo:` mesti `owner/repo`. |
| **Sign In with GitHub** gagal / popup tertutup | `base_url` salah; domain tiada dalam `ALLOWED_DOMAINS`; callback URL OAuth App salah | Semak E2 langkah 2–4; lihat log Worker. |
| CMS: 401/403 / tak boleh simpan | Bukan collaborator Write / token luput / OAuth App belum diluluskan organisasi | Semak peranan; jana token baharu; luluskan OAuth App. |
| Perubahan CMS tak keluar | Deploy belum siap / cache | *Deployments* hijau; hard refresh. |
| Borang ditolak "ditutup" padahal sudah dibuka | Server simpan status 60 saat; atau deploy belum siap | Tunggu ±1–3 minit. |
| Server tak menolak walaupun borang ditutup | `CLIENT.SITE_URL` kosong/lama, atau Apps Script belum *New version* | Senarai D #1; ⚙️ → Semak Status Sistem (baris *LAMAN WEB*). |

## Kelewatan (latency) — keputusan reka bentuk

Menutup borang atau menghidupkan maintenance mengambil **±1–3 minit** (commit → build → portal ambil), bukan serta-merta.
Untuk insiden mendesak (cth borang diserang spam): matikan kategori di CMS, dan kalau perlu **Deploy → Manage deployments → Archive**
deployment Apps Script buat sementara.
