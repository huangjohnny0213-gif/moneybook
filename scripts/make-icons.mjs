/**
 * 產生 PWA 的 icon。
 *
 * 為什麼自己寫 PNG 編碼而不裝 sharp／resvg：這個圖案只有實心膠囊，
 * 為了它多背一個含原生模組的相依套件不划算，而且 CI 上還要多編譯一次。
 * Node 內建的 zlib 已經夠寫出一個合法的 PNG。
 *
 * 為什麼不用瀏覽器截圖：截圖會被 devicePixelRatio 影響，說好的 512 可能吐出
 * 1024，而且無法在沒有圖形環境的地方重跑。這裡的輸出是像素級決定性的。
 *
 * 改配色或比例就改下面的 ICON 常數，然後重跑：
 *   /home/huang/.local/share/pnpm/pnpm icons
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/**
 * 圖案規格，全部用邊長的比例表示，一份規格就能出所有尺寸。
 *
 * 圖案是分類排行的三根長條 —— App 裡最有辨識度的畫面。不畫中文字是因為
 * 主畫面上的 icon 只有 60pt，一個「記」字在那個尺寸會糊成一團墨。
 *
 * 底色刻意滿版不透明：iOS 會把透明處補成黑色，自己控制底色才知道最後長怎樣。
 * 也刻意不畫圓角，iOS 與 Android 都會自己套遮罩，自己再畫一次會變成圓角疊圓角。
 */
const ICON = {
  background: '#121211',
  x: 0.22,
  top: 0.28,
  barHeight: 0.1,
  gap: 0.07,
  // 顏色取自 lib/palette.ts 的 CATEGORICAL_DARK 前三色。
  bars: [
    { width: 0.56, color: '#3987e5' },
    { width: 0.4, color: '#d95926' },
    { width: 0.26, color: '#199e70' },
  ],
}

/**
 * 每個像素切成 4×4 取樣再平均。
 *
 * 膠囊的圓頭是曲線，只取像素中心點的話 192px 的版本會出現明顯鋸齒，
 * 而 icon 正是會被放大檢視的東西。
 */
const SUBSAMPLES = 4

function parseHex(hex) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** 膠囊：兩端圓心連線的距離場，半徑就是高度的一半。 */
function capsuleCoverage(px, py, bar) {
  const radius = (bar.y1 - bar.y0) / 2
  const cy = bar.y0 + radius
  const left = bar.x0 + radius
  const right = bar.x1 - radius
  const cx = Math.min(Math.max(px, left), right)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= radius * radius
}

function renderPixels(size) {
  const background = parseHex(ICON.background)
  const bars = ICON.bars.map((bar, index) => ({
    x0: ICON.x * size,
    x1: (ICON.x + bar.width) * size,
    y0: (ICON.top + index * (ICON.barHeight + ICON.gap)) * size,
    y1: (ICON.top + index * (ICON.barHeight + ICON.gap) + ICON.barHeight) * size,
    rgb: parseHex(bar.color),
  }))

  // 只存 RGB 不存 alpha：icon 是滿版不透明的，多一個通道只是讓檔案變大。
  const pixels = Buffer.alloc(size * size * 3)
  const step = 1 / SUBSAMPLES
  const total = SUBSAMPLES * SUBSAMPLES

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hit = 0
      let rgb = null
      for (let sy = 0; sy < SUBSAMPLES; sy += 1) {
        for (let sx = 0; sx < SUBSAMPLES; sx += 1) {
          const px = x + (sx + 0.5) * step
          const py = y + (sy + 0.5) * step
          for (const bar of bars) {
            if (capsuleCoverage(px, py, bar)) {
              hit += 1
              rgb = bar.rgb
              break
            }
          }
        }
      }
      const offset = (y * size + x) * 3
      if (hit === 0) {
        pixels[offset] = background[0]
        pixels[offset + 1] = background[1]
        pixels[offset + 2] = background[2]
        continue
      }
      // 長條之間有間距，一個像素不可能同時碰到兩根，直接拿最後命中的顏色混合。
      const alpha = hit / total
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(
          rgb[channel] * alpha + background[channel] * (1 - alpha),
        )
      }
    }
  }
  return pixels
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // 每通道 8 bit
  header[9] = 2 // colour type 2 = truecolour，無 alpha
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // 每一列前面要加一個 filter byte。這裡一律用 0（None）：圖案是大片同色，
  // deflate 本來就壓得很好，挑 filter 省下的空間不值得多寫的複雜度。
  const stride = size * 3
  const raw = Buffer.alloc(size * (stride + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function svg(size) {
  const rects = ICON.bars
    .map((bar, index) => {
      const y = ICON.top + index * (ICON.barHeight + ICON.gap)
      return `  <rect x="${ICON.x * size}" y="${(y * size).toFixed(2)}" width="${(bar.width * size).toFixed(2)}" height="${ICON.barHeight * size}" rx="${(ICON.barHeight * size) / 2}" fill="${bar.color}"/>`
    })
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${ICON.background}"/>
${rects}
</svg>
`
}

// apple-touch-icon 是 180×180：iOS 指定的尺寸，給錯它會自己縮放，邊緣會糊。
const OUTPUTS = [
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180],
]

for (const [name, size] of OUTPUTS) {
  const png = encodePng(size, renderPixels(size))
  writeFileSync(join(PUBLIC_DIR, name), png)
  console.log(`${name}  ${size}×${size}  ${png.length} bytes`)
}

writeFileSync(join(PUBLIC_DIR, 'favicon.svg'), svg(64))
console.log('favicon.svg')
