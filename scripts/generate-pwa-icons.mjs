#!/usr/bin/env node
/**
 * Generate PWA icon PNGs using only Node.js built-ins (no canvas/sharp needed).
 * Creates solid blue (#2563eb) icons with "iA" text rendered as a simple shield shape.
 *
 * For proper branded icons, replace these with designer-created assets.
 * These are valid PNGs that satisfy PWA installability requirements.
 */

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'public', 'icons');
const SCREENSHOTS_DIR = join(__dirname, '..', 'public', 'screenshots');

// Brand color: #2563eb = rgb(37, 99, 235)
const BRAND_R = 37, BRAND_G = 99, BRAND_B = 235;
const WHITE_R = 255, WHITE_G = 255, WHITE_B = 255;

/**
 * Create a minimal valid PNG file with the given dimensions.
 * Renders a rounded-rect shield shape in brand blue with "iA" letters.
 */
function createPNG(width, height, options = {}) {
  const { isScreenshot = false } = options;

  // Build raw pixel data: each row starts with filter byte (0 = None)
  const rawData = Buffer.alloc((width * 3 + 1) * height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.42;
  const cornerRadius = Math.min(width, height) * 0.12;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 3 + 1);
    rawData[rowOffset] = 0; // filter byte: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      let r, g, b;

      if (isScreenshot) {
        // Screenshot: white background with a centered blue rounded rect
        const rectW = width * 0.8;
        const rectH = height * 0.6;
        const rectX = (width - rectW) / 2;
        const rectY = (height - rectH) / 2;

        if (x >= rectX && x < rectX + rectW && y >= rectY && y < rectY + rectH) {
          r = BRAND_R; g = BRAND_G; b = BRAND_B;
        } else {
          r = 245; g = 247; b = 250; // light gray bg
        }
      } else {
        // Icon: draw a rounded square shield shape
        const inIcon = isInsideRoundedRect(
          x, y,
          centerX - radius, centerY - radius,
          radius * 2, radius * 2,
          cornerRadius
        );

        if (inIcon) {
          // Check if pixel is part of the "iA" text
          const inText = isInLetters(x, y, centerX, centerY, radius);
          if (inText) {
            r = WHITE_R; g = WHITE_G; b = WHITE_B;
          } else {
            r = BRAND_R; g = BRAND_G; b = BRAND_B;
          }
        } else {
          // Background (transparent would be better but we use white for simplicity)
          r = WHITE_R; g = WHITE_G; b = WHITE_B;
        }
      }

      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
    }
  }

  // Compress with zlib
  const compressed = deflateSync(rawData);

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

// CRC32 lookup table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isInsideRoundedRect(px, py, rx, ry, rw, rh, cr) {
  // Check if point (px, py) is inside a rounded rectangle
  if (px < rx || px >= rx + rw || py < ry || py >= ry + rh) return false;

  // Check corners
  const corners = [
    [rx + cr, ry + cr],           // top-left
    [rx + rw - cr, ry + cr],      // top-right
    [rx + cr, ry + rh - cr],      // bottom-left
    [rx + rw - cr, ry + rh - cr], // bottom-right
  ];

  for (const [cx, cy] of corners) {
    const inCornerRegion = (
      (px < rx + cr && py < ry + cr) ||           // top-left
      (px >= rx + rw - cr && py < ry + cr) ||      // top-right
      (px < rx + cr && py >= ry + rh - cr) ||      // bottom-left
      (px >= rx + rw - cr && py >= ry + rh - cr)   // bottom-right
    );
    if (inCornerRegion) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > cr * cr) return false;
    }
  }

  return true;
}

/**
 * Check if a pixel falls within the "iA" letters, scaled to the icon size.
 * Uses simple rectangular regions to approximate the letterforms.
 */
function isInLetters(px, py, cx, cy, r) {
  // Normalize coordinates to -1..1 range relative to icon center
  const nx = (px - cx) / r;
  const ny = (py - cy) / r;

  // Letter "i" (left side): x from -0.55 to -0.25
  // Dot
  if (nx >= -0.48 && nx <= -0.32 && ny >= -0.55 && ny <= -0.38) return true;
  // Stem
  if (nx >= -0.48 && nx <= -0.32 && ny >= -0.25 && ny <= 0.55) return true;

  // Letter "A" (right side): x from -0.05 to 0.55
  const aLeft = -0.05;
  const aRight = 0.55;
  const aMid = (aLeft + aRight) / 2;
  const aTop = -0.55;
  const aBottom = 0.55;
  const strokeW = 0.14;

  // Left leg of A
  {
    const t = (ny - aTop) / (aBottom - aTop); // 0 at top, 1 at bottom
    if (t >= 0 && t <= 1) {
      const legCenter = aMid + (aLeft - aMid) * t; // goes from center to left
      if (nx >= legCenter - strokeW / 2 && nx <= legCenter + strokeW / 2) return true;
    }
  }

  // Right leg of A
  {
    const t = (ny - aTop) / (aBottom - aTop);
    if (t >= 0 && t <= 1) {
      const legCenter = aMid + (aRight - aMid) * t; // goes from center to right
      if (nx >= legCenter - strokeW / 2 && nx <= legCenter + strokeW / 2) return true;
    }
  }

  // Crossbar of A
  {
    const crossY = 0.12;
    if (ny >= crossY - strokeW / 2 && ny <= crossY + strokeW / 2) {
      // Width at crossbar height
      const t = (crossY - aTop) / (aBottom - aTop);
      const leftEdge = aMid + (aLeft - aMid) * t;
      const rightEdge = aMid + (aRight - aMid) * t;
      if (nx >= leftEdge && nx <= rightEdge) return true;
    }
  }

  return false;
}

// Icon sizes required by manifest
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

console.log('Generating PWA icons...');

// Generate main icons
for (const size of ICON_SIZES) {
  const png = createPNG(size, size);
  const path = join(ICONS_DIR, `icon-${size}x${size}.png`);
  writeFileSync(path, png);
  console.log(`  Created ${path} (${png.length} bytes)`);
}

// Generate shortcut icons (upload and dashboard - same icon for now)
const shortcutIcon = createPNG(96, 96);
writeFileSync(join(ICONS_DIR, 'upload.png'), shortcutIcon);
writeFileSync(join(ICONS_DIR, 'dashboard.png'), shortcutIcon);
console.log('  Created shortcut icons (upload.png, dashboard.png)');

// Generate badge icon for notifications
const badgeIcon = createPNG(72, 72);
writeFileSync(join(ICONS_DIR, 'badge-72x72.png'), badgeIcon);
console.log('  Created badge icon (badge-72x72.png)');

// Generate screenshot placeholders
const dashScreenshot = createPNG(1280, 720, { isScreenshot: true });
writeFileSync(join(SCREENSHOTS_DIR, 'dashboard.png'), dashScreenshot);
console.log(`  Created screenshot placeholder (dashboard.png, ${dashScreenshot.length} bytes)`);

const mobileScreenshot = createPNG(390, 844, { isScreenshot: true });
writeFileSync(join(SCREENSHOTS_DIR, 'mobile.png'), mobileScreenshot);
console.log(`  Created screenshot placeholder (mobile.png, ${mobileScreenshot.length} bytes)`);

console.log('\nDone! All PWA icons generated.');
console.log('NOTE: Replace these with designer-created assets for production branding.');
