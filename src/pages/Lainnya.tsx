import { useEffect, useMemo, useState } from 'react'
import type { AppUser, Sale, Settings } from '../types'
import { useStore } from '../lib/store'
import { qtyFmt, rp, startOfDay, tgl, tglJam } from '../lib/format'
import { download } from '../lib/nota'
import {
  COLS, getFirebaseConfig, hasEnvConfig, parseFirebaseConfig, saveFirebaseConfig, snapshotAll, type Col,
} from '../lib/backend'
import { Empty } from '../components/ui'
import { NotaModal } from '../components/NotaModal'

type Tab = 'laporan' | 'aktivitas' | 'pengaturan'

export function Lainnya() {
  const st = useStore()
  const [tab, setTab] = useState<Tab>('laporan')
  return (
    <div className="page">
      <div className="seg">
        <button className={tab === 'laporan' ? 'on' : ''} onClick={() => setTab('laporan')}>Laporan</button>
        {st.isOwner && <button className={tab === 'aktivitas' ? 'on' : ''} onClick={() => setTab('aktivitas')}>Riwayat aktivitas</button>}
        <button className={tab === 'pengaturan' ? 'on' : ''} onClick={() => setTab('pengaturan')}>Pengaturan</button>
      </div>
      {tab === 'laporan' && <Laporan />}
      {tab === 'aktivitas' && st.isOwner && <Aktivitas />}
      {tab === 'pengaturan' && <Pengaturan />}
    </div>
  )
}

/* ------------------------------ Laporan ------------------------------ */

type Range = 'hari' | 'kemarin' | '7hari' | 'bulan' | 'bulanlalu'

function rangeOf(r: Range): [number, number] {
  const today = startOfDay()
  const now = new Date()
  switch (r) {
    case 'hari': return [today, Infinity]
    case 'kemarin': return [today - 864e5, today]
    case '7hari': return [today - 6 * 864e5, Infinity]
    case 'bulan': return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Infinity]
    case 'bulanlalu': return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime()]
  }
}

