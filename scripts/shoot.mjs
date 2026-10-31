// Takes desktop and phone screenshots of each live project and composes a
// clean device mockup for the profile README. Runs in GitHub Actions.
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";

const projects = JSON.parse(await readFile(new URL("./projects.json", import.meta.url)));
const OUT = "profile/projects";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

async function shoot(p, viewport, mobile) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: mobile ? 3 : 1.5,
    isMobile: mobile,
    hasTouch: mobile,
    locale: p.locale ?? "en-US",
    reducedMotion: "no-preference",
  });
  // Skip one-time intro animations.
  await ctx.addInitScript((keys) => {
    try {
      for (const k of keys) sessionStorage.setItem(k, "1");
    } catch {}
  }, p.skipIntro ?? []);
  const page = await ctx.newPage();
  try {
    await page.goto(p.url, { waitUntil: "networkidle", timeout: 60000 });
  } catch {
    await page.goto(p.url, { waitUntil: "load", timeout: 60000 });
  }
  if (p.scrollTo) {
    await page.evaluate((y) => window.scrollTo(0, y), p.scrollTo);
  }
  // Let images, fonts, and 3D settle.
  await page.waitForTimeout(p.wait ?? 4500);
  const buf = await page.screenshot({ type: "jpeg", quality: 90 });
  await ctx.close();
  return buf.toString("base64");
}

function mockupHtml(p, desk, phone) {
  const host = new URL(p.url).host + new URL(p.url).pathname.replace(/\/$/, "");
  // On right-to-left sites the hero text sits on the right, so the phone goes left.
  const rtl = (p.locale ?? "").startsWith("ar");
  const winSide = rtl ? "right:90px" : "left:90px";
  const phoneSide = rtl ? "left:90px" : "right:90px";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1600px;height:1000px;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,sans-serif;
    background:radial-gradient(circle at 15% 10%, ${p.accent}55, transparent 55%),radial-gradient(circle at 90% 90%, ${p.accent2 ?? p.accent}44, transparent 50%),#0b1020;}
  .grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:48px 48px}
  .win{position:absolute;${winSide};top:90px;width:1230px;border-radius:18px;overflow:hidden;background:#fff;
    box-shadow:0 60px 120px -30px #000c, 0 0 0 1px #ffffff1a}
  .bar{height:46px;background:#1b2133;display:flex;align-items:center;gap:9px;padding:0 18px}
  .dot{width:13px;height:13px;border-radius:50%}
  .url{margin-left:22px;flex:1;max-width:620px;height:28px;border-radius:8px;background:#0f1424;color:#9aa4bd;font-size:14px;display:flex;align-items:center;padding:0 14px;gap:8px}
  .win img{display:block;width:1230px;height:769px;object-fit:cover;object-position:top}
  .phone{position:absolute;${phoneSide};bottom:60px;width:300px;height:620px;border-radius:46px;background:#05070d;padding:11px;
    box-shadow:0 50px 100px -20px #000e, 0 0 0 2px #ffffff22}
  .phone img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:36px;display:block}
  .notch{position:absolute;top:22px;left:50%;transform:translateX(-50%);width:92px;height:26px;border-radius:20px;background:#05070d;z-index:2}
  </style></head><body><div class="grid"></div>
  <div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>
  <div class="url">🔒 ${host}</div></div><img src="data:image/jpeg;base64,${desk}"></div>
  <div class="phone"><div class="notch"></div><img src="data:image/jpeg;base64,${phone}"></div>
  </body></html>`;
}

for (const p of projects) {
  try {
    console.log("Shooting", p.slug);
    const desk = await shoot(p, { width: 1440, height: 900 }, false);
    const phone = await shoot(p, { width: 390, height: 844 }, true);
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setContent(mockupHtml(p, desk, phone), { waitUntil: "load" });
    await page.screenshot({ path: `${OUT}/${p.slug}.jpg`, type: "jpeg", quality: 86 });
    await ctx.close();
  } catch (e) {
    console.error("Failed", p.slug, e.message);
  }
}

await browser.close();
