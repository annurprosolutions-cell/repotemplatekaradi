# 00 — Maklumat yang perlu diminta daripada klien

Kumpul semua ini **sebelum** jalankan `./new-client.sh`. Kalau ada yang belum pasti, tak apa —
kebanyakannya boleh diubah kemudian (lihat lajur "Boleh ubah kemudian di").

## A. Akaun (paling penting — tentukan siapa pegang apa)

| Perkara | Cadangan | Kenapa |
|---|---|---|
| **Akaun Google untuk sistem** | Akaun khas (cth `pusatkhidmat.abc@gmail.com`), 2FA dihidupkan, nombor telefon pemulihan milik klien | Sheet, Drive, Apps Script, Firebase semua dimiliki akaun ini. Kalau akaun itu hilang/digantung, sistem berhenti. |
| **Emel admin** (`ADMIN_EMAIL`) | Boleh akaun yang sama di atas, atau emel lain yang klien betul-betul baca | Untuk log masuk dashboard + terima kod reset kata laluan. |
| **Emel awam** (`BRAND.email`) | Emel yang orang ramai boleh hubungi | Dipaparkan di portal; **boleh** berbeza dari emel admin. |
| **Akaun GitHub** | Satu akaun/organisasi untuk repo laman; setiap staf yang edit CMS ada akaun sendiri | Sveltia CMS menulis ke repo GitHub. |
| **Siapa pembangun/pentadbir teknikal?** | Anda — dijemput sebagai Editor pada Sheet, Owner/Editor pada Firebase, Admin pada repo | Supaya klien boleh minta bantuan tanpa berkongsi kata laluan. |

## B. Jenama & kandungan

| Perkara | Contoh | Boleh ubah kemudian di |
|---|---|---|
| Nama sistem | `KARA-Di` | `site/config.js` → `BRAND.name` + `Setup.gs` → `CLIENT.APP_NAME` |
| Tagline | `Karambunai Digital Interaction` | `config.js` → `BRAND.tagline` |
| Nama organisasi penuh | `Pusat Khidmat Rakyat Karambunai` | `config.js` + `CLIENT.ORG_NAME` |
| Nama ringkas (mesej "team … telah menerima") | `Karambunai` | `config.js` → `BRAND.orgShort` |
| Label lokasi halaman utama | `Pejabat ADUN Karambunai` | `config.js` → `BRAND.officeLabel` |
| Logo (PNG/SVG, latar lutsinar, segi empat/bulat) | `logo.png` | letak di `site/assets/`, tukar `BRAND.logo` |
| Warna utama (hex) | `#1A4A9A` | cari-ganti dalam `index.html` & `admin/index.html` |
| WhatsApp / telefon | `60123456789` / `012-345 6789` | `config.js` |
| Waktu operasi, lokasi, pautan Google Maps | — | **CMS** |
| Slide utama (gambar landskap ~1200×500) | 1–5 gambar | **CMS** |
| Pengumuman pertama | — | **CMS** |

## C. Skop sistem

- Adakah **keenam-enam kategori** diperlukan? (Jemputan, Permohonan/Mohon Bantuan, Aduan, Temujanji, Maklum Balas, Sukarelawan). Yang tak diperlukan: tutup melalui CMS (`category_status`) — kad akan jadi "DITUTUP". Membuang terus kategori memerlukan ubah `index.html`, `Setup.gs` (`CATEGORY_KEYS`/`CATEGORY_LABELS`), dan `admin/index.html` (`TABS`).
- Pilihan jenis dalam borang (cth jenis aduan, jenis bantuan) — ada dalam `categoryConfig` di `site/index.html`. Minta senarai pilihan klien.
- Bahasa: Bahasa Melayu + English (butang BM/EN sedia ada).
- Domain sendiri? (cth `aduan.klien.my`). Jika ya, perlu akses DNS — lihat `docs/03`.

## D. Undang-undang & operasi

- Siapa **pegawai perlindungan data / hubungan PDPA** di pihak klien? (Muncul dalam dasar privasi.)
- Berapa lama data disimpan? (Menentukan jadual pemadaman — `docs/04`.)
- Siapa **staf** yang akan: (a) kemas kini status aduan di dashboard; (b) edit kandungan di CMS? Nama + emel masing-masing.
- Dasar privasi sedia ada (draf dalam `index.html`) disemak oleh peguam/pihak berkelayakan klien?
- Adakah klien setuju data disimpan pada pelayan Google/Firebase (di luar Malaysia)? Nyatakan dalam notis privasi.

## E. Ringkasan untuk `new-client.sh`

Sediakan nilai-nilai ini dalam satu nota — itulah soalan yang skrip akan tanya:

```
SLUG            (huruf kecil + sempang; jadi nama folder & repo)
APP_NAME        TAGLINE        ORG_NAME        ORG_SHORT        OFFICE_LABEL
ADMIN_EMAIL     CONTACT_EMAIL  WHATSAPP        PHONE_DISPLAY
GITHUB_OWNER    SITE_URL (kosong = GitHub Pages)    PRIMARY_COLOR
```
