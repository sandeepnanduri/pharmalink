/**
 * Generates the raster branding assets from the master SVG mark:
 *   - favicon.ico            (16/32/48, PNG-packed ICO)
 *   - apple-icon.png         (180)
 *   - icon-192 / icon-512    (PWA manifest)
 *   - opengraph-image.png    (1200x630, social/link preview)
 *
 * Run: node scripts/gen-branding.mjs   (also wired as `npm run branding`)
 * sharp ships with Next, so there is no extra dependency.
 */
import sharp from 'sharp';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const APP = path.join(process.cwd(), 'src', 'app');
const mark = readFileSync(path.join(APP, 'icon.svg'));

async function png(size) {
  return sharp(mark, { density: 384 }).resize(size, size).png().toBuffer();
}

/** Minimal ICO container that embeds PNG images (supported since Windows Vista). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  const blobs = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 == 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    blobs.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

const OG_SVG = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1E1B4B"/>
      <stop offset="0.55" stop-color="#312E81"/>
      <stop offset="1" stop-color="#1E3A8A"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.1" r="0.6">
      <stop offset="0" stop-color="#06B6D4" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#06B6D4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="chip" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4F46E5"/>
      <stop offset="1" stop-color="#06B6D4"/>
    </linearGradient>
    <clipPath id="cap"><rect x="146" y="196" width="220" height="120" rx="60"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <g transform="translate(80 60) scale(0.34)">
    <rect width="512" height="512" rx="116" fill="url(#chip)"/>
    <g transform="rotate(-45 256 256)">
      <g clip-path="url(#cap)">
        <rect x="146" y="196" width="110" height="120" fill="#ffffff"/>
        <rect x="256" y="196" width="110" height="120" fill="#CFFAFE"/>
      </g>
      <line x1="256" y1="198" x2="256" y2="314" stroke="#0891B2" stroke-width="8" stroke-opacity="0.45"/>
    </g>
  </g>
  <text x="270" y="150" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="800" fill="#ffffff">PharmaLink <tspan fill="#22D3EE">Global</tspan></text>

  <text x="82" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="66" font-weight="800" fill="#ffffff">The B2B marketplace for</text>
  <text x="82" y="410" font-family="Segoe UI, Arial, sans-serif" font-size="66" font-weight="800" fill="#ffffff">GMP-verified pharma ingredients</text>
  <text x="82" y="470" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="500" fill="#C7D2FE">APIs · Intermediates · KSMs · Excipients — sourced from verified suppliers</text>

  <g font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" fill="#E0E7FF">
    <rect x="82" y="520" width="200" height="52" rx="26" fill="#ffffff" fill-opacity="0.1"/>
    <text x="110" y="553">US FDA GMP</text>
    <rect x="300" y="520" width="150" height="52" rx="26" fill="#ffffff" fill-opacity="0.1"/>
    <text x="326" y="553">EU GMP</text>
    <rect x="468" y="520" width="150" height="52" rx="26" fill="#ffffff" fill-opacity="0.1"/>
    <text x="494" y="553">WHO PQ</text>
    <rect x="636" y="520" width="140" height="52" rx="26" fill="#ffffff" fill-opacity="0.1"/>
    <text x="662" y="553">NMPA</text>
  </g>
</svg>`;

async function main() {
  const ico = buildIco([
    { size: 16, data: await png(16) },
    { size: 32, data: await png(32) },
    { size: 48, data: await png(48) },
  ]);
  writeFileSync(path.join(APP, 'favicon.ico'), ico);

  writeFileSync(path.join(APP, 'apple-icon.png'), await png(180));
  writeFileSync(path.join(process.cwd(), 'public', 'icon-192.png'), await png(192));
  writeFileSync(path.join(process.cwd(), 'public', 'icon-512.png'), await png(512));

  writeFileSync(path.join(APP, 'opengraph-image.png'), await sharp(Buffer.from(OG_SVG)).png().toBuffer());
  // Twitter uses the same card.
  writeFileSync(path.join(APP, 'twitter-image.png'), readFileSync(path.join(APP, 'opengraph-image.png')));

  console.log('Branding assets generated: favicon.ico, apple-icon.png, icon-192/512.png, opengraph-image.png, twitter-image.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
