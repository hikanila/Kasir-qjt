import { useState } from 'react'
import type { Customer } from '../types'
import { useStore } from '../lib/store'
import { rp, uid } from '../lib/format'

/** Pilih pelanggan lama atau ketik nama baru. */
export function CustomerPicker({
  value, onChange,
}: { value: Customer | null; onChange: (c: Customer | null) => void }) {
  const st = useStore()
  const [q, setQ] = useState('')
  const [hp, setHp] = useState('')

  if (value) {
    const h = st.hutang.get(value.id) || 0
    return (
      <div className="picked">
        <div>
          <b>{value.nama}</b> {value.hp && <span className="muted">· {value.hp}</span>}
          {h > 0 && <div className="small warn-text">Hutang berjalan: {rp(h)}</div>}
        </div>
        <button className="btn sm" onClick={() => onChange(null)}>Ganti</button>
      </div>
    )
  }
  const found = q.trim()
    ? st.customers.filter((c) => c.nama.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6)
    : []
  const exact = st.customers.some((c) => c.nama.toLowerCase() === q.trim().toLowerCase())
  return (
    <div className="picker">
      <input placeholder="Nama pelanggan / tukang" value={q} onChange={(e) => setQ(e.target.value)} />
      {found.map((c) => (
        <button key={c.id} className="list-btn" onClick={() => onChange(c)}>
          {c.nama} {c.hp && <span className="muted">· {c.hp}</span>}
          {(st.hutang.get(c.id) || 0) > 0 && <span className="badge warn">{rp(st.hutang.get(c.id) || 0)}</span>}
        </button>
      ))}
      {q.trim() && !exact && (
        <div className="new-cust">
          <input placeholder="No. HP/WA (opsional)" inputMode="tel" value={hp} onChange={(e) => setHp(e.target.value)} />
          <button className="btn sm primary" onClick={() => {
            const c: Customer = { id: uid(), nama: q.trim(), hp: hp.trim() || undefined, dibuat: Date.now() }
            st.saveCustomer(c)
            onChange(c)
          }}>+ Pelanggan baru "{q.trim()}"</button>
        </div>
      )}
    </div>
  )
}
