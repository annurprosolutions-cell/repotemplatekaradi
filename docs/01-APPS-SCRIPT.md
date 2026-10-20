# 01 — Apps Script + Google Sheet + Drive (±15 minit)

Hasil akhir: satu Google Sheet (6 tab), 3 folder Drive, kata laluan admin, dan satu **URL Web App** (`…/exec`).
**Satu klien = satu Sheet + satu projek Apps Script + satu deployment.** Jangan kongsi antara klien.

## Sebelum mula

- Log masuk ke **akaun Google klien** (lihat `00-MAKLUMAT-KLIEN.md`). Semua yang dicipta akan dimiliki akaun ini.
- Dalam folder klien yang dijana: `appscript/Code.gs`, `appscript/Setup.gs`, `appscript/appsscript.json`.
  Blok `CLIENT` dalam `Setup.gs` sepatutnya sudah diisi oleh `new-client.sh`. Kalau belum, isi sekarang:

```js
var CLIENT = {
  APP_NAME:    "KARA-Di",
  ORG_NAME:    "Pusat Khidmat Rakyat Karambunai",
  ADMIN_EMAIL: "admin@klien.com",
  SITE_URL:    "https://aduan.klien.my/",                    // boleh kosongkan dulu; isi bila laman dah hidup (docs/03)
  PRIMARY_COLOR: "#1A4A9A",
  FOLDER_PARENT_ID: ""                                        // kosong = My Drive
};
```

## Langkah

### 1. Cipta Sheet dan buka Apps Script
1. Pergi ke **sheets.new** → namakan fail, cth `KARA-Di — Pangkalan Data`. Tak perlu cipta tab; setup yang buat.
2. Menu **Extensions → Apps Script**. (Mesti dibuka dari Sheet supaya skrip *terikat* pada Sheet itu dan menu ⚙️ muncul.)

### 2. Tampal kod
1. Dalam editor, fail `Code.gs` sudah ada dengan fungsi kosong. **Padam semua**, tampal seluruh kandungan `appscript/Code.gs`.
2. Klik **+** di sebelah *Files* → **Script** → namakan `Setup` (jadi `Setup.gs`) → tampal kandungan `appscript/Setup.gs`.
3. Ikon ⚙️ **Project Settings** (kiri) → tandakan **Show "appsscript.json" manifest file in editor**. Kembali ke **Editor** → buka `appsscript.json` → ganti dengan kandungan `appscript/appsscript.json`.
   Ini menetapkan zon masa `Asia/Kuala_Lumpur`, kebenaran yang diperlukan, dan tetapan deploy (Execute as *Me*, Access *Anyone*).
4. **Ctrl+S** untuk simpan.

### 3. Setup pertama kali (satu klik)

**Cara A — melalui menu Sheet (disyorkan, sekali gus tetapkan kata laluan):**
1. Tutup tab Apps Script. **Refresh** tab Google Sheet. Tunggu 5–10 saat — menu **⚙️ KARA-Di** muncul di sebelah *Help*.
2. **⚙️ KARA-Di → 🚀 Setup Pertama Kali** → OK.
3. Google minta kebenaran (lihat nota di bawah) → benarkan.
4. Masukkan **kata laluan admin** (minimum 10 aksara), dua kali. Simpan dalam pengurus kata laluan klien.
5. Laporan setup keluar. Contoh:

```
SETUP KARA-DI  (template-1.0)

📄 Spreadsheet: KARA-Di — Pangkalan Data
🆕 Tab 'Jemputan' dicipta
🆕 Tab 'Permohonan' dicipta
… (6 tab)
📁 Folder Drive: KARA-Di — Data
   • Laporan Serahan (PDF)
   • Muat Naik Fail Mentah
   • Laporan Penyelesaian
✅ Kata laluan admin ditetapkan.
```

**Cara B — dari editor (kalau menu tak muncul):** pilih fungsi `setupSystem` dalam dropdown di bar atas → **Run** → benarkan → lihat *Execution log*. Selepas itu tetapkan kata laluan melalui menu **⚙️ → 🔑 Tetapkan / Tukar Kata Laluan Admin** (kata laluan sengaja tidak pernah disimpan dalam kod).

**Setup selamat dijalankan berulang kali**: ia tak padam data, tak duplikasi tab/folder, dan kata laluan sedia ada dikekalkan.

> **Nota kebenaran.** Google akan tunjuk *"Google hasn't verified this app"*. Itu normal untuk skrip sendiri (bukan aplikasi awam).
> Klik **Advanced → Go to <nama projek> (unsafe) → Allow**. Kebenaran yang diminta: Google Sheets, Google Drive,
> hantar emel (kod reset), dan hubungi URL luar (baca `content/site.json` untuk suis tutup borang).

