import { deflateSync } from 'zlib';

export interface RGB { r: number; g: number; b: number; }

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Minimal RGBA PNG encoder (no external dependencies) */
export function encodePng(width: number, height: number, pixels: Buffer): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export class Canvas {
  readonly width: number;
  readonly height: number;
  private data: Buffer;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
  }

  set(x: number, y: number, color: RGB, alpha = 255): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = color.r;
    this.data[i + 1] = color.g;
    this.data[i + 2] = color.b;
    this.data[i + 3] = alpha;
  }

  blend(x: number, y: number, color: RGB, alpha: number): void {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const srcA = alpha / 255;
    const dstA = this.data[i + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) return;
    this.data[i] = Math.round((color.r * srcA + this.data[i] * dstA * (1 - srcA)) / outA);
    this.data[i + 1] = Math.round((color.g * srcA + this.data[i + 1] * dstA * (1 - srcA)) / outA);
    this.data[i + 2] = Math.round((color.b * srcA + this.data[i + 2] * dstA * (1 - srcA)) / outA);
    this.data[i + 3] = Math.round(outA * 255);
  }

  /** Vertical gradient background */
  gradientV(top: string, bottom: string): void {
    const c1 = hexToRgb(top);
    const c2 = hexToRgb(bottom);
    for (let y = 0; y < this.height; y++) {
      const t = y / Math.max(1, this.height - 1);
      this.set(0, y, {
        r: Math.round(c1.r + (c2.r - c1.r) * t),
        g: Math.round(c1.g + (c2.g - c1.g) * t),
        b: Math.round(c1.b + (c2.b - c1.b) * t),
      });
      for (let x = 1; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        this.data[i] = this.data[(y * this.width) * 4];
        this.data[i + 1] = this.data[(y * this.width) * 4 + 1];
        this.data[i + 2] = this.data[(y * this.width) * 4 + 2];
        this.data[i + 3] = 255;
      }
    }
  }

  fillRect(x0: number, y0: number, w: number, h: number, color: string, alpha = 255): void {
    const c = hexToRgb(color);
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) {
        this.set(x, y, c, alpha);
      }
    }
  }

  fillCircle(cx: number, cy: number, radius: number, color: string, alpha = 255): void {
    const c = hexToRgb(color);
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) this.set(x, y, c, alpha);
      }
    }
  }

  ring(cx: number, cy: number, radius: number, thickness: number, color: string, alpha = 255): void {
    const c = hexToRgb(color);
    for (let y = Math.floor(cy - radius - thickness); y <= Math.ceil(cy + radius + thickness); y++) {
      for (let x = Math.floor(cx - radius - thickness); x <= Math.ceil(cx + radius + thickness); x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d <= radius + thickness / 2 && d >= radius - thickness / 2) this.set(x, y, c, alpha);
      }
    }
  }

  /** Thick line from (x0,y0) to (x1,y1) */
  line(x0: number, y0: number, x1: number, y1: number, thickness: number, color: string, alpha = 255): void {
    const c = hexToRgb(color);
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
    const r = thickness / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      this.fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, color, alpha);
    }
    void c;
  }

  /** Polygon fill (even-odd scanline) */
  fillPoly(points: Array<[number, number]>, color: string, alpha = 255): void {
    const c = hexToRgb(color);
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i];
        const [x2, y2] = points[(i + 1) % points.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) {
          this.set(x, y, c, alpha);
        }
      }
    }
  }

  toPng(): Buffer {
    return encodePng(this.width, this.height, this.data);
  }
}

export type WeaponShape = 'axe' | 'blade';

/**
 * Procedural weapon silhouettes used for mod icon, poster and inventory icons.
 * All coordinates are normalized (-1..1) and scaled around the canvas center.
 */
export function drawWeapon(canvas: Canvas, shape: WeaponShape, cx: number, cy: number, scale: number): void {
  if (shape === 'axe') {
    // Handle (diagonal wooden shaft)
    const hx0 = cx - 0.28 * scale, hy0 = cy + 0.75 * scale;
    const hx1 = cx + 0.30 * scale, hy1 = cy - 0.60 * scale;
    canvas.line(hx0, hy0, hx1, hy1, 0.13 * scale, '#6e533b');
    canvas.line(hx0, hy0, hx1, hy1, 0.05 * scale, '#8a6b4a');

    // Blade (steel head anchored near the top of the handle)
    const pts: Array<[number, number]> = [
      [hx1 - 0.10 * scale, hy1 - 0.10 * scale],
      [hx1 + 0.52 * scale, hy1 - 0.42 * scale],
      [hx1 + 0.66 * scale, hy1 - 0.02 * scale],
      [hx1 + 0.42 * scale, hy1 + 0.22 * scale],
      [hx1 - 0.08 * scale, hy1 + 0.16 * scale],
    ];
    canvas.fillPoly(pts, '#4a5462');
    const inner: Array<[number, number]> = pts.map(([x, y]) => [x - 0.04 * scale, y + 0.02 * scale]);
    canvas.fillPoly(inner, '#9aa5b1');
    // Cutting edge highlight
    canvas.line(hx1 + 0.55 * scale, hy1 - 0.40 * scale, hx1 + 0.60 * scale, hy1 - 0.01 * scale, 0.045 * scale, '#dfe6ee');
  } else {
    // Katana-style curved blade
    const tipX = cx + 0.72 * scale, tipY = cy - 0.62 * scale;
    const baseX = cx - 0.28 * scale, baseY = cy + 0.30 * scale;
    const ctrlX = cx + 0.10 * scale, ctrlY = cy + 0.16 * scale;

    const edge: Array<[number, number]> = [];
    const back: Array<[number, number]> = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const ex = mt * mt * baseX + 2 * mt * t * ctrlX + t * t * tipX;
      const ey = mt * mt * baseY + 2 * mt * t * ctrlY + t * t * tipY;
      edge.push([ex, ey]);
      back.push([ex - 0.16 * scale * (1 - t * 0.4), ey - 0.16 * scale * (1 - t * 0.4)]);
    }
    canvas.fillPoly([...back, ...edge.slice().reverse()], '#5b6470');
    canvas.fillPoly(edge.map(([x, y]) => [x - 0.055 * scale, y - 0.055 * scale]), '#aab4c0');
    canvas.line(tipX - 0.05 * scale, tipY - 0.02 * scale, baseX, baseY, 0.03 * scale, '#e6ecf3');

    // Guard + handle
    const gx = baseX - 0.06 * scale, gy = baseY + 0.09 * scale;
    canvas.fillCircle(gx, gy, 0.085 * scale, '#2e343d');
    canvas.fillCircle(gx, gy, 0.05 * scale, '#4a5462');
    canvas.line(gx - 0.05 * scale, gy + 0.05 * scale, gx - 0.34 * scale, gy + 0.42 * scale, 0.11 * scale, '#30281f');
  }
}

/** Pick silhouette from item categories (e.g. "base:axe", "base:longblade") */
export function shapeFromCategories(categories?: string): WeaponShape {
  const c = (categories || '').toLowerCase();
  if (c.includes('axe')) return 'axe';
  if (c.includes('blade') || c.includes('sword') || c.includes('katana')) return 'blade';
  return 'axe';
}
