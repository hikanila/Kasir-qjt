export type Role = 'pemilik' | 'kasir' | 'menunggu'

/** Satuan jual. units[0] selalu satuan dasar (isi = 1). Stok disimpan dalam satuan dasar. */
export interface Unit {
  nama: string
  isi: number
  harga: number
  barcode?: string
}

export interface Product {
  id: string
  nama: string
  kategori?: string
  units: Unit[]
  stok: number
  stokMin?: number
  dibuat: number
  diubah: number
}

export interface SaleItem {
  productId: string
  nama: string
  unit: string
  isi: number
  qty: number
  harga: number
  hargaAsli: number
}

export type Metode = 'tunai' | 'transfer' | 'bon'

export interface Sale {
  id: string
  no: string
  waktu: number
  kasir: string
  kasirId: string
  pelangganId?: string
  pelangganNama?: string
  pelangganHp?: string
  items: SaleItem[]
  subtotal: number
  diskon: number
  total: number
  metode: Metode
  /** Uang yang dibayarkan saat transaksi (untuk bon = DP). */
  bayar: number
  kembali: number
  status: 'ok' | 'batal'
  alasanBatal?: string
  batalOleh?: string
  batalWaktu?: number
}

export interface Customer {
  id: string
  nama: string
  hp?: string
  catatan?: string
  dibuat: number
  /** Sisa hutang (positif) atau kelebihan bayar (negatif). Diubah secara atomik. */
  saldo?: number
}

export interface Payment {
  id: string
  customerId: string
  jumlah: number
  metode: 'tunai' | 'transfer'
  waktu: number
  kasir: string
  catatan?: string
  status?: 'ok' | 'batal'
  alasanBatal?: string
  batalOleh?: string
  batalWaktu?: number
}

export type MoveType = 'masuk' | 'keluar' | 'sesuai' | 'jual' | 'batal'

export interface Move {
  id: string
  waktu: number
  productId: string
  nama: string
  tipe: MoveType
  /** Perubahan stok dalam satuan dasar (positif = bertambah). */
  qty: number
  satuan: string
  keterangan?: string
  supplier?: string
  user: string
}

export interface LogEntry {
  id: string
  waktu: number
  user: string
  aksi: string
  detail: string
}

export interface Settings {
  id: 'toko'
  namaToko: string
  alamat: string
  wa: string
  footer: string
}

export interface AppUser {
  id: string
  nama: string
  email?: string
  role: Role
}