function Laporan() {
  const st = useStore()
  const [r, setR] = useState<Range>('hari')
  const [nota, setNota] = useState<Sale | null>(null)
  const [showBatal, setShowBatal] = useState(false)

  const d = useMemo(() => {
    const [a, b] = rangeOf(r)
    const sales = st.sales.filter((s) => s.waktu >= a && s.waktu < b).sort((x, y) => y.waktu - x.waktu)
    const ok = sales.filter((s) => s.status === 'ok')
    const sum = (f: (s: Sale) => number, l = ok) => l.reduce((acc, s) => acc + f(s), 0)
    const pay = st.payments.filter((p) => p.waktu >= a && p.waktu < b)
    const barang = new Map<string, { nama: string; qty: number; unit: string; omzet: number }>()
    for (const s of ok) for (const it of s.items) {
      const k = it.productId + it.unit
      const cur = barang.get(k) || { nama: it.nama, qty: 0, unit: it.unit, omzet: 0 }
      cur.qty += it.qty
      cur.omzet += it.qty * it.harga
      barang.set(k, cur)
    }
    const tunaiMasuk = sum((s) => (s.metode === 'tunai' ? s.total : s.metode === 'bon' ? s.bayar : 0)) + pay.filter((p) => p.metode === 'tunai').reduce((x, p) => x + p.jumlah, 0)
    return {
      sales, ok,
      omzet: sum((s) => s.total),
      tunai: sum((s) => (s.metode === 'tunai' ? s.total : 0)),
      transfer: sum((s) => (s.metode === 'transfer' ? s.total : 0)),
      bonBaru: sum((s) => (s.metode === 'bon' ? s.total - s.bayar : 0)),
      dp: sum((s) => (s.metode === 'bon' ? s.bayar : 0)),
      diskon: sum((s) => s.diskon),
      bayarBon: pay.reduce((x, p) => x + p.jumlah, 0),
      tunaiMasuk,
      batal: sales.length - ok.length,
      top: [...barang.values()].sort((x, y) => y.omzet - x.omzet).slice(0, 10),
    }
  }, [st.sales, st.payments, r])

  const list = showBatal ? d.sales : d.ok
  return (
    <>
      <select value={r} onChange={(e) => setR(e.target.value as Range)} className="range">
        <option value="hari">Hari ini</option>
        <option value="kemarin">Kemarin</option>
        <option value="7hari">7 hari terakhir</option>
        <option value="bulan">Bulan ini</option>
        <option value="bulanlalu">Bulan lalu</option>
      </select>
      <div className="stat-row">
        <div className="stat big"><small>Omzet penjualan</small><b>{rp(d.omzet)}</b><small>{d.ok.length} transaksi</small></div>
        <div className="stat"><small>Tunai</small><b>{rp(d.tunai)}</b></div>
        <div className="stat"><small>Transfer / QRIS</small><b>{rp(d.transfer)}</b></div>
        <div className="stat"><small>Bon baru</small><b className="warn-text">{rp(d.bonBaru)}</b>{d.dp > 0 && <small>+ DP {rp(d.dp)}</small>}</div>
        <div className="stat"><small>Bon dibayar</small><b className="ok-text">{rp(d.bayarBon)}</b></div>
        <div className="stat"><small>Uang tunai masuk laci</small><b>{rp(d.tunaiMasuk)}</b><small>tunai + DP + bayar bon tunai</small></div>
      </div>
      {(d.diskon > 0 || d.batal > 0) && <p className="muted small">Diskon diberikan: {rp(d.diskon)} · Transaksi dibatalkan: {d.batal}</p>}

      {d.top.length > 0 && (
        <div className="card">
          <h4>Barang terlaris</h4>
          <table className="tbl">
            <thead><tr><th>Barang</th><th className="r">Terjual</th><th className="r">Omzet</th></tr></thead>
            <tbody>{d.top.map((t) => <tr key={t.nama + t.unit}><td>{t.nama}</td><td className="r nowrap">{qtyFmt(t.qty)} {t.unit}</td><td className="r">{rp(t.omzet)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <div className="row between"><h4>Daftar transaksi</h4>
        <label className="check"><input type="checkbox" checked={showBatal} onChange={(e) => setShowBatal(e.target.checked)} /> tampilkan yang batal</label></div>
      {list.length === 0 && <Empty>Belum ada transaksi.</Empty>}
      <div className="history">
        {list.map((s) => (
          <button key={s.id} className={'hist-row' + (s.status === 'batal' ? ' batal' : '')} onClick={() => setNota(s)}>
            <div>
              <b>{s.no}</b> <span className={'badge m-' + s.metode}>{s.metode}</span>{s.status === 'batal' && <span className="badge t-keluar">batal</span>}
              <div className="small muted">{tglJam(s.waktu)} · {s.kasir}{s.pelangganNama ? ` · ${s.pelangganNama}` : ''} · {s.items.length} barang</div>
            </div>
            <b>{rp(s.total)}</b>
          </button>
        ))}
      </div>
      {nota && <NotaModal sale={nota} onClose={() => setNota(null)} allowCancel />}
    </>
  )
}

/* ------------------------------ Riwayat aktivitas ------------------------------ */

function Aktivitas() {
  const st = useStore()
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(150)
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return [...st.logs].filter((l) => !ql || `${l.user} ${l.aksi} ${l.detail}`.toLowerCase().includes(ql)).sort((a, b) => b.waktu - a.waktu)
  }, [st.logs, q])
  return (
    <>
      <p className="muted small">Semua perubahan harga, diskon, pembatalan, bon, dan stok tercatat di sini beserta siapa yang melakukannya.</p>
      <input placeholder="Cari (nama kasir, 'diskon', 'batal', nama barang…)" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && <Empty>Belum ada aktivitas.</Empty>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Waktu</th><th>Oleh</th><th>Aksi</th><th>Detail</th></tr></thead>
          <tbody>{list.slice(0, limit).map((l) => (
            <tr key={l.id}><td className="nowrap">{tglJam(l.waktu)}</td><td>{l.user}</td><td className="nowrap"><b>{l.aksi}</b></td><td>{l.detail}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {list.length > limit && <button className="btn block" onClick={() => setLimit((x) => x + 300)}>Tampilkan lebih banyak</button>}
    </>
  )
}

/* ------------------------------ Pengaturan ------------------------------ */

function Pengaturan() {
  const st = useStore()
  const [s, setS] = useState<Settings>(st.settings)
  const [saved, setSaved] = useState(false)
  const set = (p: Partial<Settings>) => { setS((x) => ({ ...x, ...p })); setSaved(false) }

  return (
    <>
      <div className="card">
        <h4>Info toko (kepala struk)</h4>
        <label>Nama toko</label>
        <input value={s.namaToko} onChange={(e) => set({ namaToko: e.target.value })} disabled={!st.isOwner} />
        <label>Alamat singkat</label>
        <input value={s.alamat} onChange={(e) => set({ alamat: e.target.value })} placeholder="Jl. …, Desa …, Kec. …" disabled={!st.isOwner} />
        <label>No. WA toko</label>
        <input value={s.wa} onChange={(e) => set({ wa: e.target.value })} inputMode="tel" placeholder="08…" disabled={!st.isOwner} />
        <label>Catatan kaki struk</label>
        <input value={s.footer} onChange={(e) => set({ footer: e.target.value })} disabled={!st.isOwner} />
        {st.isOwner && <button className="btn primary" onClick={() => { st.saveSettings(s); setSaved(true) }}>{saved ? '✓ Tersimpan' : 'Simpan'}</button>}
      </div>

      {st.backend.mode === 'online' && st.isOwner && <Pengguna />}
      {st.isOwner && <Koneksi />}
      {st.isOwner && <Backup />}

      <div className="card">
        <h4>Akun</h4>
        <p>Masuk sebagai <b>{st.me.nama}</b> ({st.me.role}){st.me.email ? ` · ${st.me.email}` : ''}</p>
        {st.backend.auth && <button className="btn danger-outline" onClick={() => confirm('Keluar dari akun?') && st.backend.auth!.logout()}>Keluar</button>}
      </div>
      <p className="muted small center">Kasir TB. Qeela Jaya Tama · versi 1.0</p>
    </>
  )
}

function Pengguna() {
  const st = useStore()
  const roles: AppUser['role'][] = ['pemilik', 'kasir', 'menunggu']
  const pending = st.users.filter((u) => u.role === 'menunggu')
  return (
    <div className="card">
      <h4>Pengguna</h4>
      <p className="muted small">Kasir baru mendaftar sendiri lewat tombol "Daftar" di halaman login, lalu Anda setujui di sini.</p>
      {pending.length > 0 && <p className="alert info">{pending.length} pendaftar menunggu persetujuan.</p>}
      {st.users.map((u) => (
        <div key={u.id} className="row between user-row">
          <div><b>{u.nama}</b><div className="small muted">{u.email}</div></div>
          {u.id === st.me.id ? <span className="badge">{u.role} (Anda)</span> : (
            <select value={u.role} onChange={(e) => st.setUserRole(u, e.target.value as AppUser['role'])}>
              {roles.map((r) => <option key={r} value={r}>{r === 'menunggu' ? 'nonaktif / menunggu' : r}</option>)}
            </select>
          )}
        </div>
      ))}
    </div>
  )
}

function Koneksi() {
  const st = useStore()
  const cfg = getFirebaseConfig()
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const online = st.backend.mode === 'online'
  return (
    <div className="card">
      <h4>Database online (sinkron antar perangkat)</h4>
      {online ? (
        <p className="alert ok">Tersambung ke Firebase project <b>{cfg?.projectId}</b>. Data otomatis tersinkron; saat offline, transaksi disimpan di perangkat dan dikirim saat online lagi.</p>
      ) : (
        <p className="alert info">Saat ini <b>mode lokal</b>: data hanya tersimpan di perangkat ini. Sambungkan ke Firebase agar pemilik dan kasir bisa memakai beberapa perangkat.</p>
      )}
      {!hasEnvConfig() && (
        <>
          <label>Tempel konfigurasi Firebase (firebaseConfig)</label>
          <textarea rows={6} value={text} onChange={(e) => { setText(e.target.value); setErr('') }}
            placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  …\n};'} />
          {err && <p className="small danger-text">{err}</p>}
          <div className="row">
            <button className="btn primary" disabled={!text.trim()} onClick={() => {
              try {
                const c = parseFirebaseConfig(text)
                if (!confirm(`Sambungkan ke project "${c.projectId}"? Aplikasi akan dimuat ulang dan Anda perlu login/daftar. Data mode lokal tidak ikut pindah otomatis — buat backup dulu bila perlu.`)) return
                saveFirebaseConfig(c)
                location.reload()
              } catch (e) { setErr('Format tidak dikenali: ' + (e as Error).message) }
            }}>Sambungkan</button>
            {online && <button className="btn danger-outline" onClick={() => {
              if (!confirm('Putuskan dari database online dan kembali ke mode lokal di perangkat ini?')) return
              saveFirebaseConfig(null); location.reload()
            }}>Putuskan</button>}
          </div>
        </>
      )}
    </div>
  )
}

function Backup() {
  const st = useStore()
  const [busy, setBusy] = useState(false)
  async function exportAll() {
    setBusy(true)
    try {
      const data = await snapshotAll(st.backend)
      const blob = new Blob([JSON.stringify({ app: 'kasir-qjt', versi: 1, waktu: Date.now(), data }, null, 1)], { type: 'application/json' })
      download(blob, `backup-kasir-${tgl(Date.now()).split('/').reverse().join('-')}.json`)
      try { localStorage.setItem('qjt-last-backup', String(Date.now())) } catch { /* */ }
    } finally { setBusy(false) }
  }
  function importAll(file: File) {
    file.text().then((t) => {
      const j = JSON.parse(t) as { app?: string; data?: Record<string, { id: string }[]> }
      if (j.app !== 'kasir-qjt' || !j.data) throw new Error('Bukan file backup aplikasi ini')
      const n = Object.values(j.data).reduce((a, l) => a + l.length, 0)
      if (!confirm(`Pulihkan ${n} data dari backup? Data yang ID-nya sama akan ditimpa.`)) return
      for (const c of COLS) {
        if (c === 'users') continue
        for (const row of j.data[c] || []) st.backend.put(c as Col, row)
      }
      alert('Backup dipulihkan.')
    }).catch((e) => alert('Gagal: ' + e))
  }
  return (
    <div className="card">
      <h4>Backup data</h4>
      <BackupStatus />
      <p className="muted small">Simpan cadangan secara berkala (mis. kirim ke WA/Google Drive sendiri). Backup juga dipakai untuk memindahkan data mode lokal ke database online.</p>
      <div className="row">
        <button className="btn" disabled={busy} onClick={exportAll}>Unduh backup</button>
        <label className="btn">Pulihkan dari file
          <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importAll(f); e.target.value = '' }} />
        </label>
      </div>
    </div>
  )
}

function BackupStatus() {
  const [persist, setPersist] = useState<boolean | null>(null)
  useEffect(() => { navigator.storage?.persisted?.().then(setPersist).catch(() => {}) }, [])
  let last = 0
  try { last = Number(localStorage.getItem('qjt-last-backup')) || 0 } catch { /* */ }
  return (
    <p className="small">
      Backup terakhir: <b>{last ? tglJam(last) : 'belum pernah'}</b>
      {persist !== null && <> · Penyimpanan permanen: <b className={persist ? 'ok-text' : 'warn-text'}>{persist ? 'aktif' : 'belum'}</b></>}
    </p>
  )
}
