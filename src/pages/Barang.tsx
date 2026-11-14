import { useMemo, useState } from 'react'
import type { Product, Unit } from '../types'
import { useStore } from '../lib/store'
import { searchProducts } from '../lib/search'
import { buatBarcode, qtyFmt, rp, stokLabel, tgl, uid } from '../lib/format'
import { barcodeSVG } from '../lib/barcode'
import { esc, printHTML } from '../lib/nota'
import { Empty, Icon, Modal, MoneyInput } from '../components/ui'
import { Scanner } from '../components/LazyScanner'

type Filter = 'semua' | 'menipis' | 'tanpa-barcode'

export function Barang() {
  const st = useStore()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('semua')
  const [edit, setEdit] = useState<Product | 'baru' | null>(null)
  const [adjust, setAdjust] = useState<Product | null>(null)
  const [labels, setLabels] = useState(false)

  const list = useMemo(() => {
    let l = q.trim() ? searchProducts(st.products, q, 500) : [...st.products].sort((a, b) => a.nama.localeCompare(b.nama))
    if (filter === 'menipis') l = l.filter((p) => p.stok <= (p.stokMin ?? 0))
    if (filter === 'tanpa-barcode') l = l.filter((p) => p.units.some((u) => !u.barcode))
    return l
  }, [st.products, q, filter])

  const menipis = st.products.filter((p) => p.stok <= (p.stokMin ?? 0)).length

  return (
    <div className="page">
      <div className="page-head">
        <h2>Barang & Harga</h2>
        <button className="btn primary" onClick={() => setEdit('baru')}><Icon name="plus" size={18} /> Barang baru</button>
      </div>
      <div className="searchbar">
        <Icon name="cari" size={20} />
        <input placeholder="Cari barang / barcode…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="toolbar">
        <div className="seg sm">
          <button className={filter === 'semua' ? 'on' : ''} onClick={() => setFilter('semua')}>Semua ({st.products.length})</button>
          <button className={filter === 'menipis' ? 'on' : ''} onClick={() => setFilter('menipis')}>Stok menipis ({menipis})</button>
          <button className={filter === 'tanpa-barcode' ? 'on' : ''} onClick={() => setFilter('tanpa-barcode')}>Tanpa barcode</button>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => printDaftarHarga(st.products, st.settings.namaToko)}><Icon name="print" size={16} /> Daftar harga</button>
          <button className="btn sm" onClick={() => setLabels(true)}><Icon name="scan" size={16} /> Label barcode</button>
        </div>
      </div>

      {list.length === 0 && <Empty>{st.products.length ? 'Tidak ada barang yang cocok.' : 'Belum ada barang. Tekan "Barang baru".'}</Empty>}
      <div className="plist">
        {list.map((p) => (
          <div key={p.id} className="pcard">
            <button className="pcard-main" onClick={() => setEdit(p)}>
              <div className="row between">
                <b>{p.nama}</b>
                {p.kategori && <span className="badge">{p.kategori}</span>}
              </div>
              <div className="prices">
                {p.units.map((u) => (
                  <span key={u.nama}>{rp(u.harga)}<small>/{u.nama}{u.isi > 1 ? ` (${qtyFmt(u.isi)} ${p.units[0].nama})` : ''}</small>{!u.barcode && <small className="muted"> · tanpa barcode</small>}</span>
                ))}
              </div>
            </button>
            <div className="pcard-stok">
              <span className={p.stok <= (p.stokMin ?? 0) ? 'warn-text' : ''}>Stok: <b>{stokLabel(p)}</b></span>
              <button className="btn sm" onClick={() => setAdjust(p)}>Sesuaikan stok</button>
            </div>
          </div>
        ))}
      </div>

      {edit && <ProductForm product={edit === 'baru' ? null : edit} onClose={() => setEdit(null)} />}
      {adjust && <AdjustStock product={st.products.find((x) => x.id === adjust.id) || adjust} onClose={() => setAdjust(null)} />}
      {labels && <LabelModal onClose={() => setLabels(false)} />}
    </div>
  )
}

