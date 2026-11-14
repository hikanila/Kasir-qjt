import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Backend, Col } from './backend'
import type {
  AppUser, Customer, LogEntry, Move, MoveType, Payment, Product, Sale, Settings,
} from '../types'
import { qtyFmt, rp, uid } from './format'

export const DEFAULT_SETTINGS: Settings = {
  id: 'toko',
  namaToko: 'TB. Qeela Jaya Tama',
  alamat: '',
  wa: '',
  footer: 'Barang yang sudah dibeli tidak dapat dikembalikan.',
}

interface Data {
  products: Product[]
  sales: Sale[]
  customers: Customer[]
  payments: Payment[]
  moves: Move[]
  logs: LogEntry[]
  users: AppUser[]
  settingsRows: Settings[]
}

export interface Store extends Omit<Data, 'settingsRows'> {
  backend: Backend
  me: AppUser
  isOwner: boolean
  settings: Settings
  hutang: Map<string, number>
  ready: boolean
  log(aksi: string, detail: string): void
  saveProduct(p: Product, isNew: boolean): void
  deleteProduct(p: Product): void
  moveStock(p: Product, tipe: Extract<MoveType, 'masuk' | 'keluar'>, qtyDasar: number, info?: { supplier?: string; keterangan?: string }): void
  setStock(p: Product, stokBaru: number, keterangan?: string): void
  checkout(sale: Sale): void
  cancelSale(sale: Sale, alasan: string): void
  saveCustomer(c: Customer): void
  addPayment(p: Payment, namaPelanggan: string): void
  saveSettings(s: Settings): void
  setUserRole(u: AppUser, role: AppUser['role']): void
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider belum dipasang')
  return s
}

const empty: Data = {
  products: [], sales: [], customers: [], payments: [], moves: [], logs: [], users: [], settingsRows: [],
}

