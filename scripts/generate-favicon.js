// Generates images/favicon-explorer.png: the shared GospelGo "Gg" mark
// (images/Gg4_512.png, left untouched - it's also used as the header
// "by gospelgo" link icon) with three pin-line-style bars overlaid in its
// inner white cutout, so this app's tab is distinguishable from sibling
// GospelGo apps (which all use the plain, unmodified Gg mark) in a browser
// tab strip.
//
// Bar placement/size was tuned empirically against real favicon display
// sizes (16/24/32px), not just how it looks at full 512px resolution - at
// 16px, thin single-pixel-ish lines (matching the app's actual 8px pin-line
// CSS, scaled down) completely disappear. These bars are deliberately much
// bolder/taller than the in-app pin-lines to survive that downscale; they're
// a reference to the motif, not a literal reproduction of it.
//
// Run with `node scripts/generate-favicon.js` whenever the source logo or
// bar styling changes. Requires Playwright (not a project dependency -
// install with `npm install playwright` if missing).
const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('playwright');

const SOURCE_LOGO = path.join(__dirname, '..', 'images', 'Gg4_512.png');
const OUTPUT_PATH = path.join(__dirname, '..', 'images', 'favicon-explorer.png');

const ORANGE = 'rgb(255,150,40)'; // matches .pin-line--ot's hue (OT verse refs)
const CYAN = 'rgb(40,220,255)'; // matches .pin-line--nt's hue (NT verse refs)

// Positioned/sized to sit inside the Gg mark's inner white cutout without
// covering the red "go" lettering (verified empirically against the source
// artwork's actual layout - see the comment above).
const BARS = [
  { x: 163, y: 183, w: 122, h: 33, color: ORANGE },
  { x: 163, y: 221, w: 90, h: 33, color: CYAN },
  { x: 163, y: 259, w: 122, h: 33, color: ORANGE }
];

async function main() {
  const logoBase64 = (await fs.readFile(SOURCE_LOGO)).toString('base64');
  const logoDataUrl = `data:image/png;base64,${logoBase64}`;

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();

  const outputDataUrl = await page.evaluate(async ({ logoDataUrl, bars }) => {
    const img = new Image();
    img.src = logoDataUrl;
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 512, 512);

    const drawPill = (x, y, w, h, color) => {
      ctx.fillStyle = color;
      const r = h / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
    };

    for (const bar of bars) {
      drawPill(bar.x, bar.y, bar.w, bar.h, bar.color);
    }

    return canvas.toDataURL('image/png');
  }, { logoDataUrl, bars: BARS });

  await browser.close();

  const outputBase64 = outputDataUrl.replace(/^data:image\/png;base64,/, '');
  await fs.writeFile(OUTPUT_PATH, Buffer.from(outputBase64, 'base64'));
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
