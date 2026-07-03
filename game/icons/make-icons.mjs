// Convert icon-source.svg to PNG sizes for PWA manifest.
// Run with: bun run /home/z/meongdex-game/game/icons/make-icons.mjs
import sharp from '/home/z/my-project/node_modules/sharp/lib/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, 'icon-source.svg');
const svg = readFileSync(svgPath);

// Regular icons (192, 512) — full bleed as designed
await sharp(svg, { density: 384 })
  .resize(192, 192)
  .png()
  .toFile(join(__dirname, 'icon-192.png'));
console.log('wrote icon-192.png');

await sharp(svg, { density: 384 })
  .resize(512, 512)
  .png()
  .toFile(join(__dirname, 'icon-512.png'));
console.log('wrote icon-512.png');

// Maskable icon — add extra padding so the mascot sits within the safe zone.
// We composite the source onto a larger transparent canvas with the bg color,
// then resize. Simpler approach: render source scaled to 70% on a full bg.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#E8804C"/>
  <g transform="translate(76 76) scale(0.703)">
    ${svg.toString('utf-8').replace(/<\?xml[^>]*\?>/, '').replace(/<svg[^>]*>/, '').replace('</svg>', '')}
  </g>
</svg>`;
await sharp(Buffer.from(maskableSvg), { density: 384 })
  .resize(512, 512)
  .png()
  .toFile(join(__dirname, 'icon-maskable.png'));
console.log('wrote icon-maskable.png');

// Apple touch icon (180) — opaque bg
await sharp(svg, { density: 384 })
  .resize(180, 180)
  .png()
  .toFile(join(__dirname, 'apple-touch-icon.png'));
console.log('wrote apple-touch-icon.png');

// favicon 32
await sharp(svg, { density: 384 })
  .resize(32, 32)
  .png()
  .toFile(join(__dirname, 'favicon-32.png'));
console.log('wrote favicon-32.png');

console.log('all icons generated');
