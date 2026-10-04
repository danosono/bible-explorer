// Generates images/favicon-explorer-v3.png: the currently-active favicon.
// Same idea as generate-favicon.js (three pill bars painted onto
// images/Gg4_512.png), but repositioned/restyled after testing the first
// two attempts (generate-favicon.js's centered two-tone bars,
// generate-favicon-v2.js's bars-as-an-"E" on a different source image, and
// a hand-made red "E" - images/Gg4_512_Explorer.png) against real 16x16
// favicon renders rather than full-resolution looks:
//   - Moved to the upper-left corner (overlapping the ring itself, not
//     tucked inside the inner white cutout) - the same corner the hand-made
//     red "E" used, which tested better there than the cutout-centered
//     position.
//   - All three bars the same color (solid orange) instead of alternating
//     orange/cyan/orange - one strong, consistent color block reads more
//     clearly at 16px than two interleaved hues.
//   - Roughly double the previous bar size.
// Verified empirically (render both to a real 16x16 canvas and compare
// pixel-for-pixel, not just scale a full-res `<img>` down, which uses
// blurrier interpolation and undersells the difference): this version's
// solid orange block was the clearest/boldest differentiator of everything
// tried, including the hand-made red "E".
const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('playwright');

const SOURCE_LOGO = path.join(__dirname, '..', 'images', 'Gg4_512.png');
const OUTPUT_PATH = path.join(__dirname, '..', 'images', 'favicon-explorer-v3.png');

const ORANGE = 'rgb(255,150,40)'; // matches .pin-line--ot's hue (OT verse refs)

const BARS = [
  { x: 20, y: 30, w: 244, h: 66, color: ORANGE },
  { x: 20, y: 116, w: 180, h: 66, color: ORANGE },
  { x: 20, y: 202, w: 244, h: 66, color: ORANGE }
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
