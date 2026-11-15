import { useEffect, useState, type FormEvent } from 'react'
import type { AppUser } from './types'
import { createBackend, type AuthUser, type Backend } from './lib/backend'
import { StoreProvider, useStore } from './lib/store'
import { Icon } from './components/ui'
import { Kasir } from './pages/Kasir'
import { Barang } from './pages/Barang'
import { Stok } from './pages/Stok'
import { Bon } from './pages/Bon'
import { Lainnya } from './pages/Lainnya'

const LOCAL_ME: AppUser = { id: 'lokal', nama: 'Pemilik', role: 'pemilik' }

export default function App() {
  const [backend, setBackend] = useState<Backend | null>(null)
  useEffect(() => {
    createBackend().then(setBackend)
    // Minta browser agar data aplikasi tidak dihapus otomatis saat memori penuh.
    navigator.storage?.persist?.().catch(() => {})
  }, [])
  if (!backend) return <Splash text="Memuat…" />
  if (backend.mode === 'lokal') return <StoreProvider backend={backend} me={LOCAL_ME}><Shell /></StoreProvider>
  return <AuthGate backend={backend} />
}

function Splash({ text }: { text: string }) {
  return <div className="splash"><div className="logo">QJT</div><p>{text}</p></div>
}

/* ------------------------------ Login (mode online) ------------------------------ */

function AuthGate({ backend }: { backend: Backend }) {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [me, setMe] = useState<AppUser | null | undefined>(undefined)

  useEffect(() => backend.auth!.onChange(setUser), [backend])
  useEffect(() => {
    if (!user) { setMe(user === null ? null : undefined); return }
    setMe(undefined)
    return backend.subscribeDoc<AppUser>('users', user.uid, (u) => setMe(u))
  }, [backend, user])

  if (user === undefined) return <Splash text="Memeriksa akun…" />
  if (!user) return <Login backend={backend} />
  if (me === undefined) return <Splash text="Memuat data pengguna…" />
  if (!me) return <CompleteProfile backend={backend} user={user} />
  if (me.role === 'menunggu') {
    return (
      <div className="login">
        <div className="login-card">
          <div className="logo">QJT</div>
          <h2>Menunggu persetujuan</h2>
          <p>Akun <b>{user.email}</b> sudah terdaftar. Minta pemilik toko membuka <b>Lainnya → Pengaturan → Pengguna</b> dan mengubah hak Anda menjadi <b>kasir</b>.</p>
          <button className="btn block" onClick={() => backend.auth!.logout()}>Keluar</button>
        </div>
      </div>
    )
  }
  return <StoreProvider backend={backend} me={{ ...me, id: user.uid }}><Shell /></StoreProvider>
}

/** Akun login sudah ada tapi data penggunanya belum tercatat (mis. pendaftaran terputus). */
function CompleteProfile({ backend, user }: { backend: Backend; user: AuthUser }) {
  const [nama, setNama] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <div className="login">
      <div className="login-card">
        <div className="logo">QJT</div>
        <h2>Lengkapi pendaftaran</h2>
        <p>Akun <b>{user.email}</b> sudah dibuat, tapi pendaftarannya belum selesai. Isi nama Anda lalu kirim permintaan akses ke pemilik toko.</p>
        <label>Nama (tampil di struk)</label>
        <input value={nama} onChange={(e) => setNama(e.target.value)} autoFocus />
        <button className="btn primary block lg" disabled={!nama.trim() || sent} onClick={() => {
          setSent(true)
          backend.put('users', { id: user.uid, nama: nama.trim(), email: user.email || '', role: 'menunggu' })
        }}>{sent ? 'Mengirim…' : 'Kirim permintaan akses'}</button>
        <button className="btn block" onClick={() => backend.auth!.logout()}>Keluar</button>
      </div>
    </div>
  )
}

const authError = (e: unknown) => {
  const c = (e as { code?: string }).code || String(e)
  if (/invalid-credential|wrong-password|user-not-found/.test(c)) return 'Email atau kata sandi salah.'
  if (/email-already-in-use/.test(c)) return 'Email sudah terdaftar. Silakan masuk.'
  if (/weak-password/.test(c)) return 'Kata sandi minimal 6 karakter.'
  if (/invalid-email/.test(c)) return 'Format email tidak valid.'
  if (/network/.test(c)) return 'Tidak ada internet. Login pertama kali butuh koneksi.'
  if (/too-many/.test(c)) return 'Terlalu banyak percobaan. Coba lagi nanti.'
  if (/operation-not-allowed/.test(c)) return 'Login Email/Password belum diaktifkan di Firebase (Authentication → Sign-in method).'
  if (/api-key/.test(c)) return 'Konfigurasi Firebase salah (API key). Hubungi pengelola aplikasi.'
  return c
}