/* ------------------------------ Form barang ------------------------------ */

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const st = useStore()
  const [nama, setNama] = useState(product?.nama || '')
  const [kategori, setKategori] = useState(product?.kategori || '')
  const [units, setUnits] = useState<Unit[]>(product?.units.map((u) => ({ ...u })) || [{ nama: 'pcs', isi: 1, harga: 0 }])
  const [stok, setStok] = useState(product?.stok ?? 0)
  const [stokMin, setStokMin] = useState(product?.stokMin ?? 0)
  const [scanFor, setScanFor] = useState<number | null>(null)
  const [hapus, setHapus] = useState(false)
  const kategoriList = [...new Set(st.products.map((p) => p.kategori).filter(Boolean))] as string[]

  const setU = (i: number, patch: Partial<Unit>) => setUnits((us) => us.map((u, j) => (j === i ? { ...u, ...patch } : u)))

  const errors: string[] = []
  if (!nama.trim()) errors.push('Nama barang wajib diisi')
  const names = units.map((u) => u.nama.trim().toLowerCase())
  if (names.some((n) => !n)) errors.push('Nama satuan wajib diisi')
  if (new Set(names).size !== names.length) errors.push('Nama satuan tidak boleh sama')
  if (units.some((u) => !(u.isi > 0))) errors.push('Isi satuan harus lebih dari 0')
  const codes = units.map((u) => u.barcode?.trim()).filter(Boolean) as string[]
  if (new Set(codes).size !== codes.length) errors.push('Barcode antar satuan tidak boleh sama')
  for (const c of codes) {
    const other = st.products.find((p) => p.id !== product?.id && p.units.some((u) => u.barcode === c))
    if (other) errors.push(`Barcode ${c} sudah dipakai "${other.nama}"`)
  }

  function save() {
    if (errors.length) return
    const now = Date.now()
    const p: Product = {
      id: product?.id || uid(),
      nama: nama.trim(),
      kategori: kategori.trim() || undefined,
      units: units.map((u, i) => ({ nama: u.nama.trim(), isi: i === 0 ? 1 : u.isi, harga: u.harga, barcode: u.barcode?.trim() || undefined })),
      stok: product ? product.stok : stok,
      stokMin: stokMin || 0,
      dibuat: product?.dibuat || now,
      diubah: now,
    }
    st.saveProduct(p, !product)
    onClose()
  }

  return (
    <Modal title={product ? 'Ubah barang' : 'Barang baru'} onClose={onClose} wide>
      <label>Nama barang</label>
      <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="cth. Semen Tonasa 50kg" autoFocus={!product} />
      <label>Kategori (opsional)</label>
      <input value={kategori} onChange={(e) => setKategori(e.target.value)} list="kategori-list" placeholder="cth. Semen, Besi, Cat, Pipa" />
      <datalist id="kategori-list">{kategoriList.map((k) => <option key={k} value={k} />)}</datalist>

      <label>Satuan & harga jual</label>
      <p className="muted small">Baris pertama = satuan terkecil (stok dihitung dengan satuan ini). Tambah satuan lain bila dijual juga per dus/sak/batang.</p>
      <div className="units">
        {units.map((u, i) => (
          <div key={i} className="unit-row">
            <div>
              <small>Satuan</small>
              <input value={u.nama} onChange={(e) => setU(i, { nama: e.target.value })} placeholder={i ? 'dus' : 'pcs / kg / meter'} list="satuan-list" />
            </div>
            <div>
              <small>Isi ({units[0].nama || 'dasar'})</small>
              <input type="number" inputMode="decimal" step="any" value={i === 0 ? 1 : u.isi || ''} disabled={i === 0}
                onChange={(e) => setU(i, { isi: Number(e.target.value) })} />
            </div>
            <div>
              <small>Harga jual</small>
              <MoneyInput value={u.harga} onChange={(n) => setU(i, { harga: n })} />
            </div>
            <div className="bc">
              <small>Barcode</small>
              <div className="row">
                <input value={u.barcode || ''} onChange={(e) => setU(i, { barcode: e.target.value })} placeholder="scan / buat" />
                <button className="btn sm" title="Scan kamera" onClick={() => setScanFor(i)}><Icon name="scan" size={16} /></button>
                <button className="btn sm" title="Buat barcode toko" onClick={() => setU(i, { barcode: buatBarcode() })}>Buat</button>
              </div>
            </div>
            {i > 0 && <button className="icon-btn del" onClick={() => setUnits((us) => us.filter((_, j) => j !== i))} aria-label="Hapus satuan">✕</button>}
          </div>
        ))}
      </div>
      <datalist id="satuan-list">
        {['pcs', 'sak', 'kg', 'meter', 'batang', 'lembar', 'dus', 'roll', 'kaleng', 'pail', 'set', 'm³', 'rit', 'buah', 'palet'].map((s) => <option key={s} value={s} />)}
      </datalist>
      <button className="link-btn" onClick={() => setUnits((us) => [...us, { nama: '', isi: 0, harga: 0 }])}>+ Tambah satuan lain</button>

      <div className="grid2">
        {!product ? (
          <div>
            <label>Stok awal ({units[0].nama || 'satuan dasar'})</label>
            <input type="number" inputMode="decimal" step="any" value={stok || ''} onChange={(e) => setStok(Number(e.target.value))} placeholder="0" />
          </div>
        ) : (
          <div>
            <label>Stok sekarang</label>
            <p className="static">{stokLabel(product)} <span className="muted small">(ubah lewat "Sesuaikan stok")</span></p>
          </div>
        )}
        <div>
          <label>Peringatan stok menipis di bawah</label>
          <input type="number" inputMode="decimal" step="any" value={stokMin || ''} onChange={(e) => setStokMin(Number(e.target.value))} placeholder="0" />
        </div>
      </div>

      {errors.length > 0 && nama && <ul className="alert danger">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="row end">
        {product && st.isOwner && !hapus && <button className="btn danger-outline" onClick={() => setHapus(true)}>Hapus</button>}
        {hapus && product && (
          <button className="btn danger" onClick={() => { st.deleteProduct(product); onClose() }}>Yakin hapus "{product.nama}"?</button>
        )}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={errors.length > 0} onClick={save}>Simpan</button>
      </div>

      {scanFor !== null && (
        <Scanner title="Scan barcode barang" onResult={(c) => setU(scanFor, { barcode: c })} onClose={() => setScanFor(null)} />
      )}
    </Modal>
  )
}

