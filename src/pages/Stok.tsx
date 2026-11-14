import { useMemo, useState } from 'react'
import type { MoveType, Product } from '../types'
import { useStore } from '../lib/store'
import { findByBarcode, searchProducts } from '../lib/search'
import { qtyFmt, stokLabel, tglJam } from '../lib/format'
import { Empty, Icon } from '../components/ui'
import { Scanner } from '../components/LazyScanner'

type Tab = 'masuk' | 'keluar' | 'riwayat'

const TIPE: Record<MoveType, string> = {
  masuk: 'Masuk', keluar: 'Keluar', sesuai: 'Penyesuaian', jual: 'Terjual', batal: 'Batal jual',
}

export function Stok() {
  const [tab, setTab] = useState<Tab>('masuk')
  return (
    <div className="page">
      <div className="page-head"><h2>Barang Masuk / Keluar</h2></div>
      <div className="seg">
        <button className={tab === 'masuk' ? 'on' : ''} onClick={() => setTab('masuk')}>Barang masuk</button>
        <button className={tab === 'keluar' ? 'on' : ''} onClick={() => setTab('keluar')}>Barang keluar</button>
        <button className={tab === 'riwayat' ? 'on' : ''} onClick={() => setTab('riwayat')}>Riwayat</button>
      </div>
      {tab === 'riwayat' ? <Riwayat /> : <MoveForm key={tab} tipe={tab} />}
    </div>
  )
}

function MoveForm({ tipe }: { tipe: 'masuk' | 'keluar' }) {
  const st = useStore()
  const [q, setQ] = useState('')
  const [p, setP] = useState<Product | null>(null)
  const [ui, setUi] = useState(0)
  const [qty, setQty] = useState('')
  const [supplier, setSupplier] = useState('')
  const [ket, setKet] = useState('')
  const [scan, setScan] = useState(false)
  const [done, setDone] = useState<string[]>([])

  const product = p ? st.products.find((x) => x.id === p.id) || p : null
  const results = searchProducts(st.products, q, 15)
  const suppliers = useMemo(() => [...new Set(st.moves.map((m) => m.supplier).filter(Boolean))] as string[], [st.moves])

  function pick(x: Product, u = 0) { setP(x); setUi(u); setQ(''); setQty('') }

  function onCode(code: string) {
    const hit = findByBarcode(st.products, code)
    if (hit) { pick(hit.p, hit.u); return hit.p.nama }
    return `Barcode ${code} belum terdaftar`
  }

  const n = Number(qty)
  function save() {
    if (!product || !(n > 0)) return
    const u = product.units[ui]
    st.moveStock(product, tipe, n * u.isi, {
      supplier: tipe === 'masuk' ? supplier.trim() || undefined : undefined,
      keterangan: ket.trim() || (u.isi > 1 ? `${qtyFmt(n)} ${u.nama}` : undefined),
    })
    setDone((d) => [`${tipe === 'masuk' ? '+' : '−'}${qtyFmt(n)} ${u.nama} ${product.nama}`, ...d].slice(0, 8))
    setP(null); setQty(''); setKet('')
  }

  return (
    <div className="card">
      {!product ? (
        <>
          <label>Pilih barang</label>
          <div className="searchbar">
            <Icon name="cari" size={20} />
            <input autoFocus placeholder="Cari nama / scan barcode…" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { const h = findByBarcode(st.products, q); if (h) pick(h.p, h.u) } }} />
            <button className="btn primary scan-btn" onClick={() => setScan(true)}><Icon name="scan" size={20} /> Scan</button>
          </div>
          {results.map((x) => (
            <button key={x.id} className="list-btn" onClick={() => pick(x)}>
              <b>{x.nama}</b> <span className="muted small">Stok {stokLabel(x)}</span>
            </button>
          ))}
        </>
      ) : (
        <>
          <div className="picked">
            <div><b>{product.nama}</b><div className="small muted">Stok sekarang: {stokLabel(product)}</div></div>
            <button className="btn sm" onClick={() => setP(null)}>Ganti</button>
          </div>
          <div className="grid2">
            <div>
              <label>Jumlah</label>
              <input type="number" inputMode="decimal" step="any" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label>Satuan</label>
              <select value={ui} onChange={(e) => setUi(Number(e.target.value))}>
                {product.units.map((u, i) => <option key={u.nama} value={i}>{u.nama}{u.isi > 1 ? ` (${qtyFmt(u.isi)} ${product.units[0].nama})` : ''}</option>)}
              </select>
            </div>
          </div>
          {tipe === 'masuk' && (
            <>
              <label>Supplier (opsional)</label>
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} list="supplier-list" placeholder="Nama supplier/toko asal" />
              <datalist id="supplier-list">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
            </>
          )}
          <label>Keterangan (opsional)</label>
          <input value={ket} onChange={(e) => setKet(e.target.value)}
            placeholder={tipe === 'masuk' ? 'cth. kiriman truk pagi' : 'cth. rusak, retur ke supplier, dipakai sendiri'} />
          {n > 0 && (
            <p className="muted">
              Stok setelahnya: <b>{qtyFmt(product.stok + (tipe === 'masuk' ? 1 : -1) * n * product.units[ui].isi)} {product.units[0].nama}</b>
            </p>
          )}
          <button className={'btn block lg ' + (tipe === 'masuk' ? 'primary' : 'danger')} disabled={!(n > 0)} onClick={save}>
            Simpan barang {tipe}
          </button>
        </>
      )}
      {done.length > 0 && (
        <div className="done-list">
          <h4 className="muted">Baru saja dicatat</h4>
          {done.map((d, i) => <div key={i} className="small">✓ {d}</div>)}
        </div>
      )}
      {scan && <Scanner title="Scan barang" onResult={onCode} onClose={() => setScan(false)} />}
    </div>
  )
}

function Riwayat() {
  const st = useStore()
  const [f, setF] = useState<MoveType | 'semua'>('semua')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(100)
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return [...st.moves]
      .filter((m) => (f === 'semua' || m.tipe === f) && (!ql || m.nama.toLowerCase().includes(ql) || (m.supplier || '').toLowerCase().includes(ql)))
      .sort((a, b) => b.waktu - a.waktu)
  }, [st.moves, f, q])
  return (
    <>
      <div className="toolbar">
        <input placeholder="Cari barang / supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={f} onChange={(e) => setF(e.target.value as MoveType | 'semua')}>
          <option value="semua">Semua jenis</option>
          {Object.entries(TIPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {list.length === 0 && <Empty>Belum ada riwayat.</Empty>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Waktu</th><th>Barang</th><th>Jenis</th><th className="r">Jumlah</th><th>Keterangan</th><th>Oleh</th></tr></thead>
          <tbody>
            {list.slice(0, limit).map((m) => (
              <tr key={m.id}>
                <td className="nowrap">{tglJam(m.waktu)}</td>
                <td>{m.nama}</td>
                <td><span className={'badge t-' + m.tipe}>{TIPE[m.tipe]}</span></td>
                <td className={'r nowrap ' + (m.qty > 0 ? 'ok-text' : 'danger-text')}>{m.qty > 0 ? '+' : ''}{qtyFmt(m.qty)} {m.satuan}</td>
                <td>{[m.supplier && `Dari ${m.supplier}`, m.keterangan].filter(Boolean).join(' · ')}</td>
                <td>{m.user}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > limit && <button className="btn block" onClick={() => setLimit((l) => l + 200)}>Tampilkan lebih banyak</button>}
    </>
  )
}
