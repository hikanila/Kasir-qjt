import { useEffect, useMemo, useRef, useState } from 'react'
import type { Customer, Metode, Product, Sale, SaleItem } from '../types'
import { useStore } from '../lib/store'
import { findByBarcode, searchProducts } from '../lib/search'
import { noTransaksi, rp, stokLabel, uid } from '../lib/format'
import { beep } from '../lib/barcode'
import { Icon, Modal, MoneyInput } from '../components/ui'
import { Scanner } from '../components/LazyScanner'
import { NotaModal } from '../components/NotaModal'
import { CustomerPicker } from '../components/CustomerPicker'

const CART_KEY = 'qjt-cart'

export function Kasir() {
  const st = useStore()
  const [q, setQ] = useState('')
  const [cart, setCart] = useState<SaleItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') } catch { return [] }
  })
  const [diskon, setDiskon] = useState(0)
  const [scan, setScan] = useState(false)
  const [pay, setPay] = useState(false)
  const [nota, setNota] = useState<Sale | null>(null)
  const [flash, setFlash] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)) }, [cart])

  const results = useMemo(() => searchProducts(st.products, q), [st.products, q])
  const subtotal = cart.reduce((a, it) => a + it.qty * it.harga, 0)
  const total = Math.max(0, subtotal - diskon)

  const productById = useMemo(() => new Map(st.products.map((p) => [p.id, p])), [st.products])

  // Barang terlaris 30 hari untuk tombol cepat
  const terlaris = useMemo(() => {
    const since = Date.now() - 30 * 864e5
    const cnt = new Map<string, number>()
    for (const s of st.sales) if (s.status === 'ok' && s.waktu > since) for (const it of s.items) cnt.set(it.productId, (cnt.get(it.productId) || 0) + 1)
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => productById.get(id)).filter(Boolean).slice(0, 12) as Product[]
  }, [st.sales, productById])

  function add(p: Product, ui = 0, qty = 1) {
    const u = p.units[ui]
    if (!u) return
    setCart((c) => {
      const i = c.findIndex((x) => x.productId === p.id && x.unit === u.nama)
      if (i >= 0) {
        const n = [...c]
        n[i] = { ...n[i], qty: n[i].qty + qty }
        return [n[i], ...n.filter((_, j) => j !== i)]
      }
      return [{ productId: p.id, nama: p.nama, unit: u.nama, isi: u.isi, qty, harga: u.harga, hargaAsli: u.harga }, ...c]
    })
    setFlash(`${p.nama} (${u.nama}) ditambahkan`)
    setTimeout(() => setFlash(''), 1500)
  }

  function onCode(code: string): string {
    const hit = findByBarcode(st.products, code)
    if (hit) {
      add(hit.p, hit.u)
      return `${hit.p.nama} (${hit.p.units[hit.u].nama}) ditambahkan`
    }
    beep(false)
    return `Barcode ${code} belum terdaftar`
  }

  function submitSearch() {
    const code = q.trim()
    if (!code) return
    const hit = findByBarcode(st.products, code)
    if (hit) { add(hit.p, hit.u); beep(); setQ(''); return }
    if (results.length === 1 && results[0].units.length === 1) { add(results[0]); setQ(''); return }
    if (/^\d{6,}$/.test(code) && !results.length) { beep(false); setFlash(`Barcode ${code} belum terdaftar`) }
  }

  const upd = (i: number, patch: Partial<SaleItem>) => setCart((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  function finish(sale: Sale) {
    st.checkout(sale)
    setPay(false)
    setNota(sale)
  }

  function reset() {
    setCart([]); setDiskon(0); setNota(null); setQ('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="kasir">
      <section className="kasir-left">
        <div className="searchbar">
          <Icon name="cari" size={20} />
          <input
            ref={inputRef}
            autoFocus
            placeholder="Cari nama barang atau scan barcode…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
          />
          {q && <button className="icon-btn" onClick={() => setQ('')} aria-label="Hapus">✕</button>}
          <button className="btn primary scan-btn" onClick={() => setScan(true)}><Icon name="scan" size={20} /> Scan</button>
        </div>
        {flash && <div className="flash">{flash}</div>}

        {q ? (
          <div className="results">
            {results.length === 0 && <p className="muted pad">Barang "{q}" tidak ditemukan. Tambahkan di menu Barang.</p>}
            {results.map((p) => (
              <div key={p.id} className="result">
                <div className="result-name">
                  <b>{p.nama}</b>
                  <span className={'small ' + (p.stok <= (p.stokMin ?? 0) ? 'warn-text' : 'muted')}>Stok: {stokLabel(p)}</span>
                </div>
                <div className="unit-btns">
                  {p.units.map((u, i) => (
                    <button key={u.nama} className="unit-btn" onClick={() => { add(p, i); setQ(''); inputRef.current?.focus() }}>
                      <span>{u.nama}</span><b>{rp(u.harga)}</b>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          terlaris.length > 0 && (
            <div className="quick">
              <h4 className="muted">Sering dijual</h4>
              <div className="quick-grid">
                {terlaris.map((p) => (
                  <button key={p.id} className="quick-btn" onClick={() => add(p)}>
                    <span>{p.nama}</span><small>{rp(p.units[0].harga)}/{p.units[0].nama}</small>
                  </button>
                ))}
              </div>
            </div>
          )
        )}
        {!q && st.products.length === 0 && (
          <div className="card info-box">
            <b>Belum ada barang.</b> Buka menu <b>Barang</b> untuk menambahkan barang dan harga terlebih dahulu.
          </div>
        )}
      </section>

      <section className="kasir-right">
        <div className="cart">
          <div className="cart-head">
            <h3>Keranjang <span className="muted">({cart.length})</span></h3>
            {cart.length > 0 && <button className="btn sm danger-outline" onClick={() => confirm('Kosongkan keranjang?') && reset()}>Kosongkan</button>}
          </div>
          {cart.length === 0 && <p className="muted pad">Keranjang kosong. Cari atau scan barang.</p>}
          {cart.map((it, i) => {
            const p = productById.get(it.productId)
            const kurang = p && it.qty * it.isi > p.stok
            return (
              <div key={it.productId + it.unit} className="cart-item">
                <div className="ci-top">
                  <b>{it.nama}</b>
                  <button className="icon-btn" onClick={() => setCart((c) => c.filter((_, j) => j !== i))} aria-label="Hapus">✕</button>
                </div>
                <div className="ci-row">
                  <div className="qty">
                    <button onClick={() => upd(i, { qty: Math.max(0.01, +(it.qty - 1).toFixed(3)) })} disabled={it.qty <= 1}>−</button>
                    <input type="number" inputMode="decimal" step="any" min="0" value={it.qty}
                      onChange={(e) => upd(i, { qty: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
                    <button onClick={() => upd(i, { qty: +(it.qty + 1).toFixed(3) })}>+</button>
                  </div>
                  {p && p.units.length > 1 ? (
                    <select value={it.unit} onChange={(e) => {
                      const u = p.units.find((x) => x.nama === e.target.value)!
                      upd(i, { unit: u.nama, isi: u.isi, harga: u.harga, hargaAsli: u.harga })
                    }}>
                      {p.units.map((u) => <option key={u.nama}>{u.nama}</option>)}
                    </select>
                  ) : <span className="unit-lbl">{it.unit}</span>}
                  <span className="x">×</span>
                  <div className={'price' + (it.harga !== it.hargaAsli ? ' edited' : '')}>
                    <MoneyInput value={it.harga} onChange={(n) => upd(i, { harga: n })} />
                  </div>
                </div>
                <div className="ci-bottom">
                  {kurang ? <span className="small warn-text">⚠ Stok tercatat {stokLabel(p)}</span> : <span />}
                  <b>{rp(it.qty * it.harga)}</b>
                </div>
              </div>
            )
          })}
        </div>
        <div className="cart-foot">
          <div className="row between">
            <span>Subtotal</span><span>{rp(subtotal)}</span>
          </div>
          <div className="row between diskon">
            <label htmlFor="diskon">Diskon</label>
            <div style={{ width: 140 }}><MoneyInput id="diskon" value={diskon} onChange={setDiskon} /></div>
          </div>
          <div className="row between total"><span>TOTAL</span><span>{rp(total)}</span></div>
          <button className="btn primary block lg" disabled={!cart.length || cart.some((c) => !(c.qty > 0))} onClick={() => setPay(true)}>
            Bayar {rp(total)}
          </button>
        </div>
      </section>

      {scan && <Scanner continuous title="Scan barang" onResult={onCode} onClose={() => setScan(false)} />}
      {pay && (
        <PayModal
          total={total}
          onClose={() => setPay(false)}
          onDone={(m, bayar, cust) => finish({
            id: uid(), no: noTransaksi(), waktu: Date.now(), kasir: st.me.nama, kasirId: st.me.id,
            pelangganId: cust?.id, pelangganNama: cust?.nama, pelangganHp: cust?.hp,
            items: cart.filter((c) => c.qty > 0), subtotal, diskon: Math.min(diskon, subtotal), total, metode: m,
            bayar: m === 'transfer' ? total : bayar,
            kembali: m === 'tunai' ? Math.max(0, bayar - total) : 0,
            status: 'ok',
          })}
        />
      )}
      {nota && <NotaModal sale={nota} onClose={reset} onNew={reset} />}
    </div>
  )
}

function PayModal({
  total, onClose, onDone,
}: { total: number; onClose: () => void; onDone: (m: Metode, bayar: number, c: Customer | null) => void }) {
  const [m, setM] = useState<Metode>('tunai')
  const [bayar, setBayar] = useState(0)
  const [cust, setCust] = useState<Customer | null>(null)
  const [showCust, setShowCust] = useState(false)
  const pecahan = [...new Set([total, ...[50000, 100000, 200000, 500000, 1000000].map((p) => Math.ceil(total / p) * p)])]
    .filter((x) => x >= total).sort((a, b) => a - b).slice(0, 5)

  const ok =
    m === 'tunai' ? bayar >= total :
      m === 'bon' ? !!cust && bayar <= total : true

  return (
    <Modal title={`Pembayaran — ${rp(total)}`} onClose={onClose}>
      <div className="seg">
        {(['tunai', 'transfer', 'bon'] as Metode[]).map((x) => (
          <button key={x} className={m === x ? 'on' : ''} onClick={() => { setM(x); setBayar(0) }}>
            {x === 'tunai' ? 'Tunai' : x === 'transfer' ? 'Transfer / QRIS' : 'Bon (hutang)'}
          </button>
        ))}
      </div>

      {m === 'tunai' && (
        <>
          <label>Uang diterima</label>
          <MoneyInput value={bayar} onChange={setBayar} autoFocus />
          <div className="chips">
            {pecahan.map((p) => (
              <button key={p} className="chip" onClick={() => setBayar(p)}>{p === total ? 'Uang pas' : rp(p)}</button>
            ))}
          </div>
          <div className={'kembali ' + (bayar >= total ? 'ok' : '')}>
            {bayar >= total ? <>Kembalian <b>{rp(bayar - total)}</b></> : bayar > 0 ? <>Kurang {rp(total - bayar)}</> : 'Masukkan uang diterima'}
          </div>
        </>
      )}
      {m === 'transfer' && <p className="alert info">Pastikan dana transfer/QRIS sebesar <b>{rp(total)}</b> sudah masuk sebelum menyimpan.</p>}
      {m === 'bon' && (
        <>
          <label>Pelanggan (wajib)</label>
          <CustomerPicker value={cust} onChange={setCust} />
          <label>Bayar sekarang / DP (boleh 0)</label>
          <MoneyInput value={bayar} onChange={setBayar} />
          {bayar > total && <p className="small danger-text">DP melebihi total.</p>}
          <div className="kembali">Masuk bon: <b>{rp(Math.max(0, total - bayar))}</b></div>
        </>
      )}

      {m !== 'bon' && (
        showCust ? (
          <>
            <label>Pelanggan (opsional, untuk kirim nota WA)</label>
            <CustomerPicker value={cust} onChange={setCust} />
          </>
        ) : <button className="link-btn" onClick={() => setShowCust(true)}>+ Isi nama pelanggan (opsional)</button>
      )}

      <button className="btn primary block lg" disabled={!ok} onClick={() => onDone(m, bayar, cust)}>
        Simpan transaksi
      </button>
      <p className="muted small center">Transaksi tetap tersimpan walau sedang offline.</p>
    </Modal>
  )
}
