import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const font = await readFile('node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2')
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
try {
  const page = await browser.newPage()
  for (const size of [192, 512]) {
    const png = await page.evaluate(async ({ font, size }) => {
      const face = new FontFace('Instrument Serif', `url(data:font/woff2;base64,${font})`)
      document.fonts.add(await face.load())
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.scale(size / 512, size / 512)
      ctx.fillStyle = '#654532'
      ctx.fillRect(0, 0, 512, 512)
      // Everything essential sits within the Android maskable safe circle.
      ctx.strokeStyle = '#dfb58e'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(224, 126); ctx.lineTo(280, 126); ctx.lineTo(280, 144)
      ctx.bezierCurveTo(280, 179, 224, 179, 224, 144); ctx.closePath()
      ctx.moveTo(280, 132); ctx.bezierCurveTo(307, 127, 307, 155, 280, 153)
      ctx.moveTo(217, 181); ctx.lineTo(294, 181)
      ctx.moveTo(244, 108); ctx.bezierCurveTo(237, 99, 250, 96, 245, 87)
      ctx.moveTo(263, 108); ctx.bezierCurveTo(256, 99, 269, 96, 264, 87)
      ctx.stroke()
      ctx.fillStyle = '#fff7e9'
      ctx.textAlign = 'center'
      ctx.font = '88px "Instrument Serif"'
      ctx.fillText('Espresso', 256, 285)
      ctx.fillText('Diary', 256, 365)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { font: font.toString('base64'), size })
    await writeFile(`public/espresso-diary-${size}.png`, Buffer.from(png, 'base64'))
    // Preserve URLs used by older installations and offline clients.
    await writeFile(`public/icon-${size}.png`, Buffer.from(png, 'base64'))
  }
} finally { await browser.close() }
