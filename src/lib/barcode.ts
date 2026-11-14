import JsBarcode from 'jsbarcode'
import { isEan13 } from './format'

export function barcodeSVG(code: string, opts: { height?: number; width?: number; fontSize?: number } = {}): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  try {
    JsBarcode(svg, code, {
      format: isEan13(code) ? 'EAN13' : 'CODE128',
      height: opts.height ?? 40,
      width: opts.width ?? 1.6,
      fontSize: opts.fontSize ?? 12,
      margin: 2,
      displayValue: true,
    })
  } catch {
    return `<span>${code}</span>`
  }
  return svg.outerHTML
}

let audio: AudioContext | null = null
export function beep(ok = true) {
  try {
    audio ??= new AudioContext()
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.frequency.value = ok ? 1500 : 300
    g.gain.value = 0.15
    o.connect(g).connect(audio.destination)
    o.start()
    o.stop(audio.currentTime + (ok ? 0.08 : 0.25))
  } catch {
    /* tidak masalah */
  }
}
