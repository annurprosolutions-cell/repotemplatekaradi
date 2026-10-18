# 02 — Firebase (akaun rakyat) — langkah demi langkah (±15 minit)

**Firebase hanya untuk akaun RAKYAT**: daftar, log masuk, lupa kata laluan, profil (nama, IC, telefon, alamat).
Dashboard admin **tidak** guna Firebase. Aduan/permohonan disimpan dalam Google Sheet, bukan Firestore.

Hasil akhir: satu projek Firebase dengan Email/Password dihidupkan, Firestore + peraturan keselamatan,
dan objek `firebaseConfig` yang ditampal ke `site/config.js`.

> Nama menu dalam console Firebase kadang-kadang berubah sedikit. Kalau lain sikit dari yang ditulis di bawah,
> cari perkataan utamanya (Authentication, Firestore, Rules, Project settings).

## Langkah

### 1. Cipta projek
1. Pergi ke **https://console.firebase.google.com** → log masuk dengan **akaun Google klien**.
2. **Create a project** (atau *Add project*) → nama, cth `abc-klien` → **Continue**.
3. *Google Analytics*: **matikan** (tak diperlukan) → **Create project** → tunggu → **Continue**.
4. Catat **Project ID** (⚙️ Project settings → General). Ia mungkin berbeza sedikit dari nama (cth `abc-klien-a1b2c`).

### 2. Hidupkan log masuk Emel/Kata Laluan
1. Menu kiri **Build → Authentication → Get started**.
2. Tab **Sign-in method** → **Email/Password** → hidupkan pilihan pertama (*Email/Password*; *Email link* tak perlu) → **Save**.

### 3. Benarkan domain laman web
1. Authentication → tab **Settings** → **Authorized domains** → **Add domain**.
2. Masukkan domain laman: `namaowner.github.io` (tanpa `https://` dan tanpa nama repo). Jika guna domain sendiri, tambah juga domain itu.
   `localhost` sudah ada (untuk ujian tempatan).

> Tanpa langkah ini, daftar/log masuk di laman sebenar gagal dengan `auth/unauthorized-domain`.

### 4. Cipta Firestore
1. **Build → Firestore Database → Create database**.
2. *Location*: pilih paling dekat, cth **`asia-southeast1` (Singapore)**. **Tak boleh ditukar kemudian.**
3. Mod: **Production mode** → **Create**.

### 5. Letak peraturan keselamatan
1. Firestore → tab **Rules**.
2. Padam semua kandungan, tampal seluruh `firebase/firestore.rules` → **Publish**.

Maksud peraturan itu: setiap pengguna **hanya boleh baca/ubah/padam dokumen `users/<uid-sendiri>`**, medan dihadkan kepada
`nama, email, ic, phone, uid, address, createdAt` dengan had panjang, dan semua koleksi lain **ditutup**.
Kalau anda kemudian menambah medan baharu pada borang pendaftaran/profil, tambah nama medan dalam `hasOnly([...])` (dua tempat).

> Peraturan ini belum diuji dengan emulator Firebase. Ujian ringkas selepas publish ada di langkah 9.

### 6. Dapatkan `firebaseConfig`
1. ⚙️ **Project settings → General** → skrol ke **Your apps** → klik ikon web **`</>`**.
2. *App nickname*: `portal` → **jangan** tandakan *Firebase Hosting* → **Register app**.
3. Salin objek `firebaseConfig`:

```js
const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "abc-klien-a1b2c.firebaseapp.com",
  projectId: "abc-klien-a1b2c",
  storageBucket: "abc-klien-a1b2c.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```
4. Tampal setiap nilai ke blok `FIREBASE` dalam **`site/config.js`**.

> `apiKey` Firebase untuk web **bukan rahsia** (ia memang kelihatan di laman). Keselamatan datang daripada
> *Rules* (langkah 5), *Authorized domains* (langkah 3) dan sekatan API key (langkah 7). Jangan salah faham dan
> sembunyikannya — laman tidak akan berfungsi.

### 7. Sekat API key (disyorkan, 5 minit)
1. **https://console.cloud.google.com** → pilih projek yang sama → **APIs & Services → Credentials**.
2. Klik **Browser key** (dicipta automatik oleh Firebase).
3. *Application restrictions* → **Websites** → tambah `https://namaowner.github.io/*` (dan domain sendiri jika ada) → **Save**.
4. Uji daftar/log masuk selepas ini. Kalau gagal dengan ralat key/referrer, semak ejaan domain.

### 8. Sesuaikan emel reset kata laluan
Authentication → **Templates → Password reset** → ubah nama pengirim, subjek dan teks kepada Bahasa Melayu → **Save**.
(Pengirim lalai ialah `noreply@<project-id>.firebaseapp.com`.)

### 9. Ujian
1. Buka laman → **Masuk Sistem → Daftar** → daftar akaun ujian (IC 12 digit, tanda persetujuan privasi).
2. Firebase console → **Authentication → Users**: pengguna baharu ada.
3. **Firestore → Data**: koleksi `users` → dokumen `<uid>` dengan `nama, email, ic, phone, uid, address, createdAt`.
4. Log keluar, log masuk semula, ubah profil → semak dokumen dikemas kini.
5. **Rules Playground** (Firestore → Rules): simulasikan *get* `/users/lain` sebagai pengguna `<uid>` → mesti **Denied**.
6. *Lupa kata laluan* → emel sampai (semak Spam).

## Kos & privasi

- Pelan percuma **Spark** biasanya cukup untuk skala pejabat ADUN/pusat khidmat (semak halaman harga Firebase terkini — aku tak sahkan had semasa).
- No. KP disimpan **dalam Firestore** (profil) **dan** dalam Sheet (rekod aduan). Hadkan siapa ada peranan Owner/Editor
  dalam projek (⚙️ Project settings → *Users and permissions*): sesiapa yang ada peranan itu boleh melihat semua profil.
- Pelayan Firebase/Google di luar Malaysia — nyatakan dalam notis privasi (`docs/04`).

## Selesai masalah

| Gejala | Punca | Penyelesaian |
|---|---|---|
| Portal: *"Ralat Konfigurasi Firebase"* / konsol: *"Firebase belum dikonfigurasi"* | `config.js` masih ada nilai `__FIREBASE_…__` | Tampal `firebaseConfig` (langkah 6). |
| `auth/unauthorized-domain` | Domain laman belum ditambah | Langkah 3. |
| `auth/operation-not-allowed` | Email/Password belum dihidupkan | Langkah 2. |
| `auth/invalid-api-key` / `API key not valid` | Salah salin, atau sekatan referrer terlalu ketat | Semak `apiKey`; semak langkah 7. |
| Daftar berjaya tetapi profil tak tersimpan / `Missing or insufficient permissions` | Rules tak diterbit, atau medan baharu tak ada dalam `hasOnly` | Langkah 5. |
| `auth/email-already-in-use` | Emel sudah didaftar | Guna *Lupa kata laluan*. |
