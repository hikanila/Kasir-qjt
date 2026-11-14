import { useMemo, useState } from 'react'
import type { Customer, Payment, Sale } from '../types'
import { useStore } from '../lib/store'
import { rp, tglJam, uid } from '../lib/format'
import { waLink } from '../lib/nota'
import { Empty, Icon, Modal, MoneyInput } from '../components/ui'
import { NotaModal } from '../components/NotaModal'

export function Bon() {
  const st = useStore()
  const [q, setQ] = useState('')
  const [semua, setSemua] = useState(false)
  const [open, setOpen] = useState<Customer | null>(null)
  const [baru, setBaru] = useState(false)

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return st.customers
      .map((c) => ({ c, h: st.hutang.get(c.id) || 0 }))
      .filter(({ c, h }) => (semua || h > 0.5) && (!ql || c.nama.toLowerCase().includes(ql) || (c.hp || '').includes(ql)))
      .sort((a, b) => b.h - a.h || a.c.nama.localeCompare(b.c.nama))
  }, [st.customers, st.hutang, q, semua])

  const totalPiutang = [...st.hutang.values()].filter((h) => h > 0).reduce((a, b) => a + b, 0)

  return (
    <div className="page">
      <div className="page-head">
        <h2>Bon / Hutang Pelanggan</h2>
        <button className="btn primary" onClick={() => setBaru(true)}><Icon name="plus" size={18} /> Pelanggan</button>
      </div>
      <div className="stat-row">
        <div className="stat"><small>Total piutang</small><b>{rp(totalPiutang)}</b></div>
        <div className="stat"><small>Pelanggan berhutang</small><b>{[...st.hutang.values()].filter((h) => h > 0.5).length}</b></div>
      </div>
      <div className="toolbar">
        <input placeholder="Cari pelanggan…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} /> Tampilkan semua pelanggan</label>
      </div>
      {list.length === 0 && <Empty>{semua ? 'Belum ada pelanggan.' : 'Tidak ada bon yang belum lunas. 👍'}</Empty>}
      <div className="plist">
        {list.map(({ c, h }) => (
          <button key={c.id} className="pcard pcard-main row between" onClick={() => setOpen(c)}>
            <div><b>{c.nama}</b>{c.hp && <div className="small muted">{c.hp}</div>}</div>
            <b className={h > 0.5 ? 'warn-text' : 'ok-text'}>{h > 0.5 ? rp(h) : 'Lunas'}</b>
          </button>
        ))}
      </div>
      {open && <CustomerDetail customer={st.customers.find((c) => c.id === open.id) || open} onClose={() => setOpen(null)} />}
      {baru && <CustomerForm onClose={() => setBaru(false)} />}
    </div>
  )
}

