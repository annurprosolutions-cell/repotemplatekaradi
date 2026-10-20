const fs=require("fs"),path=require("path"),http=require("http");const {chromium}=require("playwright");
// Dipanggil oleh cms-features-test.js — ujian halaman yang dijana (artikel, SEO, ikon PWA).
const ROOT=process.argv[2];const css=fs.readFileSync(path.join(process.argv[3],"portal.css"),"utf8");
const types={".html":"text/html",".js":"application/javascript",".json":"application/json",".svg":"image/svg+xml",".png":"image/png",".webmanifest":"application/manifest+json",".xml":"application/xml",".txt":"text/plain"};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u.endsWith("/"))u+="index.html";const f=path.join(ROOT,u);
 if(!fs.existsSync(f)){r.writeHead(404);return r.end()}r.writeHead(200,{"content-type":types[path.extname(f)]||"application/octet-stream"});r.end(fs.readFileSync(f))}).listen(8792);
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?"  ✓":"  ✗",m)};
(async()=>{const br=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});const ctx=await br.newContext();const pg=await ctx.newPage();const errs=[],bad=[];
 pg.on("pageerror",e=>errs.push(e.message));pg.on("response",r=>{if(r.url().includes("localhost")&&r.status()>=400)bad.push(r.url())});
 await ctx.route("**/*",rt=>{const u=new URL(rt.request().url());if(u.hostname==="localhost")return rt.continue();
  if(u.hostname==="cdn.tailwindcss.com")return rt.fulfill({contentType:"application/javascript",body:`window.tailwind={};var s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s);`});return rt.abort()});
 await pg.goto("http://localhost:8792/artikel/gotong-royong-perdana/");await pg.waitForTimeout(800);
 ok((await pg.textContent("h1")).includes("Gotong-Royong Perdana"),"tajuk artikel");
 ok(await pg.$eval("header",e=>getComputedStyle(e).backgroundColor)==="rgb(15, 123, 63)","header ikut warna CMS (brand.js via <base>)");
 ok(await pg.$eval("article img",e=>e.naturalWidth>0),"gambar utama dimuat");
 ok(await pg.$eval("header img",e=>e.naturalWidth>0),"logo dimuat");
 ok((await pg.getAttribute('link[rel=canonical]',"href"))==="https://ebintong.example.my/artikel/gotong-royong-perdana/","canonical");
 ok((await pg.getAttribute('meta[property="og:image"]',"content"))==="https://ebintong.example.my/assets/uploads/logo.png","og:image mutlak");
 const ld=JSON.parse(await pg.textContent('script[type="application/ld+json"]'));ok(ld["@type"]==="Article"&&ld.datePublished==="2026-10-18","JSON-LD Article");
 ok((await pg.title()).startsWith("Gotong-Royong Perdana"),"tajuk tab: "+await pg.title());
 await pg.click("text=Semua artikel");await pg.waitForTimeout(500);ok(pg.url().endsWith("/artikel/")&&(await pg.$$("main a[href^='artikel/']")).length>=2,"senarai artikel");
 await pg.goto("http://localhost:8792/");await pg.waitForTimeout(800);
 ok(await pg.isVisible("#artikel-terkini"),"seksyen artikel terkini di halaman utama");
 ok((await pg.getAttribute('link[rel="icon"][data-built]',"href"))==="assets/icons/favicon-32.png","favicon dari ikon jana (tidak ditimpa brand.js)");
 const man=await (await pg.request.get("http://localhost:8792/manifest.webmanifest")).json();ok(man.icons.length===3,"manifest PWA");
 for(const i of man.icons){const r=await pg.request.get("http://localhost:8792/"+i.src);ok(r.status()===200,"ikon "+i.src)}
 ok(bad.length===0,"tiada 404: "+bad.join(","));ok(errs.filter(e=>!/Firebase/.test(e)).length===0,"tiada ralat JS: "+errs.join("|"));
 await br.close();srv.close();console.log(`\n${pass} lulus, ${fail} gagal`);process.exit(fail?1:0)})().catch(e=>{console.error(e);process.exit(1)});