/* ------------------------------ Sesuaikan stok ------------------------------ */

export function AdjustStock({ product, onClose }: { product: Product; onClose: () => void }) {
  const st = useStore()
  const [val, setVal] = useState<string>(String(product.stok))
  const [ket, setKet] = useState('')
  const n = Number(val)
  const delta = n - product.stok
  return (
    <Modal title={`Sesuaikan stok — ${product.nama}`} onClose={onClose}>
      <p>Stok tercatat: <b>{stokLabel(product)}</b></p>
      <label>Stok sebenarnya ({product.units[0].nama})</label>
      <div className="qty big">
        <button onClick={() => setVal(String(Math.max(0, n - 1)))}>−</button>
        <input type="number" inputMode="decimal" step="any" value={val} onChange={(e) => setVal(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
        <button onClick={() => setVal(String(n + 1))}>+</button>
      </div>
      {Number.isFinite(n) && delta !== 0 && (
        <p className={delta > 0 ? 'ok-text' : 'warn-text'}>{delta > 0 ? '+' : ''}{qtyFmt(delta)} {product.units[0].nama}</p>
      )}
      <label>Keterangan (opsional)</label>
      <input value={ket} onChange={(e) => setKet(e.target.value)} placeholder="cth. hitung ulang gudang" />
      <button className="btn primary block lg" disabled={!Number.isFinite(n) || val === '' || delta === 0}
        onClick={() => { st.setStock(product, n, ket.trim()); onClose() }}>
        Simpan stok
      </button>
    </Modal>
  )
}

/* ------------------------------ Cetak ------------------------------ */

function printDaftarHarga(products: Product[], namaToko: string) {
  const groups = new Map<string, Product[]>()
  for (const p of [...products].sort((a, b) => a.nama.localeCompare(b.nama))) {
    const k = p.kategori || 'Lain-lain'
    groups.set(k, [...(groups.get(k) || []), p])
  }
  const rows = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, ps]) =>
    `<tr class="grp"><td colspan="3">${esc(k)}</td></tr>` +
    ps.map((p) => p.units.map((u, i) =>
      `<tr><td>${i === 0 ? esc(p.nama) : ''}</td><td>${esc(u.nama)}${u.isi > 1 ? ` (${qtyFmt(u.isi)} ${esc(p.units[0].nama)})` : ''}</td><td class="r">${rp(u.harga)}</td></tr>`).join('')).join(''),
  ).join('')
  printHTML(`<div class="doc"><h2>Daftar Harga — ${esc(namaToko)}</h2><p>Per ${tgl(Date.now())}</p>
    <table class="tbl"><thead><tr><th>Barang</th><th>Satuan</th><th class="r">Harga</th></tr></thead><tbody>${rows}</tbody></table></div>`)
}

