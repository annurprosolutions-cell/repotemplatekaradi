# 04 — Ujian penerimaan, PDPA dan serahan kepada klien

## 1. Ujian penerimaan (jalankan bersama klien)

Gunakan data ujian dan **padam semuanya** selepas itu (kekalkan baris header dalam setiap tab).

| # | Ujian | Jangkaan |
|---|---|---|
| 1 | Buka portal di telefon & komputer | Nama, logo, warna, hubungan klien betul. Tiada perkataan jenama lain. |
| 2 | Hantar **Aduan** dengan 2 gambar | Skrin rujukan keluar; baris muncul di tab *Aduan*; lajur *Lampiran* = pautan PDF; PDF ada muka surat "Lampiran & Bukti" dengan gambar |
| 3 | Hantar borang yang sama sekali lagi, IC sama, hari sama | Rujukan kedua berakhir `-2` |
| 4 | **Semak Status** dengan no. rujukan, kemudian no. telefon | Status keluar; nama & telefon ditutup separa; tiada IC/alamat/emel |
| 5 | Dashboard admin: log masuk, buka rekod, tukar status → *Sedang Di Proses* dengan laporan | Status & pautan laporan masuk Sheet; rakyat nampak "Maklum Balas Rasmi" di semakan status |
| 6 | Tandakan *Telah Selesai* | Tarikh Selesai direkod; rakyat nampak "Tindakan Selesai" |
| 7 | *Lupa kata laluan* admin | Kod 6-digit sampai ke `ADMIN_EMAIL`; set semula berjaya; sesi lama terputus |
| 8 | Daftar akaun rakyat, log masuk, hantar borang, lihat **Sejarah** | Rekod muncul dalam sejarah |
| 9 | CMS: matikan satu kategori | Kad "DITUTUP"; hantaran ditolak |
| 10 | CMS: hidupkan *Mod Penyelenggaraan* | Butang masuk dikunci; hantaran ditolak. **Matikan semula.** |
| 11 | CMS: tukar slide, pengumuman, waktu operasi | Muncul di portal |
| 12 | Eksport Excel & jana laporan PDF dari dashboard | Fail terhasil, jenama betul |

## 2. PDPA (Malaysia) — perkara praktikal

> Ini ringkasan amalan baik berdasarkan pemahaman aku tentang Akta Perlindungan Data Peribadi 2010 dan pindaan terkininya
> (pindaan 2024 — semak keperluan semasa, termasuk pemberitahuan pelanggaran data dan pegawai perlindungan data).
> Klien kekal bertanggungjawab; minta peguam mereka semak notis privasi sebelum "live".

**Apa yang sistem kumpul:** nama, **No. KP**, telefon, alamat, emel, butiran aduan/permohonan, dan dokumen/gambar yang dimuat naik
(sering salinan IC, bil utiliti). Ini data peribadi — IC khususnya sensitif dari segi risiko.

| Perkara | Keadaan semasa template | Tindakan disyorkan |
|---|---|---|
| **Notis privasi & persetujuan** | Ada draf ringkas (modal "Dasar Privasi") + kotak persetujuan wajib pada borang & pendaftaran | Klien/peguam semak teks; pastikan emel hubungan & nama organisasi betul (diisi dari `config.js`). Nyatakan data disimpan di pelayan Google/Firebase di luar Malaysia. |
| **Akses Sheet** | Sesiapa yang diberi akses ke Sheet melihat semua data termasuk No. KP | Kongsi Sheet kepada **segelintir** staf sahaja (Viewer, bukan Editor, jika boleh). Matikan "anyone with link" untuk Sheet. |
| **Pautan PDF & fail mentah** | Dikongsi **"sesiapa dengan pautan boleh lihat"** — pautan tak terdedah kepada orang awam (carian status tidak lagi memulangkannya), tetapi sesiapa yang memegang pautan boleh membuka | Terima risiko ini secara sedar, **atau** tukar kepada kongsi terhad (hanya akaun tertentu) — ubah `setSharing(...)` dalam `Code.gs`, dan pautan hanya boleh dibuka staf yang log masuk Google. Rakyat tak lagi boleh klik pautan lampiran sendiri. |
| **Tempoh simpanan** | Tiada pemadaman automatik | Tetapkan dasar (cth 2–3 tahun selepas kes selesai). Jadualkan semakan tahunan: eksport & padam baris/folder lama. |
| **Akses subjek data** (lihat / betul / padam) | Rakyat berdaftar boleh ubah profil; tiada butang padam akaun | Tetapkan prosedur melalui emel hubungan; padam dalam Firebase (Authentication + `users/<uid>`), Sheet dan Drive. |
| **Pelanggaran data** | — | Sediakan pelan ringkas: siapa dimaklumkan, dalam berapa lama, cara tukar kata laluan/batalkan sesi (⚙️ → Log Keluar Semua Sesi), cara putuskan akses (Archive deployment). |
| **Peranti staf** | — | Skrin dikunci, 2FA pada akaun Google, jangan muat turun eksport ke peranti peribadi. |
| **Eksport Excel/PDF** | Dashboard tanya sebelum sertakan No. KP | Jangan sertakan No. KP melainkan perlu; simpan fail dengan selamat. |

## 3. Penyelenggaraan berterusan

| Tugas | Kekerapan |
|---|---|
| Semak ⚙️ → **Semak Status Sistem** semua ✅ | Bulanan |
| **Sandaran:** Sheet → File → Version history (automatik) + eksport `.xlsx` bulanan ke lokasi selamat | Bulanan |
| Tukar token CMS yang luput; **cabut akses staf yang berhenti** (collaborator GitHub, Editor Sheet, peranan Firebase) | Bila perlu |
| Semak kuota Gmail/Drive; kosongkan data ujian | Sekali pada permulaan |
| Kemas kini template → salin perubahan ke klien (Apps Script: *New version*; laman: push ke repo) | Bila ada pembaikan |
| Semak versi Sveltia & uji semula `/cms/` selepas naik taraf | Suku tahunan |

## 4. Senarai serahan (beri kepada klien)

- [ ] Rekod bertulis **siapa pemilik** setiap komponen: akaun Google (Sheet/Drive/Apps Script), projek Firebase, repo GitHub, domain
- [ ] URL: portal, `/admin/`, `/cms/`, Sheet, folder Drive — **tanpa** kata laluan dalam dokumen yang sama
- [ ] Kata laluan admin & akaun Google dihantar melalui saluran berasingan / pengurus kata laluan
- [ ] Kaedah pemulihan akaun Google (nombor telefon & emel pemulihan milik klien)
- [ ] Panduan ringkas untuk staf: kemas kini status & laporan di dashboard; ubah kandungan di CMS (`03`, bahagian *Cara guna*)
- [ ] Siapa hubungi bila ada masalah, dan skop sokongan (SLA) yang dipersetujui
- [ ] Nota tentang had yang diketahui (README, bahagian *Had & keputusan reka bentuk*) — terutama kelewatan ±1–3 minit pada suis CMS

## 5. Apabila perlu tukar tingkah laku untuk satu klien

Ubah dalam folder **klien** itu sahaja (`clients/<slug>/…`) dan catat apa yang diubah dalam `CHECKLIST.md` klien tersebut.
Jika perubahan berguna untuk semua klien, ubah **template**, jalankan ujian dalam `dev/`, kemudian salin ke setiap klien.
