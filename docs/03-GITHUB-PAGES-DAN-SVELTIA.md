# 03 — GitHub Pages + Sveltia CMS (±20 minit)

Hasil akhir: laman web hidup di `https://<owner>.github.io/<repo>/`, dan staf boleh ubah slide, pengumuman,
waktu operasi, info kerajaan, **tutup/buka borang** dan **maintenance** di `…/cms/` — tanpa sentuh kod.

## Bagaimana ia berfungsi

```
Staf edit di /cms/ ──▶ Sveltia buat commit ke repo GitHub (content/site.json, assets/uploads/…)
                       ──▶ GitHub Pages deploy (±1–2 min)
                       ──▶ portal ambil content/site.json (setiap 60 saat atau bila refresh)
                       ──▶ Apps Script turut baca fail yang sama untuk menolak hantaran jika borang ditutup
```

> **Fakta penting:** repo ini **awam** (Pages percuma memerlukan repo awam) dan mengandungi hanya HTML, `config.js`
> (URL Apps Script + kunci Firebase web — memang tidak rahsia) dan kandungan awam. **Tiada data peribadi
> dalam repo.** Jangan commit sebarang fail data, eksport Sheet atau token.

## A. Cipta repo dan muat naik laman

1. GitHub (akaun klien atau akaun anda) → **New repository** → nama = **slug** klien (cth `abc-klien`) → **Public** → *tanpa* README/.gitignore → **Create**.
2. Muat naik **isi** folder `clients/<slug>/site/` (bukan folder `site` itu sendiri) ke **akar** repo.

   **Dari terminal** (disyorkan — memastikan fail tersembunyi seperti `.nojekyll` ikut):
   ```bash
   cd clients/<slug>/site
   git init -b main
   git add .
   git commit -m "Tapak awal"
   git remote add origin https://github.com/<owner>/<slug>.git
   git push -u origin main
   ```
   **Dari web:** repo → *Add file → Upload files* → seret semua fail & folder dalam `site/` → *Commit changes*.

3. Pastikan di akar repo ada: `index.html`, `config.js`, `admin/`, `cms/`, `content/`, `assets/`.

## B. Hidupkan GitHub Pages

1. Repo → **Settings → Pages**.
2. *Build and deployment → Source*: **Deploy from a branch** → Branch **`main`**, folder **`/ (root)`** → **Save**.
3. Tunggu 1–2 minit → URL muncul: `https://<owner>.github.io/<slug>/`. Buka — portal sepatutnya keluar.
4. **Domain sendiri (pilihan):** Pages → *Custom domain* → ikut arahan GitHub (rekod DNS `CNAME`). Tambah domain itu juga ke Firebase *Authorized domains* (`02`, langkah 3).

## C. Hubungkan semula ke bahagian lain

- `Setup.gs` → `CLIENT.SITE_URL` = URL laman (berakhir `/`). Kemudian **Deploy → Manage deployments → Edit → New version** (`01`).
  Ini membolehkan server menolak hantaran bila borang ditutup di CMS. Tanpa ini, penutupan hanya berkuat kuasa di browser.
- Firebase → *Authorized domains*: tambah `<owner>.github.io` (`02`, langkah 3).
- Firebase → sekatan API key: `https://<owner>.github.io/*` (`02`, langkah 7).

## D. Sveltia CMS

CMS terletak di **`https://<laman>/cms/`**. Fail `cms/config.yml` menentukan repo dan medan yang boleh diedit.
Pastikan baris ini betul (diisi `new-client.sh` jika anda beri `GITHUB_OWNER`):

```yaml
backend:
  name: github
  repo: <owner>/<slug>
  branch: main
```

### Cara log masuk

> **Peringatan jujur:** dokumentasi rasmi Sveltia tak dapat dicapai semasa template ini dibina, jadi pilihan log masuk di bawah
> ditulis daripada pengetahuan umum tentang CMS ini. Sahkan di dokumentasi rasmi semasa ujian pertama.

**Pilihan 1 — Personal Access Token (paling mudah, tiada server tambahan).** Untuk setiap staf yang mengedit:
1. Staf ada **akaun GitHub** dan dijemput ke repo: repo → *Settings → Collaborators → Add people* → peranan **Write**.
2. Staf: GitHub → foto profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - *Resource owner*: pemilik repo
   - *Expiration*: cth 90 hari (hadkan risiko)
   - *Repository access*: **Only select repositories** → pilih repo ini sahaja
   - *Permissions → Repository permissions*: **Contents: Read and write** (Metadata: Read-only automatik)
3. **Generate token** → salin (hanya dipaparkan sekali).
4. Buka `/cms/` → pilih log masuk dengan **token** (Sign in with token / Personal Access Token) → tampal.
   Token disimpan dalam pelayar itu sahaja.

