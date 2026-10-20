#!/usr/bin/env bash
# =============================================================================
# new-client.sh — jana folder klien baharu daripada template ini
# -----------------------------------------------------------------------------
# Guna:        ./new-client.sh
# Tanpa soalan (CI / ulang cepat): set pembolehubah persekitaran dahulu, cth
#   SLUG=abc APP_NAME="ABC-Di" ORG_NAME="Pusat Khidmat ABC" ADMIN_EMAIL=a@b.com \
#   WHATSAPP=60123456789 ./new-client.sh
#
# Hasil: clients/<slug>/ mengandungi
#   site/        → isi folder ini ke akar repo GitHub klien (dihoskan di Cloudflare Pages)
#   appscript/   → tampal ke projek Apps Script klien (nilai CLIENT sudah diisi)
#   firebase/    → firestore.rules
#   docs/        → panduan langkah demi langkah
#   CHECKLIST.md → senarai semak khusus klien ini
#
# Perlu: bash, sed, cp (Mac / Linux / Git Bash / WSL). Windows biasa: guna Git Bash
# atau WSL, ATAU salin folder dan ganti semua __TOKEN__ secara manual (lihat README).
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- soalan -----------------------------------------------------------------
# ask VAR "Soalan" ["lalai"]   — kalau $VAR sudah diset dalam persekitaran, tak tanya.
ask() {
  local var="$1" q="$2" def="${3:-}" ans="${!1:-}"
  if [ -z "$ans" ]; then
    if [ -n "$def" ]; then read -r -p "$q [$def]: " ans || true; ans="${ans:-$def}"
    else read -r -p "$q: " ans || true; fi
  fi
  printf -v "$var" '%s' "$ans"
}

die() { echo "RALAT: $*" >&2; exit 1; }

# Nilai dimasukkan ke dalam rentetan JS/JSON/YAML/Apps Script yang berpetik dua,
# jadi " dan \ dan baris baru tidak dibenarkan.
check_safe() {
  case "$2" in *\"*|*\\*|*$'\n'*) die "$1 tidak boleh mengandungi tanda petik dua ( \" ), garis condong terbalik ( \\ ) atau baris baru." ;; esac
}

# Ganti semua TOKEN dengan VALUE dalam fail-fail (sed -i.bak berfungsi di GNU & BSD/Mac).
replace_all() {
  local tok="$1" val="$2"; shift 2
  local esc; esc="$(printf '%s' "$val" | sed -e 's/[\/&|\\]/\\&/g')"
  local f
  for f in "$@"; do
    [ -f "$f" ] || continue
    sed -i.bak "s|$tok|$esc|g" "$f" && rm -f "$f.bak"
  done
}

echo
echo "=== Klien baharu ==="
ask SLUG          "Slug folder/repo (huruf kecil, nombor, sempang. Cth: abc-klien)"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{1,40}$ ]] || die "Slug tidak sah. Guna huruf kecil, nombor dan sempang sahaja (2-41 aksara)."
OUT="$HERE/clients/$SLUG"
[ -e "$OUT" ] && die "Folder $OUT sudah wujud. Pilih slug lain atau padam folder itu dahulu."

