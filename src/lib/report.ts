/**
 * Laporan penjualan bulanan dalam bentuk Excel (.xlsx).
 * Dipakai di aplikasi (tombol Unduh Excel) dan di skrip backup otomatis (GitHub Actions).
 * Tidak memakai React / DOM agar bisa berjalan di Node.
 */
import type { Customer, Move, Payment, Product, Sale } from '../types'

export interface ReportInput {
  namaToko: string
  judulPeriode: string // cth. "November 2026"
  a: number
  b: number
  sales: Sale[]
  payments: Payment[]
  products: Product[]
  customers: Customer[]
  moves?: Move[]
}

const pad = (n: number) => String(n).padStart(2, '0')
const tglJam = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const RP = '"Rp"#,##0;[Red]-"Rp"#,##0'
const QTY = '#,##0.##'

export function summarize(sales: Sale[], payments: Payment[]) {
  const ok = sales.filter((s) => s.status === 'ok')
  const pay = payments.filter((p) => p.status !== 'batal')
  const sum = (f: (s: Sale) => number) => ok.reduce((a, s) => a + f(s), 0)
  return {
    transaksi: ok.length,
    batal: sales.length - ok.length,
    omzet: sum((s) => s.total),
    tunai: sum((s) => (s.metode === 'tunai' ? s.total : 0)),
    transfer: sum((s) => (s.metode === 'transfer' ? s.total : 0)),
    bonBaru: sum((s) => (s.metode === 'bon' ? s.total - s.bayar : 0)),
    dp: sum((s) => (s.metode === 'bon' ? s.bayar : 0)),
    diskon: sum((s) => s.diskon),
    bayarBon: pay.reduce((a, p) => a + p.jumlah, 0),
    bayarBonTunai: pay.filter((p) => p.metode === 'tunai').reduce((a, p) => a + p.jumlah, 0),
  }
}

