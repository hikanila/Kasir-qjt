import type { Product } from '../types'

export function findByBarcode(products: Product[], code: string): { p: Product; u: number } | null {
  const c = code.trim()
  if (!c) return null
  for (const p of products) {
    const u = p.units.findIndex((x) => x.barcode && x.barcode === c)
    if (u >= 0) return { p, u }
  }
  return null
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function searchProducts(products: Product[], q: string, limit = 30): Product[] {
  const words = norm(q).split(' ').filter(Boolean)
  if (!words.length) return []
  return products
    .filter((p) => {
      const hay = norm(`${p.nama} ${p.kategori || ''} ${p.units.map((u) => u.barcode || '').join(' ')}`)
      return words.every((w) => hay.includes(w))
    })
    .sort((a, b) => {
      const qa = norm(a.nama).startsWith(words[0]) ? 0 : 1
      const qb = norm(b.nama).startsWith(words[0]) ? 0 : 1
      return qa - qb || a.nama.localeCompare(b.nama)
    })
    .slice(0, limit)
}
