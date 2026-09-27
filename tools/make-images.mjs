// Renders the share card (assets/og.png) and the touch icon (assets/apple-touch-icon.png)
// from the HTML templates in this folder. Run once after changing them:
//   python3 -m http.server 8800 --bind 127.0.0.1   (from the repo root)
//   node tools/make-images.mjs                     (needs Playwright installed)
import { chromium } from 'playwright';

const base = process.env.BASE || 'http://127.0.0.1:8800';
const browser = await chromium.launch();
const shots = [
  { url: `${base}/tools/og.html`, path: 'assets/og.png', width: 1200, height: 630 },
  { url: `${base}/tools/touch-icon.html`, path: 'assets/apple-touch-icon.png', width: 180, height: 180 },
];
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
  await page.goto(s.url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: s.path });
  await page.close();
  console.log('wrote', s.path);
}
await browser.close();
