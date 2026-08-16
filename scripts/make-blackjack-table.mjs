// Draws public/blackjack/table.png — the blackjack table the game is played on.
//
// Run with:  node scripts/make-blackjack-table.mjs
//
// The table is drawn rather than photographed so it matches the cast: flat colour, one hard
// ink outline, no gradients finer than the characters carry. pages/newsite/blackjack.vue
// positions the hands and the cast against measurements taken from the output of this script
// — the felt's depth and the tabletop's far edge — so if you change the geometry here, re-run
// the measurements before trusting the page's percentages.
//
// The payout legends are laid out glyph by glyph rather than with <textPath>, because the
// rasteriser behind sharp does not implement textPath: it drops the element silently, which
// is how the first attempt came out with no writing on the felt at all.
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const W = 900
const H = 470

/** Text along an ellipse arc, centred on `mid` degrees and reading left to right. */
function arcText (str, { cx, cy, rx, ry, from, to, size, fill, stroke, weight = 'bold', spread = 1 }) {
  const chars = [...str]
  const out = []
  for (let i = 0; i < chars.length; i++) {
    const t = chars.length === 1 ? 0.5 : i / (chars.length - 1)
    const a = (from + (to - from) * t) * Math.PI / 180
    const x = cx + rx * Math.cos(a)
    const y = cy + ry * Math.sin(a)
    // Direction of travel along the arc, in degrees, so glyphs lean with the curve. The
    // angle runs downwards, so this is the NEGATED derivative — the other sign puts every
    // letter upside down.
    const rot = Math.atan2(-ry * Math.cos(a), rx * Math.sin(a)) * 180 / Math.PI
    const ch = chars[i] === '&' ? '&amp;' : chars[i]
    out.push(
      `<text x="0" y="0" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})" ` +
      `font-family="DejaVu Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" ` +
      `fill="${fill}" stroke="${stroke}" stroke-width="${(size * 0.13).toFixed(1)}" paint-order="stroke" ` +
      `text-anchor="middle" letter-spacing="${spread}">${ch}</text>`
    )
  }
  return out.join('\n    ')
}

/** The seven betting boxes, fanned along the players' arc and turned to face the dealer. */
function bettingBoxes () {
  const out = []
  for (let i = -3; i <= 3; i++) {
    const t = i / 3
    const x = 450 + t * 300
    const y = 262 - t * t * 62      // the arc rises toward the ends, like the felt's edge
    const rot = t * 32
    out.push(
      `<rect x="-25" y="-16" width="50" height="32" rx="8" ` +
      `transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})" />`
    )
  }
  return out.join('\n      ')
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="felt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#41BFB1"/>
      <stop offset="0.5" stop-color="#2E9E93"/>
      <stop offset="1" stop-color="#1F776F"/>
    </linearGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8B5340"/>
      <stop offset="0.35" stop-color="#5C3226"/>
      <stop offset="1" stop-color="#3B2018"/>
    </linearGradient>
  </defs>

  <!-- legs -->
  <g stroke="#120A08" stroke-width="7" stroke-linejoin="round">
    <path d="M 256 300 L 240 452 L 292 452 L 298 300 Z" fill="#3B2118"/>
    <path d="M 644 300 L 660 452 L 608 452 L 602 300 Z" fill="#3B2118"/>
    <rect x="292" y="372" width="316" height="32" rx="6" fill="#2E1912"/>
  </g>

  <!-- tabletop: dealer beyond the long edge at the top, players around the arc below -->
  <path d="M 40 138 C 40 92 108 66 176 60 C 268 52 350 56 450 56
           C 550 56 632 52 724 60 C 792 66 860 92 860 138
           C 860 240 690 320 450 320 C 210 320 40 240 40 138 Z"
        fill="url(#rail)" stroke="#120A08" stroke-width="9" stroke-linejoin="round"/>
  <path d="M 58 132 C 58 96 116 76 180 70 C 270 62 350 66 450 66
           C 550 66 630 62 720 70 C 784 76 842 96 842 132"
        fill="none" stroke="#9C6049" stroke-width="11" stroke-linecap="round" opacity="0.8"/>

  <!-- felt -->
  <path d="M 76 140 C 76 106 134 88 192 83 C 276 76 352 80 450 80
           C 548 80 624 76 708 83 C 766 88 824 106 824 140
           C 824 224 672 292 450 292 C 228 292 76 224 76 140 Z"
        fill="url(#felt)" stroke="#120A08" stroke-width="7" stroke-linejoin="round"/>

  <!-- dealer's furniture, just inside the far edge -->
  <g stroke="#120A08" stroke-width="6" stroke-linejoin="round">
    <rect x="298" y="96" width="60" height="26" rx="5" fill="#E8DCCB"/>
    <rect x="380" y="94" width="140" height="30" rx="7" fill="#E8DCCB"/>
    <g stroke="#B9A88F" stroke-width="4">
      <line x1="402" y1="100" x2="402" y2="118"/>
      <line x1="426" y1="100" x2="426" y2="118"/>
      <line x1="450" y1="100" x2="450" y2="118"/>
      <line x1="474" y1="100" x2="474" y2="118"/>
      <line x1="498" y1="100" x2="498" y2="118"/>
    </g>
    <path d="M 540 96 L 596 96 L 606 124 L 550 124 Z" fill="#7C5CBF"/>
    <path d="M 550 102 L 592 102 L 596 113 L 554 113 Z" fill="#3E2E63"/>
  </g>

  <!-- payout legends -->
  <g>
    ${arcText('BLACKJACK PAYS 3 TO 2', { cx: 450, cy: 62, rx: 250, ry: 118, from: 152, to: 28, size: 30, fill: '#E8342A', stroke: '#120A08' })}
  </g>
  <g>
    ${arcText('INSURANCE PAYS 2 TO 1', { cx: 450, cy: 96, rx: 250, ry: 118, from: 148, to: 32, size: 21, fill: '#FFCC33', stroke: '#120A08' })}
  </g>

  <!-- betting boxes -->
  <g fill="none" stroke="#FFF8E7" stroke-width="5">
      ${bettingBoxes()}
  </g>
</svg>
`

// Only on request: the PNG is the asset, and a served copy of the SVG would just be weight.
if (process.env.BJ_SVG_OUT) writeFileSync(process.env.BJ_SVG_OUT, svg)

const png = await sharp(Buffer.from(svg), { density: 220 }).png().toBuffer()
const info = await sharp(png)
  .trim({ threshold: 1 })
  .resize({ width: 900, fit: 'inside', withoutEnlargement: true })
  // Flat art with a handful of colours: a palette gets it to a fifth the size with no
  // visible loss, and this is served on every hand.
  .png({ compressionLevel: 9, palette: true, quality: 92 })
  .toFile(process.env.BJ_PNG_OUT || 'public/blackjack/table.png')
console.log(`${info.width}x${info.height}`, `${(info.size / 1024).toFixed(1)}kB`)