export function StoreProvider({ backend, me, children }: { backend: Backend; me: AppUser; children: ReactNode }) {
  const [data, setData] = useState<Data>(empty)
  const [loaded, setLoaded] = useState<Set<string>>(new Set())
  const isOwner = me.role === 'pemilik'

  useEffect(() => {
    const map: [keyof Data, Col][] = [
      ['products', 'products'], ['sales', 'sales'], ['customers', 'customers'], ['payments', 'payments'],
      ['moves', 'moves'], ['settingsRows', 'settings'],
    ]
    if (isOwner) map.push(['logs', 'logs'])
    if (backend.mode === 'online') map.push(['users', 'users'])
    const unsubs = map.map(([key, col]) =>
      backend.subscribe(col, (rows) => {
        setData((d) => ({ ...d, [key]: rows }))
        setLoaded((l) => (l.has(key) ? l : new Set(l).add(key)))
      }),
    )
    return () => unsubs.forEach((u) => u())
  }, [backend, isOwner])

  const store = useMemo<Store>(() => {
    const settings = { ...DEFAULT_SETTINGS, ...data.settingsRows.find((s) => s.id === 'toko') }

    // Hutang per pelanggan = sisa bon (total - DP) dikurangi pembayaran.
    const hutang = new Map<string, number>()
    for (const s of data.sales) {
      if (s.status !== 'ok' || s.metode !== 'bon' || !s.pelangganId) continue
      hutang.set(s.pelangganId, (hutang.get(s.pelangganId) || 0) + (s.total - s.bayar))
    }
    for (const p of data.payments) hutang.set(p.customerId, (hutang.get(p.customerId) || 0) - p.jumlah)

    const log = (aksi: string, detail: string) =>
      backend.put('logs', { id: uid(), waktu: Date.now(), user: me.nama, aksi, detail } satisfies LogEntry)

    const move = (p: Product, tipe: MoveType, qty: number, extra: Partial<Move> = {}) =>
      backend.put('moves', {
        id: uid(), waktu: Date.now(), productId: p.id, nama: p.nama, tipe, qty,
        satuan: p.units[0]?.nama || '', user: me.nama, ...extra,
      } satisfies Move)

    return {
      ...data,
      backend, me, isOwner, settings, hutang, log,
      ready: loaded.has('products') && loaded.has('settingsRows'),

      saveProduct(p, isNew) {
        const old = data.products.find((x) => x.id === p.id)
        if (isNew) {
          backend.put('products', p)
          if (p.stok) move(p, 'sesuai', p.stok, { keterangan: 'Stok awal' })
          log('Tambah barang', `${p.nama} (stok awal ${qtyFmt(p.stok)} ${p.units[0]?.nama})`)
        } else {
          // Stok tidak ditimpa dari form agar tidak bentrok dengan penjualan di perangkat lain.
          const { stok: _stok, ...rest } = p
          void _stok
          backend.put('products', { ...rest, stok: old?.stok ?? p.stok })
          const ubahHarga = old && JSON.stringify(old.units.map((u) => u.harga)) !== JSON.stringify(p.units.map((u) => u.harga))
          log('Ubah barang', p.nama + (ubahHarga ? ` — harga: ${p.units.map((u) => `${u.nama} ${rp(u.harga)}`).join(', ')}` : ''))
        }
      },
      deleteProduct(p) {
        backend.remove('products', p.id)
        log('Hapus barang', p.nama)
      },
      moveStock(p, tipe, qtyDasar, info = {}) {
        const delta = tipe === 'masuk' ? qtyDasar : -qtyDasar
        backend.addStock(p.id, delta)
        move(p, tipe, delta, info)
        log(tipe === 'masuk' ? 'Barang masuk' : 'Barang keluar',
          `${p.nama} ${qtyFmt(qtyDasar)} ${p.units[0]?.nama}${info.supplier ? ` dari ${info.supplier}` : ''}${info.keterangan ? ` — ${info.keterangan}` : ''}`)
      },
      setStock(p, stokBaru, keterangan) {
        const delta = Math.round((stokBaru - p.stok) * 1000) / 1000
        if (!delta) return
        backend.addStock(p.id, delta)
        move(p, 'sesuai', delta, { keterangan: keterangan || 'Penyesuaian stok' })
        log('Sesuaikan stok', `${p.nama}: ${qtyFmt(p.stok)} → ${qtyFmt(stokBaru)} ${p.units[0]?.nama}`)
      },
      checkout(sale) {
        backend.put('sales', sale)
        for (const it of sale.items) {
          const delta = -it.qty * it.isi
          backend.addStock(it.productId, delta)
          const p = data.products.find((x) => x.id === it.productId)
          if (p) move(p, 'jual', delta, { keterangan: sale.no })
          if (it.harga !== it.hargaAsli) {
            log('Ubah harga saat jual', `${sale.no}: ${it.nama} ${rp(it.hargaAsli)} → ${rp(it.harga)}/${it.unit}`)
          }
        }
        if (sale.diskon) log('Diskon', `${sale.no}: ${rp(sale.diskon)}`)
        if (sale.metode === 'bon') log('Bon', `${sale.no}: ${sale.pelangganNama} ${rp(sale.total - sale.bayar)}`)
      },
      cancelSale(sale, alasan) {
        backend.put('sales', { ...sale, status: 'batal', alasanBatal: alasan })
        for (const it of sale.items) {
          const delta = it.qty * it.isi
          backend.addStock(it.productId, delta)
          const p = data.products.find((x) => x.id === it.productId)
          if (p) move(p, 'batal', delta, { keterangan: `Batal ${sale.no}` })
        }
        log('Batalkan transaksi', `${sale.no} ${rp(sale.total)} — ${alasan}`)
      },
      saveCustomer(c) {
        backend.put('customers', c)
      },
      addPayment(p, nama) {
        backend.put('payments', p)
        log('Terima bayar bon', `${nama} ${rp(p.jumlah)} (${p.metode})`)
      },
      saveSettings(s) {
        backend.put('settings', s)
        log('Ubah pengaturan toko', s.namaToko)
      },
      setUserRole(u, role) {
        backend.put('users', { ...u, role })
        log('Ubah hak pengguna', `${u.nama} → ${role}`)
      },
    }
  }, [data, loaded, backend, me, isOwner])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}