**Pilihan 2 — "Sign in with GitHub" (OAuth).** Perlu penghantar OAuth kecil. Pembangun Sveltia sediakan `sveltia-cms-auth`
untuk **Cloudflare Workers** (percuma). Garis kasar — ikut README projek itu untuk langkah terkini:
1. GitHub → *Settings → Developer settings → OAuth Apps → New OAuth App*: *Homepage URL* = URL laman; *Authorization callback URL* = `https://<nama-worker>.<akaun>.workers.dev/callback`.
2. Deploy worker `sveltia-cms-auth` dengan pembolehubah `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ALLOWED_DOMAINS` (domain laman).
3. Dalam `cms/config.yml` buang `#` pada `base_url:` dan isi URL worker itu.

### Cara guna

1. Buka `/cms/` → log masuk → **Laman Web → Kandungan & Tetapan Laman**.
2. Ubah medan → **Save**. Sveltia membuat commit terus ke `main`.
3. Tunggu Pages deploy (repo → tab **Actions** → *pages build and deployment* hijau, ±1–2 min).
4. Portal yang sedang dibuka mengambil perubahan dalam ≤60 saat; yang baru dibuka terus nampak.

| Medan dalam CMS | Kesan |
|---|---|
| **Mod Penyelenggaraan** | HIDUP → butang "Masuk Sistem" di halaman utama dikunci + server menolak semua hantaran borang. |
| **Status Borang** (6 suis) | MATI → kad kategori jadi "DITUTUP" + server menolak hantaran kategori itu. |
| **Maklumat Pejabat** | Waktu operasi, nama lokasi, pautan Google Maps (kad di halaman utama). |
| **Galeri Utama** | Slide halaman utama. Muat naik gambar landskap (cadangan ~1200×500, <500 KB). Sekurang-kurangnya satu. |
| **Pengumuman** | Teks bergerak (ticker). Kosongkan senarai → paparan "Sistem Beroperasi Seperti Biasa." |
| **Info Kerajaan & Bantuan** | Kad biasiswa/bantuan: tajuk, gambar (pilihan), penerangan (pautan `https://…` jadi boleh klik). |

Gambar yang dimuat naik disimpan di `assets/uploads/` dalam repo (sebahagian commit).

### Kunci versi Sveltia (disyorkan selepas ujian pertama berjaya)

`cms/index.html` memuat `@sveltia/cms` tanpa versi (sentiasa terkini). Selepas anda sahkan ia berfungsi, kunci versi supaya
kemas kini mengejut tidak mengubah tingkah laku: tukar kepada `https://unpkg.com/@sveltia/cms@<versi>/dist/sveltia-cms.js`
(lihat versi di npmjs.com/package/@sveltia/cms).

## E. Ujian penerimaan bahagian ini

- [ ] `https://<laman>/` terbuka; header ada nama & logo klien; footer betul; pautan emel/WhatsApp/telefon betul.
- [ ] `https://<laman>/admin/` terbuka; log masuk dengan `ADMIN_EMAIL` + kata laluan dari `01`.
- [ ] `/cms/` terbuka; log masuk; tukar satu pengumuman → Save → ≤3 minit pengumuman baharu keluar di portal.
- [ ] Matikan satu kategori di CMS → kad "DITUTUP" → cuba hantar kategori itu (guna borang lama yang dibuka sebelum ini atau terus ke API) → ditolak.
- [ ] Hidupkan semula kategori itu.

## Selesai masalah

| Gejala | Punca | Penyelesaian |
|---|---|---|
| Laman 404 | Pages belum hidup, atau fail tak di akar repo | Langkah B; semak `index.html` di akar. |
| Perubahan CMS tak keluar | Pages belum siap deploy; cache pelayar | Tab *Actions*; hard refresh (Ctrl+Shift+R). |
| `/cms/` skrin kosong / "Failed to load config" | `config.yml` salah YAML/`repo` salah, atau skrip Sveltia disekat | Buka konsol pelayar; semak `repo:` (`owner/repo`) dan lekukan YAML. |
| CMS: 401/403 / tak boleh simpan | Token luput / tiada kebenaran Contents: Write / bukan collaborator | Jana token baharu; semak peranan collaborator. |
| Gambar tak keluar di portal | Laluan salah atau fail belum dideploy | Semak `assets/uploads/` dalam repo; tunggu Pages. |
| Borang ditolak "ditutup" padahal sudah dibuka di CMS | Server cache status 60 saat; atau Pages belum deploy | Tunggu ±1–3 minit. |
| Server tak menolak walaupun borang ditutup | `CLIENT.SITE_URL` kosong/salah, atau Apps Script belum di-redeploy | Langkah C; ⚙️ → Semak Status Sistem (baris *LAMAN WEB*). |

## Kelewatan (latency) — keputusan reka bentuk

Menutup borang atau menghidupkan maintenance kini mengambil **±1–3 minit**, bukan serta-merta seperti suis dalam Sheet dahulu.
Untuk insiden mendesak (cth borang diserang spam), langkah paling pantas ialah **matikan kategori di CMS** *dan* kalau perlu
**Deploy → Manage deployments → Archive** deployment Apps Script buat sementara.