function CustomerForm({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const st = useStore()
  const [nama, setNama] = useState(customer?.nama || '')
  const [hp, setHp] = useState(customer?.hp || '')
  const [cat, setCat] = useState(customer?.catatan || '')
  return (
    <Modal title={customer ? 'Ubah pelanggan' : 'Pelanggan baru'} onClose={onClose}>
      <label>Nama</label>
      <input value={nama} onChange={(e) => setNama(e.target.value)} autoFocus />
      <label>No. HP / WA</label>
      <input value={hp} onChange={(e) => setHp(e.target.value)} inputMode="tel" placeholder="08…" />
      <label>Catatan</label>
      <input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="cth. tukang proyek Jl. Poros" />
      <button className="btn primary block lg" disabled={!nama.trim()} onClick={() => {
        st.saveCustomer({ id: customer?.id || uid(), nama: nama.trim(), hp: hp.trim() || undefined, catatan: cat.trim() || undefined, dibuat: customer?.dibuat || Date.now() })
        onClose()
      }}>Simpan</button>
    </Modal>
  )
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const st = useStore()
  const h = st.hutang.get(customer.id) || 0
  const [jumlah, setJumlah] = useState(0)
  const [metode, setMetode] = useState<Payment['metode']>('tunai')
  const [nota, setNota] = useState<Sale | null>(null)
  const [edit, setEdit] = useState(false)

  type Row = { t: number; kind: 'bon'; s: Sale } | { t: number; kind: 'bayar'; p: Payment }
  const rows: Row[] = [
    ...st.sales.filter((s) => s.pelangganId === customer.id && s.metode === 'bon' && s.status === 'ok').map((s) => ({ t: s.waktu, kind: 'bon' as const, s })),
    ...st.payments.filter((p) => p.customerId === customer.id).map((p) => ({ t: p.waktu, kind: 'bayar' as const, p })),
  ].sort((a, b) => b.t - a.t)

  function bayar() {
    if (!(jumlah > 0)) return
    st.addPayment({ id: uid(), customerId: customer.id, jumlah, metode, waktu: Date.now(), kasir: st.me.nama }, customer.nama)
    setJumlah(0)
  }

  function ingatkan() {
    waLink(customer.hp, `Assalamualaikum/Salam ${customer.nama},\nKami dari ${st.settings.namaToko} ingin mengingatkan sisa bon belanja sebesar *${rp(h)}*.\nTerima kasih atas kepercayaannya 🙏`)
  }

  return (
    <Modal title={customer.nama} onClose={onClose} wide>
      <div className="row between">
        <div>
          {customer.hp && <div className="muted">{customer.hp}</div>}
          {customer.catatan && <div className="small muted">{customer.catatan}</div>}
        </div>
        <button className="btn sm" onClick={() => setEdit(true)}>Ubah data</button>
      </div>
      <div className="stat-row">
        <div className="stat"><small>Sisa hutang</small><b className={h > 0.5 ? 'warn-text' : 'ok-text'}>{h > 0.5 ? rp(h) : 'Lunas'}</b></div>
      </div>

      {h > 0.5 && (
        <div className="card">
          <label>Terima pembayaran / cicilan</label>
          <div className="row">
            <div style={{ flex: 1 }}><MoneyInput value={jumlah} onChange={setJumlah} placeholder="Jumlah" /></div>
            <button className="btn sm" onClick={() => setJumlah(h)}>Lunasi</button>
          </div>
          <div className="seg sm">
            <button className={metode === 'tunai' ? 'on' : ''} onClick={() => setMetode('tunai')}>Tunai</button>
            <button className={metode === 'transfer' ? 'on' : ''} onClick={() => setMetode('transfer')}>Transfer / QRIS</button>
          </div>
          {jumlah > h && <p className="small warn-text">Melebihi sisa hutang ({rp(h)}).</p>}
          <button className="btn primary block" disabled={!(jumlah > 0)} onClick={bayar}>Simpan pembayaran</button>
          <button className="btn wa-outline block" onClick={ingatkan}>Kirim pengingat via WA</button>
        </div>
      )}

      <h4>Riwayat</h4>
      {rows.length === 0 && <p className="muted">Belum ada transaksi bon.</p>}
      <div className="history">
        {rows.map((r) => r.kind === 'bon' ? (
          <button key={r.s.id} className="hist-row" onClick={() => setNota(r.s)}>
            <div><b>Bon {r.s.no}</b><div className="small muted">{tglJam(r.t)} · {r.s.items.length} barang · total {rp(r.s.total)}{r.s.bayar ? ` · DP ${rp(r.s.bayar)}` : ''}</div></div>
            <b className="warn-text">+{rp(r.s.total - r.s.bayar)}</b>
          </button>
        ) : (
          <div key={r.p.id} className="hist-row">
            <div><b>Pembayaran ({r.p.metode})</b><div className="small muted">{tglJam(r.t)} · diterima {r.p.kasir}</div></div>
            <b className="ok-text">−{rp(r.p.jumlah)}</b>
          </div>
        ))}
      </div>
      {nota && <NotaModal sale={nota} onClose={() => setNota(null)} />}
      {edit && <CustomerForm customer={customer} onClose={() => setEdit(false)} />}
    </Modal>
  )
}
