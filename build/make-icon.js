// Converts build/icon-src.png  ->  build/icon.ico (multi-size) + build/icon.png (256).
// Strips the white plate, keeping only the logo strokes (black + blue) on transparency,
// then trims tight and re-pads so the logo fills the icon consistently.
// Run with:  npm run make-icon
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const pngToIco = require('png-to-ico');

(async () => {
  const dir = __dirname;
  const src = path.join(dir, 'icon-src.png');
  if (!fs.existsSync(src)) {
    console.error('Source not found. Save your icon as build/icon-src.png, then run again.');
    process.exit(1);
  }

  const base = await Jimp.read(src);
  const W = base.bitmap.width, H = base.bitmap.height;

  // 1) Remove the white/gray plate: key out light, low-saturation pixels (soft alpha ramp).
  //    Colored (blue) and dark (black) pixels are kept.
  base.scan(0, 0, W, H, function (x, y, idx) {
    const d = this.bitmap.data;
    const r = d[idx], g = d[idx + 1], b = d[idx + 2], a = d[idx + 3];
    if (a === 0) return;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (lum > 170 && sat < 45) {
      d[idx + 3] = Math.min(a, lum >= 205 ? 0 : Math.round(255 * (205 - lum) / 35));
    }
  });

  // 2) Drop faint gray plate/shadow remnants: any low-saturation pixel that isn't
  //    near-solid becomes fully transparent. Solid black logo (alpha 255) and the
  //    blue arrow (high saturation) survive, so the crop hugs the logo itself.
  base.scan(0, 0, W, H, function (x, y, idx) {
    const d = this.bitmap.data;
    const r = d[idx], g = d[idx + 1], b = d[idx + 2], a = d[idx + 3];
    if (a === 0) return;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 45 && a < 210) d[idx + 3] = 0;
  });
  // 3) Crop tight to the logo's actual bounding box (deterministic; autocrop was unreliable).
  let minX = W, minY = H, maxX = 0, maxY = 0, found = false;
  base.scan(0, 0, W, H, function (x, y, idx) {
    if (this.bitmap.data[idx + 3] > 40) {        // a visibly-solid pixel
      found = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  });
  if (found) base.crop(minX, minY, maxX - minX + 1, maxY - minY + 1);
  console.log(`logo cropped to ${base.bitmap.width}x${base.bitmap.height}`);

  // 4) Center the logo on a square canvas with ~10% padding, at each icon size.
  const PAD = 0.9;
  const square = (s) => {
    const inner = Math.round(s * PAD);
    const logo = base.clone().contain(inner, inner);
    const canvas = new Jimp(s, s, 0x00000000);
    canvas.composite(logo, Math.round((s - inner) / 2), Math.round((s - inner) / 2));
    return canvas;
  };

  const sizes = [256, 128, 64, 48, 32, 16];
  const tmp = [];
  for (const s of sizes) {
    const p = path.join(dir, `_ic_${s}.png`);
    await square(s).writeAsync(p);
    tmp.push(p);
  }

  await square(512).writeAsync(path.join(dir, 'icon.png'));   // 512 for Linux launcher icon
  fs.writeFileSync(path.join(dir, 'icon.ico'), await pngToIco(tmp));
  tmp.forEach((f) => { try { fs.unlinkSync(f); } catch {} });

  console.log('Wrote build/icon.ico + build/icon.png');
})().catch((e) => { console.error(e); process.exit(1); });
