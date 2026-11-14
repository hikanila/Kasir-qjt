import type { Product } from '../types'

export const rp = (n: number) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
export const angka = (n: number) => Math.round(n || 0).toLocaleString('id-ID')
export const qtyFmt = (n: number) =>
  (Math.round((n || 0) * 100) / 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

const pad = (n: number) => String(n).padStart(2, '0')

export const tgl = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}
export const jam = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const tglJam = (t: number) => `${tgl(t)} ${jam(t)}`

/** Nomor transaksi unik walau dibuat di beberapa perangkat sekaligus saat offline. */
export function noTransaksi(t = Date.now()): string {
  const d = new Date(t)
  const r = Math.random().toString(36).slice(2, 4).toUpperCase()
  return `TRX-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${r}`
}

/** Barcode EAN-13 internal toko (awalan 20–29 khusus pemakaian dalam toko). */
export function buatBarcode(): string {
  let s = '2' + Math.floor(Math.random() * 10)
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10)
  return s + eanCheck(s)
}
export function eanCheck(d12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 ? 3 : 1)
  return (10 - (sum % 10)) % 10
}
export const isEan13 = (s: string) => /^\d{13}$/.test(s) && eanCheck(s.slice(0, 12)) === Number(s[12])

export function stokLabel(p: Product): string {
  const dasar = p.units[0]?.nama || ''
  const base = `${qtyFmt(p.stok)} ${dasar}`
  const besar = [...p.units].sort((a, b) => b.isi - a.isi)[0]
  if (besar && besar.isi > 1 && Math.abs(p.stok) >= besar.isi) {
    return `${base} (≈ ${qtyFmt(p.stok / besar.isi)} ${besar.nama})`
  }
  return base
}

export function hpKe62(hp?: string): string {
  if (!hp) return ''
  let d = hp.replace(/\D/g, '')
  if (d.startsWith('0')) d = '62' + d.slice(1)
  else if (d.startsWith('8')) d = '62' + d
  return d
}

export function startOfDay(t = Date.now()) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export const parseAngka = (s: string) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