function LabelModal({ onClose }: { onClose: () => void }) {
  const st = useStore()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Record<string, number>>({}) // key productId|unitIndex -> jumlah label
  const list = q.trim() ? searchProducts(st.products, q, 200) : [...st.products].sort((a, b) => a.nama.localeCompare(b.nama))
  const tanpa = st.products.flatMap((p) => p.units.map((u, i) => ({ p, u, i }))).filter((x) => !x.u.barcode)

  function generateAll() {
    const byId = new Map<string, Product>()
    for (const { p, i } of tanpa) {
      const cur = byId.get(p.id) || { ...p, units: p.units.map((u) => ({ ...u })) }
      cur.units[i].barcode = buatBarcode()
      byId.set(p.id, cur)
    }
    byId.forEach((p) => st.saveProduct({ ...p, diubah: Date.now() }, false))
  }

  function print() {
    const items: string[] = []
    for (const [k, n] of Object.entries(sel)) {
      const [id, ui] = k.split('|')
      const p = st.products.find((x) => x.id === id)
      const u = p?.units[Number(ui)]
      if (!p || !u?.barcode) continue
      for (let j = 0; j < n; j++) {
        items.push(`<div class="lbl"><div class="ln">${esc(p.nama)}</div><div class="lp">${rp(u.harga)} / ${esc(u.nama)}</div>${barcodeSVG(u.barcode, { height: 34, width: 1.4, fontSize: 11 })}</div>`)
      }
    }
    if (!items.length) return alert('Pilih minimal satu label.')
    printHTML(`<div class="labels">${items.join('')}</div>`, '@page{size:A4;margin:8mm}')
  }

  const total = Object.values(sel).reduce((a, b) => a + b, 0)
  return (
    <Modal title="Cetak label barcode" onClose={onClose} wide>
      {tanpa.length > 0 && (
        <div className="alert info row between">
          <span>{tanpa.length} satuan barang belum punya barcode.</span>
          <button className="btn sm primary" onClick={generateAll}>Buatkan semua</button>
        </div>
      )}
      <input placeholder="Cari barang…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="label-list">
        {list.flatMap((p) => p.units.map((u, i) => {
          const k = `${p.id}|${i}`
          return (
            <div key={k} className="label-row">
              <div><b>{p.nama}</b> <span className="muted">· {u.nama} · {rp(u.harga)}</span>
                {!u.barcode && <div className="small warn-text">Belum ada barcode</div>}</div>
              <div className="qty sm">
                <button disabled={!sel[k]} onClick={() => setSel((s) => ({ ...s, [k]: Math.max(0, (s[k] || 0) - 1) }))}>−</button>
                <input type="number" min="0" value={sel[k] || 0} disabled={!u.barcode}
                  onChange={(e) => setSel((s) => ({ ...s, [k]: Math.max(0, Number(e.target.value) || 0) }))} />
                <button disabled={!u.barcode} onClick={() => setSel((s) => ({ ...s, [k]: (s[k] || 0) + 1 }))}>+</button>
              </div>
            </div>
          )
        }))}
      </div>
      <button className="btn primary block lg" disabled={!total} onClick={print}>Cetak {total} label (A4 / stiker)</button>
    </Modal>
  )
}
