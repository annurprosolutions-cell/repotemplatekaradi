// Dipanggil oleh cms-features-test.js — tetapan CMS (jenama, warna, teks, hubungan, privasi) pada portal & admin.
const fs=require("fs"),path=require("path"),http=require("http"),os=require("os"),assert=require("assert");
const {chromium}=require("playwright");
const SITE=process.argv[2];
const TW=process.argv[3];
const work=fs.mkdtempSync(path.join(os.tmpdir(),"fasaA-"));
fs.cpSync(SITE,work,{recursive:true});
const base=JSON.parse(fs.readFileSync(path.join(work,"content/site.json"),"utf8"));
let SITEJSON=JSON.stringify(base);
const types={".html":"text/html",".js":"application/javascript",".json":"application/json",".svg":"image/svg+xml",".css":"text/css",".png":"image/png"};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u.endsWith("/"))u+="index.html";
  if(u==="/content/site.json"){r.writeHead(200,{"content-type":"application/json"});return r.end(SITEJSON);}
  const f=path.join(work,u);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}
  r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});r.end(fs.readFileSync(f));}).listen(8791);
const css={portal:fs.readFileSync(path.join(TW,"portal.css"),"utf8"),admin:fs.readFileSync(path.join(TW,"admin.css"),"utf8")};
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log("  ✓",m)}else{fail++;console.log("  ✗",m)}};
(async()=>{
 const br=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
 async function open(url,which){
  const ctx=await br.newContext();const pg=await ctx.newPage();const errs=[];
  pg.on("pageerror",e=>errs.push(e.message));
  await ctx.route("**/*",rt=>{const u=new URL(rt.request().url());
   if(u.hostname==="localhost")return rt.continue();
   if(u.hostname==="cdn.tailwindcss.com")return rt.fulfill({contentType:"application/javascript",body:`window.tailwind={};(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css[which])};document.head.appendChild(s);})();`});
   return rt.abort();});
  await pg.goto(url);await pg.waitForTimeout(1200);return {pg,ctx,errs};}
 const col=(pg,sel,prop="backgroundColor")=>pg.$eval(sel,(e,p)=>getComputedStyle(e)[p],prop);
 const vis=(pg,sel)=>pg.$eval(sel,e=>e.offsetParent!==null||getComputedStyle(e).display!=="none"&&e.getClientRects().length>0);

 console.log("1) site.json kosong (nilai asal) — rupa tidak berubah");
 let {pg,ctx,errs}=await open("http://localhost:8791/","portal");
 ok(await col(pg,"header")==="rgb(26, 74, 154)","header warna asal #1A4A9A");
 ok(await col(pg,".ticker-wrap")==="rgb(30, 58, 138)","ticker warna asal");
 ok(await col(pg,"[data-i18n=tag_official]")==="rgb(37, 99, 235)","lencana hero asal blue-600");
 ok((await pg.textContent("[data-i18n=hero_title]")).startsWith("Selamat Datang ke"),"tajuk hero asal");
 ok(!(await vis(pg,"#footer-note")),"nota footer tersembunyi bila kosong");
 ok(errs.filter(e=>!/Firebase/.test(e)).length===0,"tiada ralat JS: "+errs.join("|"));
 await ctx.close();

 console.log("2) site.json diisi melalui CMS");
 SITEJSON=JSON.stringify(Object.assign({},base,{
  brand:{name:"E-Bintong",tagline:"Bintong Digital",org_name:"PKMB Bintong",org_short:"Bintong",office_label:"Pejabat Bintong",logo:"assets/no-image.svg"},
  colors:{primary:"#0F7B3F",secondary:"",accent:"#FFD400"},
  hero:{badge:"PORTAL RASMI",badge_en:"",title:"Selamat Datang ke {{name}}",title_en:"",subtitle:"Khidmat untuk semua",subtitle_en:"Service for all"},
  texts:{enter:"Hantar Aduan",enter_desc:"",footer_note:"Lot 1, Bintong",footer_note_en:""},
  contact:{email:"hubungi@bintong.my",whatsapp:"",phone:"",phone_display:"",address:"Lot 1, Jalan Bintong\nPerlis",facebook:"https://facebook.com/bintong",instagram:"bukan-url"},
  privacy:{body:"**Data:** kami simpan.\n\nPerenggan dua <script>x</script>",body_en:""}
 }));
 ({pg,ctx,errs}=await open("http://localhost:8791/","portal"));
 ok(await col(pg,"header")==="rgb(15, 123, 63)","header ikut warna utama CMS");
 ok(await col(pg,".btn-primary").catch(()=>"x")!=="rgb(26, 74, 154)","btn-primary bukan warna asal");
 ok(await col(pg,"[data-i18n=tag_official]")==="rgb(255, 212, 0)","lencana ikut warna aksen");
 ok(await col(pg,"[data-i18n=tag_official]","color")==="rgb(31, 41, 55)","teks lencana gelap atas aksen cerah");
 ok((await pg.textContent("[data-i18n=tag_official]"))==="PORTAL RASMI","teks lencana CMS");
 ok((await pg.textContent("[data-i18n=hero_title]"))==="Selamat Datang ke E-Bintong","tajuk hero + {{name}}");
 ok((await pg.textContent("[data-i18n=action_enter]"))==="Hantar Aduan","kad 1 ikut CMS");
 ok((await pg.textContent("[data-i18n=action_enter_desc]"))==="Aduan, Permohonan & Temujanji","keterangan kosong = asal");
 ok((await pg.textContent("header [data-brand=name]"))==="E-Bintong","nama di header");
 ok((await pg.title()).startsWith("E-Bintong"),"tajuk tab");
 ok((await pg.getAttribute("header img","src")).endsWith("assets/no-image.svg"),"logo CMS");
 ok((await pg.getAttribute('link[rel="icon"]',"href")).endsWith("assets/no-image.svg"),"favicon = logo");
 ok((await pg.getAttribute('meta[name="theme-color"]',"content"))==="#0f7b3f","theme-color");
 ok((await pg.textContent("#footer-note"))==="Lot 1, Bintong"&&await vis(pg,"#footer-note"),"nota footer");
 await pg.evaluate(()=>showView('view-contact'));await pg.waitForTimeout(200);
 ok(await vis(pg,'#view-contact [data-brand-show=email]'),"kad emel dipapar");
 ok(!(await vis(pg,'#view-contact [data-brand-show=whatsapp]'))===(!/\d/.test(await pg.evaluate(()=>KARADI_BRAND.whatsapp||""))),"kad WhatsApp ikut ada/tiada nombor");
 ok(await vis(pg,'#view-contact [data-brand-show=address]'),"kad alamat dipapar");
 ok((await pg.textContent('#view-contact [data-brand=address]')).includes("Perlis"),"isi alamat");
 ok(await vis(pg,'#view-contact [data-social=facebook]'),"ikon Facebook dipapar");
 ok(!(await vis(pg,'#view-contact [data-social=instagram]')),"URL tidak sah disembunyikan");
 ok(!(await vis(pg,'#view-contact [data-social=tiktok]')),"TikTok kosong disembunyikan");
 await pg.evaluate(()=>openPrivacyModal());
 const ph=await pg.innerHTML("#privacy-cms");
 ok(ph.includes("<strong>Data:</strong>")&&!ph.includes("<script>")&&await vis(pg,"#privacy-cms")&&!(await vis(pg,"#privacy-default")),"privasi CMS (selamat XSS)");
 await pg.evaluate(()=>closePrivacyModal());
 await pg.evaluate(()=>{showView('view-home');toggleLanguage();});await pg.waitForTimeout(200);
 ok((await pg.textContent("[data-i18n=tag_official]"))==="Official Portal","EN kosong = Inggeris asal");
 ok((await pg.textContent("[data-i18n=hero_title]"))==="Welcome to E-Bintong","EN tajuk asal + nama baru");
 ok((await pg.textContent("[data-i18n=hero_subtitle]"))==="Service for all","EN sub-tajuk CMS");
 ok((await pg.textContent("#text-enter-system"))==="Enter System","kad 1 EN asal");
 ok((await pg.textContent("#footer-note"))==="Lot 1, Bintong","nota footer EN kosong = ... ");
 ok(errs.filter(e=>!/Firebase/.test(e)).length===0,"tiada ralat JS: "+errs.join("|"));
  await ctx.close();

 console.log("3) Admin ikut warna CMS");
 ({pg,ctx,errs}=await open("http://localhost:8791/admin/","admin"));
 const bb=await pg.$eval("body",()=>{const e=document.querySelector(".bg-brand");return e?getComputedStyle(e).backgroundColor:"tiada"});
 ok(bb==="rgb(15, 123, 63)","admin .bg-brand = warna utama ("+bb+")");
 ok(await pg.evaluate(()=>brandHex('primary'))==="#0f7b3f","brandHex untuk carta/PDF");
 ok((await pg.title()).startsWith("E-Bintong"),"tajuk admin");
 ok(errs.filter(e=>!/Firebase|Chart|XLSX|html2pdf/.test(e)).length===0,"tiada ralat JS: "+errs.join("|"));
 await ctx.close();
 await br.close();srv.close();
 console.log(`\n${pass} lulus, ${fail} gagal`);process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