ask APP_NAME      "Nama sistem (cth: KARA-Di)"
ask TAGLINE       "Tagline pendek (cth: Karambunai Digital Interaction)" ""
ask ORG_NAME      "Nama organisasi penuh (cth: Pusat Khidmat Rakyat Karambunai)"
ask ORG_SHORT     "Nama ringkas untuk mesej 'team ... telah menerima' (cth: Karambunai)" "$APP_NAME"
ask OFFICE_LABEL  "Label lokasi di halaman utama (cth: Pejabat ADUN Karambunai)" "$ORG_NAME"
ask ADMIN_EMAIL   "Emel ADMIN (log masuk dashboard + terima kod reset)"
[[ "$ADMIN_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "Emel admin tidak sah."
ask CONTACT_EMAIL "Emel AWAM untuk orang ramai hubungi" "$ADMIN_EMAIL"
ask WHATSAPP      "Nombor WhatsApp, digit sahaja + kod negara (cth: 60123456789). Kosongkan kalau belum ada" ""
WHATSAPP="${WHATSAPP//[^0-9]/}"
# Nombor tempatan Malaysia (mula dengan 0) → format antarabangsa untuk pautan wa.me / tel:
if [[ -n "$WHATSAPP" && "$WHATSAPP" == 0* ]]; then WHATSAPP="60${WHATSAPP#0}"; echo "  (nombor ditukar ke format antarabangsa: $WHATSAPP)"; fi
ask PHONE_DISPLAY "Cara nombor dipaparkan (cth: 012-345 6789)" "$WHATSAPP"
ask GITHUB_OWNER  "Akaun/organisasi GitHub pemilik repo laman (kosongkan kalau belum tahu)" ""
ask SITE_URL      "URL laman klien: alamat pages.dev atau subdomain, cth https://aduan.klien.my/ (kosongkan dulu kalau belum ada)" ""
ask CMS_AUTH_URL  "URL Worker log masuk CMS, cth https://abc-cms-auth.akaun.workers.dev (kosongkan dulu kalau belum deploy)" ""
ask PRIMARY_COLOR "Warna utama (hex)" "#1A4A9A"
[[ "$PRIMARY_COLOR" =~ ^#[0-9a-fA-F]{6}$ ]] || die "Warna mesti format #RRGGBB."

if [ -n "$GITHUB_OWNER" ]; then
  GITHUB_REPO="$GITHUB_OWNER/$SLUG"
else
  GITHUB_REPO="GANTI-OWNER/$SLUG"
fi
if [ -n "$SITE_URL" ]; then SITE_URL="${SITE_URL%/}/"; fi

for kv in "SLUG=$SLUG" "APP_NAME=$APP_NAME" "TAGLINE=$TAGLINE" "ORG_NAME=$ORG_NAME" "ORG_SHORT=$ORG_SHORT" "OFFICE_LABEL=$OFFICE_LABEL" \
          "ADMIN_EMAIL=$ADMIN_EMAIL" "CONTACT_EMAIL=$CONTACT_EMAIL" "PHONE_DISPLAY=$PHONE_DISPLAY" "GITHUB_REPO=$GITHUB_REPO" "SITE_URL=$SITE_URL" "CMS_AUTH_URL=$CMS_AUTH_URL"; do
  check_safe "${kv%%=*}" "${kv#*=}"
done

# ---- salin template ---------------------------------------------------------
mkdir -p "$OUT"
cp -R "$HERE/site"      "$OUT/site"
cp -R "$HERE/appscript" "$OUT/appscript"
cp -R "$HERE/firebase"  "$OUT/firebase"
cp -R "$HERE/docs"      "$OUT/docs"

# ---- isi token --------------------------------------------------------------
# base_url Worker CMS: kalau diberi, hidupkan barisnya; kalau tidak, biar sebagai komen contoh.
if [ -n "$CMS_AUTH_URL" ]; then
  replace_all "# base_url: __CMS_AUTH_URL__" "base_url: ${CMS_AUTH_URL%/}" "$OUT/site/cms/config.yml"
else
  replace_all "__CMS_AUTH_URL__" "https://nama-worker.akaun.workers.dev" "$OUT/site/cms/config.yml"
fi
TOKFILES=("$OUT/site/config.js" "$OUT/site/content/site.json" "$OUT/site/cms/config.yml" "$OUT/appscript/Setup.gs")
replace_all "__APP_NAME__"       "$APP_NAME"       "${TOKFILES[@]}"
replace_all "__TAGLINE__"        "$TAGLINE"        "${TOKFILES[@]}"
replace_all "__ORG_NAME__"       "$ORG_NAME"       "${TOKFILES[@]}"
replace_all "__ORG_SHORT__"      "$ORG_SHORT"      "${TOKFILES[@]}"
replace_all "__OFFICE_LABEL__"   "$OFFICE_LABEL"   "${TOKFILES[@]}"
replace_all "__ADMIN_EMAIL__"    "$ADMIN_EMAIL"    "${TOKFILES[@]}"
replace_all "__CONTACT_EMAIL__"  "$CONTACT_EMAIL"  "${TOKFILES[@]}"
# WhatsApp/telefon: kalau kosong, token DIKEKALKAN supaya jelas belum diisi (jangan reka nombor).
[ -z "$WHATSAPP" ]      || replace_all "__WHATSAPP__"      "$WHATSAPP"      "${TOKFILES[@]}"
[ -z "$PHONE_DISPLAY" ] || replace_all "__PHONE_DISPLAY__" "$PHONE_DISPLAY" "${TOKFILES[@]}"
replace_all "__GITHUB_REPO__"    "$GITHUB_REPO"    "${TOKFILES[@]}"
replace_all "__SITE_URL__"       "$SITE_URL"       "${TOKFILES[@]}"
replace_all "__PRIMARY_COLOR__"  "$PRIMARY_COLOR"  "${TOKFILES[@]}"

# Warna utama dalam HTML/SVG (nilai asal #1A4A9A)
for f in "$OUT/site/index.html" "$OUT/site/admin/index.html" "$OUT/site/assets/logo.svg" "$OUT/site/assets/placeholder-slide.svg"; do
  [ -f "$f" ] && sed -i.bak "s/#1[Aa]4[Aa]9[Aa]/$PRIMARY_COLOR/g" "$f" && rm -f "$f.bak"
done

# ---- senarai semak khusus klien --------------------------------------------
cat > "$OUT/CHECKLIST.md" <<EOF
# Senarai Semak — $APP_NAME ($SLUG)

Dijana: $(date '+%d/%m/%Y %H:%M')

| Item | Nilai |
|---|---|
| Nama sistem | $APP_NAME |
| Organisasi | $ORG_NAME |
| Emel admin (log masuk + kod reset) | $ADMIN_EMAIL |
| Emel awam | $CONTACT_EMAIL |
| WhatsApp / telefon | $WHATSAPP / $PHONE_DISPLAY |
| Repo GitHub | $GITHUB_REPO |
| URL laman | ${SITE_URL:-(belum ditetapkan)} |
| URL Apps Script (/exec) | _isi selepas deploy_ |
| Firebase Project ID | _isi selepas cipta projek_ |

## A. Apps Script — docs/01-APPS-SCRIPT.md
- [ ] Akaun Google klien sedia (akaun khas, 2FA hidup)
- [ ] Google Sheet baharu dicipta; Apps Script dibuka melalui Extensions
- [ ] appsscript.json + Code.gs + Setup.gs ditampal (blok CLIENT sudah diisi)
- [ ] Menu ⚙️ → Setup Pertama Kali dijalankan; kata laluan admin ditetapkan
- [ ] Deploy Web App (Execute as: Me, Access: Anyone); URL /exec disalin
- [ ] URL dimasukkan ke site/config.js → APPS_SCRIPT_URL
- [ ] ⚙️ → Semak Status Sistem: semua ✅

## B. Firebase — docs/02-FIREBASE.md
- [ ] Projek dicipta; Email/Password dihidupkan
- [ ] Firestore dicipta (asia-southeast1); firestore.rules diterbit
- [ ] firebaseConfig disalin ke site/config.js → FIREBASE
- [ ] Alamat pages.dev, subdomain (dan nanti domain utama) ditambah ke Authorized domains
- [ ] (Disyorkan) API key disekat ikut HTTP referrer

## C. GitHub + Cloudflare Pages + Sveltia — docs/03-CLOUDFLARE-DAN-SVELTIA.md
- [ ] Akaun GitHub & Cloudflare klien sedia; pembangun dijemput (collaborator / member)
- [ ] Repo $GITHUB_REPO dicipta (private); isi folder site/ di akar repo
- [ ] Cloudflare Pages disambung ke repo (preset None, build command kosong, output /)
- [ ] Alamat \`<projek>.pages.dev\` berfungsi; CLIENT.SITE_URL + Firebase Authorized domains dikemas kini
- [ ] Subdomain klien disambung (CNAME → pages.dev); SSL aktif; lima tempat dikemas kini (docs/03 bahagian D)
- [ ] Worker \`sveltia-cms-auth\` dideploy dalam akaun Cloudflare klien; GitHub OAuth App didaftar; ALLOWED_DOMAINS diisi
- [ ] cms/config.yml \`base_url\` = URL Worker; /cms/ → "Sign In with GitHub" berjaya; satu suntingan ujian muncul di laman
- [ ] Staf CMS dijemput sebagai collaborator (Write)
- [ ] (Kemudian, bila klien berpuas hati) Domain utama — docs/03 bahagian G

## D. Ujian penerimaan
- [ ] Logo klien diganti (site/assets/) dan config.js → BRAND.logo dikemas kini
- [ ] Hantar satu borang ujian (dengan gambar) → rujukan diterima → muncul dalam Sheet
- [ ] PDF serahan dijana & pautan di lajur Lampiran berfungsi
- [ ] Semak Status dengan no. rujukan & no. telefon
- [ ] Dashboard admin: log masuk, tukar status, laporan tindakan
- [ ] Lupa kata laluan: kod sampai ke $ADMIN_EMAIL
- [ ] Daftar akaun rakyat + log masuk + lihat sejarah
- [ ] Tutup satu borang melalui CMS → kad jadi DITUTUP; hantar borang itu ditolak
- [ ] Padam data ujian daripada Sheet (kekalkan baris header)

## E. Serahan — docs/04-ONBOARD-DAN-SERAHAN.md
- [ ] Notis privasi disemak (peguam klien); butiran hubungan betul
- [ ] Pemilik Sheet/Drive/Firebase/GitHub direkodkan; pemulihan akaun disemak
- [ ] Latihan staf: tukar kandungan CMS, kemas kini status, jana laporan
EOF

# ---- ringkasan --------------------------------------------------------------
LEFT="$(grep -rlE '__[A-Z0-9_]+__' "$OUT/site" "$OUT/appscript" 2>/dev/null | sed "s|$OUT/||" | tr '\n' ' ')"
echo
echo "✅ Siap: $OUT"
echo
echo "Langkah seterusnya (ikut $OUT/CHECKLIST.md):"
echo "  1. docs/01-APPS-SCRIPT.md   — tampal appscript/, setup, deploy → dapat URL /exec"
echo "  2. docs/02-FIREBASE.md      — cipta projek Firebase → dapat firebaseConfig"
echo "  3. Edit site/config.js      — tampal URL /exec + firebaseConfig; letak logo di site/assets/"
echo "  4. docs/03-CLOUDFLARE-DAN-SVELTIA.md — push site/ ke GitHub, Cloudflare Pages, Worker log masuk CMS"
echo
if [ -n "$LEFT" ]; then
  echo "Token yang masih perlu diisi manual (dijangka: Firebase sahaja): $LEFT"
  grep -rhoE '__[A-Z0-9_]+__' "$OUT/site" "$OUT/appscript" | sort -u | tr '\n' ' '; echo
fi
[ -n "$GITHUB_OWNER" ] || echo "NOTA: GITHUB_OWNER kosong → cms/config.yml 'repo:' perlu diisi sendiri kemudian."
[ -n "$WHATSAPP" ] || echo "NOTA: WHATSAPP/telefon kosong → ganti __WHATSAPP__ dan __PHONE_DISPLAY__ dalam site/config.js sebelum live."
[ -n "$SITE_URL" ] || echo "NOTA: SITE_URL kosong → isi CLIENT.SITE_URL dalam Setup.gs selepas Cloudflare Pages siap (docs/03 bahagian B/D)."
