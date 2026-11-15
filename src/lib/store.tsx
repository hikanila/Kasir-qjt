import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Backend, Col, Since } from './backend'
import type {
  AppUser, Customer, LogEntry, Move, MoveType, Payment, Product, Sale, Settings,
} from '../types'
import { qtyFmt, rp, startOfDay, tglJam, uid } from './format'

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
  /** Sisa hutang per pelanggan (negatif = kelebihan bayar). */
  hutang: Map<string, number>
  /** Data penjualan/pembayaran sebelum waktu ini tidak dimuat otomatis (ambil lewat query). */
  sinceSales: number
  /** Riwayat stok & aktivitas sebelum waktu ini tidak dimuat otomatis. */
  sinceLogs: number
  ready: boolean
  log(aksi: string, detail: string): void
  saveProduct(p: Product, isNew: boolean): void
  deleteProduct(p: Product): void
  moveStock(p: Product, tipe: Extract<MoveType, 'masuk' | 'keluar'>, qtyDasar: number, info?: { supplier?: string; keterangan?: string }): void
  setStock(p: Product, stokBaru: number, keterangan?: string): void
  checkout(sale: Sale): void
  cancelSale(sale: Sale, alasan: string): void
  addCustomer(c: Customer): void
  updateCustomer(c: Customer, patch: Pick<Customer, 'nama' | 'hp' | 'catatan'>): void
  addPayment(p: Payment, namaPelanggan: string): void
  cancelPayment(p: Payment, alasan: string, namaPelanggan: string): void
  saveSettings(s: Settings): void
  setUserRole(u: AppUser, role: AppUser['role']): void
  removeUser(u: AppUser): void
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

/** Lama data yang dimuat otomatis. Data yang lebih lama tetap tersimpan dan diambil saat dibutuhkan. */
const HARI_PENJUALAN = 62
const HARI_RIWAYAT = 31

export function StoreProvider({ backend, me, children }: { backend: Backend; me: AppUser; children: ReactNode }) {
  const [data, setData] = useState<Data>(empty)
  const [loaded, setLoaded] = useState<Set<string>>(new Set())
  const isOwner = me.role === 'pemilik'
  // Dihitung sekali saat aplikasi dibuka (batas tidak bergeser selama sesi).
  const [sinceSales] = useState(() => startOfDay() - HARI_PENJUALAN * 864e5)
  const [sinceLogs] = useState(() => startOfDay() - HARI_RIWAYAT * 864e5)

  useEffect(() => {
    const map: [keyof Data, Col, Since?][] = [
      ['products', 'products'], ['customers', 'customers'], ['settingsRows', 'settings'],
      ['sales', 'sales', { field: 'waktu', from: sinceSales }],
      ['payments', 'payments', { field: 'waktu', from: sinceSales }],
      ['moves', 'moves', { field: 'waktu', from: sinceLogs }],
    ]
    if (isOwner) map.push(['logs', 'logs', { field: 'waktu', from: sinceLogs }])
    if (backend.mode === 'online') map.push(['users', 'users'])
    const unsubs = map.map(([key, col, since]) =>
      backend.subscribe(col, (rows) => {
        setData((d) => ({ ...d, [key]: rows }))
        setLoaded((l) => (l.has(key) ? l : new Set(l).add(key)))
      }, since),
    )
    return () => unsubs.forEach((u) => u())
  }, [backend, isOwner, sinceSales, sinceLogs])

  const store = useMemo<Store>(() => {
    const settings = { ...DEFAULT_SETTINGS, ...data.settingsRows.find((s) => s.id === 'toko') }

    // Saldo hutang disimpan di data pelanggan dan diubah atomik setiap bon/bayar/batal.
    const hutang = new Map<string, number>(data.customers.map((c) => [c.id, Math.round(c.saldo || 0)]))

    const log = (aksi: string, detail: string) =>
      backend.put('logs', { id: uid(), waktu: Date.now(), user: me.nama, aksi, detail } satisfies LogEntry)

    const move = (p: Product, tipe: MoveType, qty: number, extra: Partial<Move> = {}) =>
      backend.put('moves', {
        id: uid(), waktu: Date.now(), productId: p.id, nama: p.nama, tipe, qty,
        satuan: p.units[0]?.nama || '', user: me.nama, ...extra,
      } satisfies Move)

    return {
      ...data,
      backend, me, isOwner, settings, hutang, log, sinceSales, sinceLogs,
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
        if (sale.metode === 'bon' && sale.pelangganId) {
          backend.increment('customers', sale.pelangganId, 'saldo', sale.total - sale.bayar)
          log('Bon', `${sale.no}: ${sale.pelangganNama} ${rp(sale.total - sale.bayar)}`)
        }
      },
      cancelSale(sale, alasan) {
        if (sale.status !== 'ok') return
        backend.update('sales', sale.id, { status: 'batal', alasanBatal: alasan, batalOleh: me.nama, batalWaktu: Date.now() })
        if (sale.metode === 'bon' && sale.pelangganId) {
          backend.increment('customers', sale.pelangganId, 'saldo', -(sale.total - sale.bayar))
        }
        for (const it of sale.items) {
          const delta = it.qty * it.isi
          backend.addStock(it.productId, delta)
          const p = data.products.find((x) => x.id === it.productId)
          if (p) move(p, 'batal', delta, { keterangan: `Batal ${sale.no}` })
        }
        log('Batalkan transaksi', `${sale.no} ${rp(sale.total)} — ${alasan}`)
      },
      addCustomer(c) {
        backend.put('customers', { ...c, saldo: 0 })
      },
      updateCustomer(c, patch) {
        // Saldo tidak ikut ditulis agar tidak menimpa perubahan dari perangkat lain.
        backend.update('customers', c.id, { nama: patch.nama, hp: patch.hp ?? null, catatan: patch.catatan ?? null })
      },
      addPayment(p, nama) {
        backend.put('payments', { ...p, status: 'ok' })
        backend.increment('customers', p.customerId, 'saldo', -p.jumlah)
        log('Terima bayar bon', `${nama} ${rp(p.jumlah)} (${p.metode})`)
      },
      cancelPayment(p, alasan, nama) {
        if (p.status === 'batal') return
        backend.update('payments', p.id, { status: 'batal', alasanBatal: alasan, batalOleh: me.nama, batalWaktu: Date.now() })
        backend.increment('customers', p.customerId, 'saldo', p.jumlah)
        log('Batalkan pembayaran bon', `${nama} ${rp(p.jumlah)} (${tglJam(p.waktu)}) — ${alasan}`)
      },
      saveSettings(s) {
        backend.put('settings', s)
        log('Ubah pengaturan toko', s.namaToko)
      },
      setUserRole(u, role) {
        backend.put('users', { ...u, role })
        log('Ubah hak pengguna', `${u.nama} → ${role}`)
      },
      removeUser(u) {
        backend.remove('users', u.id)
        log('Hapus pengguna', `${u.nama} (${u.email || '-'})`)
      },
    }
  }, [data, loaded, backend, me, isOwner, sinceSales, sinceLogs])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}
