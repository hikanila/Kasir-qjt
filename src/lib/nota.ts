import type { Sale, Settings } from '../types'
import { angka, hpKe62, jam, qtyFmt, tgl } from './format'

export const LEBAR = 32 // karakter per baris printer thermal 58mm

export interface Line {
  text: string
  bold?: boolean
  big?: boolean
}

const center = (s: string) => {
  s = s.slice(0, LEBAR)
  const l = Math.floor((LEBAR - s.length) / 2)
  return ' '.repeat(l) + s
}
const lr = (a: string, b: string) => {
  const space = LEBAR - a.length - b.length
  return space >= 1 ? a + ' '.repeat(space) + b : a + '\n' + ' '.repeat(Math.max(0, LEBAR - b.length)) + b
}
const wrap = (s: string, w = LEBAR): string[] => {
  const out: string[] = []
  let cur = ''
  for (const word of s.split(/\s+/)) {
    if ((cur + ' ' + word).trim().length > w) {
      if (cur) out.push(cur)
      cur = word
    } else cur = (cur + ' ' + word).trim()
  }
  if (cur) out.push(cur)
  return out
}
const SEP = '-'.repeat(LEBAR)

export function notaLines(sale: Sale, st: Settings, sisaHutangTotal?: number): Line[] {
  const L: Line[] = []
  const push = (text: string, o: Partial<Line> = {}) => text.split('\n').forEach((t) => L.push({ text: t, ...o }))

  push(center(st.namaToko), { bold: true, big: true })
  wrap(st.alamat).forEach((t) => push(center(t)))
  if (st.wa) push(center('WA: ' + st.wa))
  push(SEP)
  push('No: ' + sale.no)
  push(lr(`${tgl(sale.waktu)} ${jam(sale.waktu)}`, 'Kasir: ' + sale.kasir.slice(0, 10)))
  if (sale.pelangganNama) push('Pelanggan: ' + sale.pelangganNama + (sale.metode === 'bon' ? ' (Bon)' : ''))
  if (sale.status === 'batal') push(center('*** DIBATALKAN ***'), { bold: true })
  push(SEP)
  for (const it of sale.items) {
    wrap(it.nama).forEach((t) => push(t))
    push(lr(` ${qtyFmt(it.qty)} ${it.unit} x ${angka(it.harga)}`, angka(it.qty * it.harga)))
  }
  push(SEP)
  if (sale.diskon) {
    push(lr('Subtotal', angka(sale.subtotal)))
    push(lr('Diskon', '-' + angka(sale.diskon)))
  }
  push(lr('TOTAL', angka(sale.total)), { bold: true })
  if (sale.metode === 'tunai') {
    push(lr('Tunai', angka(sale.bayar)))
    push(lr('Kembali', angka(sale.kembali)))
  } else if (sale.metode === 'transfer') {
    push(lr('Transfer/QRIS', angka(sale.total)))
  } else {
    push(lr('Bayar (DP)', angka(sale.bayar)))
    push(lr('SISA BON NOTA INI', angka(sale.total - sale.bayar)), { bold: true })
    if (sisaHutangTotal !== undefined) push(lr('Total hutang', angka(sisaHutangTotal)))
  }
  push(SEP)
  wrap(st.footer).forEach((t) => push(center(t)))
  push(center('Terima kasih atas kunjungan'))
  return L
}

export const notaText = (lines: Line[]) => lines.map((l) => l.text).join('\n')

/** Gambar nota (PNG) — mudah dilihat langsung di chat WhatsApp. */
export function notaImage(lines: Line[]): Promise<Blob> {
  const scale = 2
  const fs = 15
  const lh = 21
  const padX = 18
  const padY = 22
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  ctx.font = `${fs}px "Courier New", monospace`
  const cw = ctx.measureText('M').width
  const w = Math.ceil(cw * LEBAR + padX * 2)
  const h = padY * 2 + lines.reduce((a, l) => a + (l.big ? lh + 8 : lh), 0)
  c.width = w * scale
  c.height = h * scale
  ctx.scale(scale, scale)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#111'
  ctx.textBaseline = 'top'
  let y = padY
  for (const l of lines) {
    if (l.big) {
      ctx.font = `bold ${fs + 5}px "Courier New", monospace`
      const tw = ctx.measureText(l.text.trim()).width
      ctx.fillText(l.text.trim(), (w - tw) / 2, y)
      y += lh + 8
    } else {
      ctx.font = `${l.bold ? 'bold ' : ''}${fs}px "Courier New", monospace`
      ctx.fillText(l.text, padX, y)
      y += lh
    }
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal membuat gambar'))), 'image/png'))
}

export function download(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

/** Bagikan gambar nota (di HP Android: muncul pilihan WhatsApp). Jika tidak didukung, unduh gambar + buka WA. */
export async function shareNotaImage(sale: Sale, lines: Line[], namaToko: string) {
  const blob = await notaImage(lines)
  const file = new File([blob], `Nota-${sale.no}.png`, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Nota ${sale.no}`, text: `Nota belanja ${namaToko} — ${sale.no}` })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  download(blob, file.name)
  waLink(sale.pelangganHp, `Nota belanja ${namaToko} — ${sale.no} (gambar terlampir)`)
}

export function waLink(hp: string | undefined, text: string) {
  const no = hpKe62(hp)
  window.open(`https://wa.me/${no}?text=${encodeURIComponent(text)}`, '_blank')
}

export function shareNotaText(sale: Sale, lines: Line[]) {
  waLink(sale.pelangganHp, '```\n' + notaText(lines) + '\n```')
}

/** Cetak ke printer / simpan sebagai PDF (ukuran kertas 58mm). */
export function printNota(lines: Line[]) {
  const html = `<div class="nota-print">${lines
    .map((l) => `<div class="${l.bold || l.big ? 'b' : ''}${l.big ? ' big' : ''}">${esc(l.big ? l.text.trim() : l.text) || "&nbsp;"}</div>`)
    .join('')}</div>`
  printHTML(html, '@page{size:58mm auto;margin:2mm}')
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Tampilkan HTML di area cetak lalu panggil dialog cetak browser. */
export function printHTML(html: string, pageCss = '@page{margin:10mm}') {
  const area = document.getElementById('print-area')!
  area.innerHTML = `<style>${pageCss}</style>${html}`
  document.body.classList.add('printing')
  const done = () => {
    document.body.classList.remove('printing')
    area.innerHTML = ''
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  setTimeout(() => window.print(), 50)
}