/** Buat file Excel; mengembalikan isi file (ArrayBuffer). */
export async function buildMonthlyReport(inp: ReportInput): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = inp.namaToko
  wb.created = new Date()

  const inRange = <T extends { waktu: number }>(l: T[]) => l.filter((x) => x.waktu >= inp.a && x.waktu < inp.b).sort((x, y) => x.waktu - y.waktu)
  const sales = inRange(inp.sales)
  const payments = inRange(inp.payments)
  const s = summarize(sales, payments)
  const custName = new Map(inp.customers.map((c) => [c.id, c.nama]))

  const header = (ws: import('exceljs').Worksheet) => {
    const row = ws.getRow(1)
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    row.alignment = { vertical: 'middle' }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  // 1. Ringkasan
  const r = wb.addWorksheet('Ringkasan')
  r.columns = [{ width: 34 }, { width: 22 }]
  r.addRow([`Laporan Penjualan ${inp.namaToko}`]).font = { bold: true, size: 14 }
  r.addRow([`Periode: ${inp.judulPeriode}`])
  r.addRow([`Dibuat: ${tglJam(Date.now())}`]).font = { italic: true, color: { argb: 'FF64748B' } }
  r.addRow([])
  const rows: [string, number, string?][] = [
    ['Omzet penjualan', s.omzet, RP],
    ['Jumlah transaksi', s.transaksi],
    ['Penjualan tunai', s.tunai, RP],
    ['Penjualan transfer / QRIS', s.transfer, RP],
    ['Bon baru (belum dibayar)', s.bonBaru, RP],
    ['DP bon', s.dp, RP],
    ['Pembayaran bon diterima', s.bayarBon, RP],
    ['Uang tunai masuk (tunai + DP + bayar bon tunai)', s.tunai + s.dp + s.bayarBonTunai, RP],
    ['Diskon diberikan', s.diskon, RP],
    ['Transaksi dibatalkan', s.batal],
  ]
  for (const [k, v, fmt] of rows) {
    const row = r.addRow([k, v])
    if (fmt) row.getCell(2).numFmt = fmt
    if (k === 'Omzet penjualan') row.font = { bold: true }
  }
  const piutang = inp.customers.reduce((a, c) => a + Math.max(0, c.saldo || 0), 0)
  r.addRow([])
  const pr = r.addRow(['Total piutang saat laporan dibuat', piutang])
  pr.getCell(2).numFmt = RP
  pr.font = { bold: true }

  // 2. Transaksi
  const t = wb.addWorksheet('Transaksi')
  t.columns = [
    { header: 'No. Transaksi', width: 24 }, { header: 'Waktu', width: 17 }, { header: 'Kasir', width: 14 },
    { header: 'Pelanggan', width: 20 }, { header: 'Metode', width: 10 }, { header: 'Subtotal', width: 14 },
    { header: 'Diskon', width: 11 }, { header: 'Total', width: 14 }, { header: 'Dibayar / DP', width: 14 },
    { header: 'Status', width: 9 }, { header: 'Alasan batal', width: 26 },
  ]
  for (const x of sales) {
    t.addRow([x.no, tglJam(x.waktu), x.kasir, x.pelangganNama || '', x.metode, x.subtotal, x.diskon, x.total, x.bayar, x.status, x.alasanBatal || ''])
  }
  for (const c of [6, 7, 8, 9]) t.getColumn(c).numFmt = RP
  header(t)

  // 3. Detail barang terjual
  const dt = wb.addWorksheet('Detail Barang')
  dt.columns = [
    { header: 'No. Transaksi', width: 24 }, { header: 'Waktu', width: 17 }, { header: 'Barang', width: 30 },
    { header: 'Jumlah', width: 9 }, { header: 'Satuan', width: 9 }, { header: 'Harga', width: 13 },
    { header: 'Harga normal', width: 13 }, { header: 'Subtotal', width: 14 },
  ]
  for (const x of sales.filter((q) => q.status === 'ok')) {
    for (const it of x.items) dt.addRow([x.no, tglJam(x.waktu), it.nama, it.qty, it.unit, it.harga, it.hargaAsli, it.qty * it.harga])
  }
  dt.getColumn(4).numFmt = QTY
  for (const c of [6, 7, 8]) dt.getColumn(c).numFmt = RP
  header(dt)

  // 4. Barang terlaris
  const agg = new Map<string, { nama: string; unit: string; qty: number; omzet: number }>()
  for (const x of sales.filter((q) => q.status === 'ok')) for (const it of x.items) {
    const k = it.productId + '|' + it.unit
    const cur = agg.get(k) || { nama: it.nama, unit: it.unit, qty: 0, omzet: 0 }
    cur.qty += it.qty
    cur.omzet += it.qty * it.harga
    agg.set(k, cur)
  }
  const tl = wb.addWorksheet('Barang Terlaris')
  tl.columns = [{ header: 'Barang', width: 30 }, { header: 'Terjual', width: 11 }, { header: 'Satuan', width: 9 }, { header: 'Omzet', width: 15 }]
  for (const v of [...agg.values()].sort((a, b) => b.omzet - a.omzet)) tl.addRow([v.nama, v.qty, v.unit, v.omzet])
  tl.getColumn(2).numFmt = QTY
  tl.getColumn(4).numFmt = RP
  header(tl)

  // 5. Pembayaran bon
  const pb = wb.addWorksheet('Pembayaran Bon')
  pb.columns = [
    { header: 'Waktu', width: 17 }, { header: 'Pelanggan', width: 22 }, { header: 'Jumlah', width: 14 },
    { header: 'Metode', width: 10 }, { header: 'Diterima', width: 14 }, { header: 'Status', width: 9 }, { header: 'Alasan batal', width: 26 },
  ]
  for (const p of payments) pb.addRow([tglJam(p.waktu), custName.get(p.customerId) || '-', p.jumlah, p.metode, p.kasir, p.status || 'ok', p.alasanBatal || ''])
  pb.getColumn(3).numFmt = RP
  header(pb)

  // 6. Piutang pelanggan (saat laporan dibuat)
  const pi = wb.addWorksheet('Piutang')
  pi.columns = [{ header: 'Pelanggan', width: 26 }, { header: 'No. HP', width: 16 }, { header: 'Sisa hutang', width: 15 }, { header: 'Keterangan', width: 22 }]
  for (const c of [...inp.customers].filter((c) => Math.abs(c.saldo || 0) > 0.5).sort((a, b) => (b.saldo || 0) - (a.saldo || 0))) {
    pi.addRow([c.nama, c.hp || '', c.saldo || 0, (c.saldo || 0) < 0 ? 'Kelebihan bayar' : ''])
  }
  pi.getColumn(3).numFmt = RP
  header(pi)

  // 7. Stok barang (saat laporan dibuat)
  const st = wb.addWorksheet('Stok')
  st.columns = [
    { header: 'Barang', width: 30 }, { header: 'Kategori', width: 14 }, { header: 'Stok', width: 10 },
    { header: 'Satuan dasar', width: 12 }, { header: 'Harga (satuan dasar)', width: 18 }, { header: 'Satuan lain', width: 40 },
  ]
  for (const p of [...inp.products].sort((a, b) => a.nama.localeCompare(b.nama))) {
    st.addRow([p.nama, p.kategori || '', p.stok, p.units[0]?.nama || '', p.units[0]?.harga || 0,
      p.units.slice(1).map((u) => `${u.nama} (isi ${u.isi}) ${u.harga}`).join('; ')])
  }
  st.getColumn(3).numFmt = QTY
  st.getColumn(5).numFmt = RP
  header(st)

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