function Login({ backend }: { backend: Backend }) {
  const [mode, setMode] = useState<'masuk' | 'daftar'>('masuk')
  const [nama, setNama] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      if (mode === 'masuk') await backend.auth!.login(email.trim(), pass)
      else await backend.auth!.register(nama.trim(), email.trim(), pass)
    } catch (x) { setErr(authError(x)) } finally { setBusy(false) }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">QJT</div>
        <h2>Kasir TB. Qeela Jaya Tama</h2>
        <div className="seg">
          <button type="button" className={mode === 'masuk' ? 'on' : ''} onClick={() => setMode('masuk')}>Masuk</button>
          <button type="button" className={mode === 'daftar' ? 'on' : ''} onClick={() => setMode('daftar')}>Daftar</button>
        </div>
        {mode === 'daftar' && (
          <>
            <label>Nama (tampil di struk)</label>
            <input value={nama} onChange={(e) => setNama(e.target.value)} required />
          </>
        )}
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        <label>Kata sandi</label>
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required minLength={6}
          autoComplete={mode === 'masuk' ? 'current-password' : 'new-password'} />
        {err && <p className="alert danger">{err}</p>}
        <button className="btn primary block lg" disabled={busy}>{busy ? 'Memproses…' : mode === 'masuk' ? 'Masuk' : 'Daftar'}</button>
        {mode === 'daftar' && <p className="muted small">Pendaftar pertama otomatis menjadi <b>pemilik</b>. Pendaftar berikutnya menunggu persetujuan pemilik.</p>}
      </form>
    </div>
  )
}

/* ------------------------------ Kerangka aplikasi ------------------------------ */

type Page = 'kasir' | 'barang' | 'stok' | 'bon' | 'lainnya'
const NAV: { id: Page; label: string }[] = [
  { id: 'kasir', label: 'Kasir' },
  { id: 'barang', label: 'Barang' },
  { id: 'stok', label: 'Masuk/Keluar' },
  { id: 'bon', label: 'Bon' },
  { id: 'lainnya', label: 'Lainnya' },
]

function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true)
    const b = () => setOn(false)
    window.addEventListener('online', a)
    window.addEventListener('offline', b)
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b) }
  }, [])
  return on
}

function Shell() {
  const st = useStore()
  const [page, setPage] = useState<Page>(() => (sessionStorage.getItem('qjt-page') as Page) || 'kasir')
  const online = useOnline()
  useEffect(() => { sessionStorage.setItem('qjt-page', page) }, [page])
  const menipis = st.products.filter((p) => p.stok <= (p.stokMin ?? 0) && (p.stokMin ?? 0) > 0).length
  const bonCount = [...st.hutang.values()].filter((h) => h > 0.5).length

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo sm">QJT</span><span className="brand-name">{st.settings.namaToko}</span></div>
        <nav className="topnav">
          {NAV.map((n) => (
            <button key={n.id} className={page === n.id ? 'on' : ''} onClick={() => setPage(n.id)}>{n.label}</button>
          ))}
        </nav>
        <div className="status">
          {st.backend.mode === 'lokal'
            ? <span className="pill gray" title="Data hanya di perangkat ini">Mode lokal</span>
            : online ? <span className="pill green">● Online</span> : <span className="pill orange" title="Data disimpan di perangkat & dikirim saat online">● Offline</span>}
          <span className="me">{st.me.nama}</span>
        </div>
      </header>
      <BackupReminder onOpen={() => setPage('lainnya')} />
      <main className={'main' + (page === 'kasir' ? ' main-kasir' : '')}>
        {!st.ready ? <Splash text="Memuat data…" /> : (
          <>
            {page === 'kasir' && <Kasir />}
            {page === 'barang' && <Barang />}
            {page === 'stok' && <Stok />}
            {page === 'bon' && <Bon />}
            {page === 'lainnya' && <Lainnya />}
          </>
        )}
      </main>
      <nav className="bottomnav">
        {NAV.map((n) => (
          <button key={n.id} className={page === n.id ? 'on' : ''} onClick={() => setPage(n.id)}>
            <Icon name={n.id} />
            <span>{n.label}</span>
            {n.id === 'barang' && menipis > 0 && <i className="dot">{menipis}</i>}
            {n.id === 'bon' && bonCount > 0 && <i className="dot">{bonCount}</i>}
          </button>
        ))}
      </nav>
    </div>
  )
}

export const LAST_BACKUP_KEY = 'qjt-last-backup'

function BackupReminder({ onOpen }: { onOpen: () => void }) {
  const st = useStore()
  const [hide, setHide] = useState(false)
  if (hide || st.backend.mode !== 'lokal' || !st.isOwner || st.sales.length === 0) return null
  let last = 0
  try { last = Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0 } catch { /* */ }
  const hari = Math.floor((Date.now() - last) / 864e5)
  if (last && hari < 7) return null
  return (
    <div className="backup-banner">
      <span>{last ? `Backup terakhir ${hari} hari lalu.` : 'Data belum pernah di-backup.'} Data mode lokal hanya ada di perangkat ini.</span>
      <button className="btn sm" onClick={onOpen}>Backup</button>
      <button className="icon-btn" onClick={() => setHide(true)} aria-label="Tutup">✕</button>
    </div>
  )
}