### 4. Deploy sebagai Web App
1. **Deploy → New deployment** → ikon ⚙️ di sebelah *Select type* → **Web app**.
2. *Description*: `v1`. **Execute as: Me**. **Who has access: Anyone**.
3. **Deploy** → salin **Web app URL** (berakhir `/exec`).

> "Anyone" memang perlu — portal rakyat memanggil URL ini tanpa log masuk Google. Tindakan admin dikawal
> oleh log masuk + token sesi di server, bukan oleh URL yang tersembunyi.

### 5. Sambung ke laman web
Tampal URL ke `site/config.js`:
```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy.../exec",
```

### 6. Sahkan
- Buka URL `/exec` dalam browser → `{"status":"success","app":"KARA-Di",…}`.
- Sheet → **⚙️ → 🩺 Semak Status Sistem** → semua baris ✅ (Sheet, 3 folder, kata laluan, URL).
- Selepas laman web dihidupkan (`docs/03`): hantar satu borang ujian dan semak baris muncul dalam tab berkenaan.

## Mengemas kini kod kemudian (penting)

Edit kod → **Deploy → Manage deployments → ✏️ (Edit) → Version: *New version* → Deploy**.
URL kekal sama. **Jangan** pilih *New deployment* — itu menjana URL baharu dan portal akan putus.

## Akses & pemulihan

| Situasi | Tindakan |
|---|---|
| Lupa kata laluan admin | Dashboard → *Lupa kata laluan?* (kod dihantar ke `ADMIN_EMAIL`). Atau Sheet → ⚙️ → 🔑 Tetapkan / Tukar Kata Laluan Admin (perlu akses edit Sheet). |
| Staf berhenti / peranti hilang | ⚙️ → 🚪 Log Keluar Semua Sesi Admin, kemudian tukar kata laluan. |
| Nak tukar `ADMIN_EMAIL` | Edit `Setup.gs` → deploy *New version*. Tukar kata laluan selepas itu. |
| Tambah pembangun | Share Sheet sebagai **Editor** (otomatik boleh edit Apps Script yang terikat). |

## Had & kuota (dari ingatan — sahkan di https://developers.google.com/apps-script/guides/services/quotas)

- Emel dihantar harian: ~100 (akaun Gmail biasa) / ~1,500 (Workspace). Sistem hanya hantar emel untuk kod reset, jadi jarang jadi isu.
- Masa laku satu permintaan: ~6 minit. Penjanaan PDF dengan banyak gambar besar boleh gagal; sistem cuba semula **tanpa gambar** dan, kalau masih gagal, simpan pautan fail mentah dalam lajur *Lampiran* (bukti tak hilang).
- Hantaran dengan lampiran diserialkan (satu pada satu masa) — beberapa saat setiap satu. Cukup untuk pejabat kecil/sederhana; volum tinggi perlu seni bina lain.
- Skrip berjalan sebagai akaun yang deploy. Kalau akaun itu digantung, sistem berhenti.

## Selesai masalah

| Gejala | Punca biasa | Penyelesaian |
|---|---|---|
| Menu ⚙️ tak muncul | Skrip dicipta dari script.google.com (standalone), atau belum refresh | Buka Apps Script melalui Sheet; refresh. Atau guna Cara B. |
| `Setup dihentikan… CLIENT.APP_NAME belum diisi` | Masih ada placeholder `__…__` dalam `Setup.gs` | Isi blok `CLIENT`. |
| Portal: *"Sistem belum disetup"* | Setup belum dijalankan, atau Script Properties dipadam | Jalankan setup semula. |
| Portal/admin: ralat CORS / "Failed to fetch" | URL bukan `/exec`, atau akses bukan *Anyone*, atau deployment lama | Semak URL; Manage deployments; pastikan *Anyone*. |
| Edit kod tapi tiada perubahan | Belum *New version* | Lihat bahagian "Mengemas kini kod". |
| *"Kata laluan admin belum ditetapkan"* | Setup dijalankan tanpa menu | ⚙️ → 🔑 Tetapkan Kata Laluan. |
| Kod reset tak sampai | Folder Spam, kuota, atau `ADMIN_EMAIL` salah | Semak; guna menu Sheet untuk tukar terus. |
| Hantar borang: *"Pelayan sedang sibuk"* | Beberapa hantaran serentak | Cuba lagi sebentar. |
| *"Terlalu banyak percubaan…"* | Had percubaan (global) tercapai | Tunggu 15 minit, atau tukar kata laluan melalui menu Sheet. |
| Borang ditolak *"ditutup"* / *"diselenggara"* | Suis dalam CMS (`content/site.json`) | Semak CMS. Server baca fail itu dari `CLIENT.SITE_URL`. |
