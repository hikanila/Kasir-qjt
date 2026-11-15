import Dexie, { liveQuery } from 'dexie'
import type { FirebaseOptions } from 'firebase/app'
import { FIREBASE_CONFIG } from '../firebase-config'

export type Col = 'products' | 'sales' | 'customers' | 'payments' | 'moves' | 'logs' | 'settings' | 'users'
export const COLS: Col[] = ['products', 'sales', 'customers', 'payments', 'moves', 'logs', 'settings', 'users']

type Doc = { id: string }

export interface AuthUser {
  uid: string
  email: string | null
}

export interface AuthApi {
  onChange(cb: (u: AuthUser | null) => void): () => void
  login(email: string, pass: string): Promise<void>
  register(nama: string, email: string, pass: string): Promise<void>
  logout(): Promise<void>
}

/** Batas bawah waktu: hanya dokumen dengan field >= from yang dimuat. */
export interface Since { field: string; from: number }

export type Where = { field: string; op: '>=' | '<' | '=='; value: string | number }

export interface Backend {
  mode: 'lokal' | 'online'
  /** Pantau koleksi secara langsung. Dengan `since`, hanya data terbaru yang dimuat (hemat kuota). */
  subscribe<T>(col: Col, cb: (rows: T[]) => void, since?: Since): () => void
  /** Ambil data sekali (mis. laporan bulan lama). Saat offline memakai salinan di perangkat. */
  query<T>(col: Col, where: Where[]): Promise<T[]>
  /** Ubah sebagian field dokumen. */
  update(col: Col, id: string, patch: Record<string, unknown>): void
  /** Tambah/kurangi angka secara atomik (aman dipakai beberapa perangkat bersamaan). */
  increment(col: Col, id: string, field: string, delta: number): void
  subscribeDoc<T>(col: Col, id: string, cb: (row: T | null) => void): () => void
  /** Tulis dokumen. Tidak perlu ditunggu: saat offline, data diantrikan dan dikirim otomatis saat online. */
  put<T extends Doc>(col: Col, doc: T): void
  remove(col: Col, id: string): void
  /** Tambah/kurangi stok secara atomik (aman dipakai beberapa kasir bersamaan). */
  addStock(productId: string, delta: number): void
  auth?: AuthApi
}

/* ------------------------------ MODE LOKAL ------------------------------ */

class LocalDB extends Dexie {
  constructor() {
    super('kasir-qjt')
    const schema: Record<string, string> = {}
    for (const c of COLS) schema[c] = 'id'
    this.version(1).stores(schema)
  }
}

function localBackend(): Backend {
  const db = new LocalDB()
  return {
    mode: 'lokal',
    subscribe<T>(col: Col, cb: (rows: T[]) => void, since?: Since) {
      const q = () => since
        ? db.table(col).filter((r: Record<string, number>) => (r[since.field] ?? 0) >= since.from).toArray()
        : db.table(col).toArray()
      const sub = liveQuery(q).subscribe({
        next: (rows) => cb(rows as T[]),
        error: (e) => console.error(col, e),
      })
      return () => sub.unsubscribe()
    },
    subscribeDoc<T>(col: Col, id: string, cb: (row: T | null) => void) {
      const sub = liveQuery(() => db.table(col).get(id)).subscribe({
        next: (row) => cb((row as T) ?? null),
        error: (e) => console.error(col, e),
      })
      return () => sub.unsubscribe()
    },
    async query<T>(col: Col, where: Where[]) {
      const rows = await db.table(col).filter((r: Record<string, string | number>) => where.every((w) =>
        w.op === '==' ? r[w.field] === w.value : w.op === '>=' ? r[w.field] >= w.value : r[w.field] < w.value,
      )).toArray()
      return rows as T[]
    },
    put(col, doc) {
      db.table(col).put(JSON.parse(JSON.stringify(doc))).catch((e) => alert('Gagal menyimpan: ' + e))
    },
    update(col, id, patch) {
      db.table(col).update(id, JSON.parse(JSON.stringify(patch))).catch((e) => alert('Gagal menyimpan: ' + e))
    },
    increment(col, id, field, delta) {
      db.table(col)
        .where('id')
        .equals(id)
        .modify((r: Record<string, number>) => {
          r[field] = Math.round(((r[field] || 0) + delta) * 1000) / 1000
        })
        .catch((e) => alert('Gagal menyimpan: ' + e))
    },
    remove(col, id) {
      db.table(col).delete(id).catch((e) => alert('Gagal menghapus: ' + e))
    },
    addStock(productId, delta) {
      this.increment('products', productId, 'stok', delta)
    },
  }
}

/* ------------------------------ MODE ONLINE (Firebase) ------------------------------ */

const CFG_KEY = 'qjt-firebase-config'

export function getFirebaseConfig(): FirebaseOptions | null {
  const env = import.meta.env
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }
  }
  if (FIREBASE_CONFIG.apiKey) return FIREBASE_CONFIG
  try {
    const raw = localStorage.getItem(CFG_KEY)
    return raw ? (JSON.parse(raw) as FirebaseOptions) : null
  } catch {
    return null
  }
}

/** Terima config yang ditempel dari Firebase Console (boleh format JS `const firebaseConfig = {...}`). */
export function parseFirebaseConfig(text: string): FirebaseOptions {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('Tidak ditemukan tanda { ... }')
  const json = m[0]
    .replace(/\/\/.*$/gm, '')
    .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
    .replace(/'/g, '"')
    .replace(/,\s*}/g, '}')
  const cfg = JSON.parse(json) as FirebaseOptions
  if (!cfg.apiKey || !cfg.projectId) throw new Error('apiKey / projectId tidak ada')
  return cfg
}

export function saveFirebaseConfig(cfg: FirebaseOptions | null) {
  if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
  else localStorage.removeItem(CFG_KEY)
}

export const hasEnvConfig = () => Boolean(import.meta.env.VITE_FIREBASE_API_KEY || FIREBASE_CONFIG.apiKey)

async function firebaseBackend(cfg: FirebaseOptions): Promise<Backend> {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import('firebase/app'),
    import('firebase/firestore'),
    import('firebase/auth'),
  ])
  const app = initializeApp(cfg)
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  })
  const auth = au.initializeAuth(app, {
    persistence: [au.indexedDBLocalPersistence, au.browserLocalPersistence],
  })
  const TOKO = ['toko', 'utama'] as const
  const col = (c: string) => fs.collection(db, ...TOKO, c)
  const fail = (what: string) => (e: unknown) => {
    console.error(what, e)
    alert(`Gagal ${what}: ${e instanceof Error ? e.message : e}`)
  }

  return {
    mode: 'online',
    subscribe<T>(c: Col, cb: (rows: T[]) => void, since?: Since) {
      const ref = since ? fs.query(col(c), fs.where(since.field, '>=', since.from)) : col(c)
      return fs.onSnapshot(
        ref,
        (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T)),
        (e) => console.error(c, e),
      )
    },
    subscribeDoc<T>(c: Col, id: string, cb: (row: T | null) => void) {
      return fs.onSnapshot(
        fs.doc(col(c), id),
        (d) => cb(d.exists() ? ({ ...d.data(), id: d.id } as T) : null),
        (e) => console.error(c, e),
      )
    },
    async query<T>(c: Col, where: Where[]) {
      const q = fs.query(col(c), ...where.map((w) => fs.where(w.field, w.op, w.value)))
      let snap
      try { snap = await fs.getDocs(q) } catch { snap = await fs.getDocsFromCache(q) }
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T)
    },
    put(c, d) {
      fs.setDoc(fs.doc(col(c), d.id), d).catch(fail('menyimpan'))
    },
    update(c, id, patch) {
      fs.updateDoc(fs.doc(col(c), id), patch).catch(fail('menyimpan'))
    },
    increment(c, id, field, delta) {
      fs.updateDoc(fs.doc(col(c), id), { [field]: fs.increment(delta) }).catch(fail('menyimpan'))
    },
    remove(c, id) {
      fs.deleteDoc(fs.doc(col(c), id)).catch(fail('menghapus'))
    },
    addStock(productId, delta) {
      fs.updateDoc(fs.doc(col('products'), productId), { stok: fs.increment(delta) }).catch(fail('mengubah stok'))
    },
    auth: {
      onChange(cb) {
        return au.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null))
      },
      async login(email, pass) {
        await au.signInWithEmailAndPassword(auth, email, pass)
      },
      async register(nama, email, pass) {
        const { user } = await au.createUserWithEmailAndPassword(auth, email, pass)
        // Pendaftar pertama otomatis menjadi pemilik; berikutnya menunggu persetujuan pemilik.
        const ownerRef = fs.doc(db, ...TOKO, 'meta', 'pemilik')
        const owner = await fs.getDoc(ownerRef)
        const batch = fs.writeBatch(db)
        const userRef = fs.doc(col('users'), user.uid)
        if (!owner.exists()) {
          batch.set(ownerRef, { uid: user.uid })
          batch.set(userRef, { nama, email, role: 'pemilik' })
        } else {
          batch.set(userRef, { nama, email, role: 'menunggu' })
        }
        await batch.commit()
      },
      async logout() {
        await au.signOut(auth)
      },
    },
  }
}

export async function createBackend(): Promise<Backend> {
  const cfg = getFirebaseConfig()
  if (cfg) {
    try {
      return await firebaseBackend(cfg)
    } catch (e) {
      console.error('Firebase gagal dimuat, kembali ke mode lokal', e)
      alert('Koneksi database online gagal disiapkan. Aplikasi memakai mode lokal.\n' + e)
    }
  }
  return localBackend()
}

/** Ambil seluruh isi database (untuk backup). */
export function snapshotAll(backend: Backend): Promise<Record<Col, unknown[]>> {
  return new Promise((resolve) => {
    const out = {} as Record<Col, unknown[]>
    const unsubs: (() => void)[] = []
    let left = COLS.length
    for (const c of COLS) {
      let done = false
      unsubs.push(
        backend.subscribe(c, (rows) => {
          if (done) return
          done = true
          out[c] = rows
          if (--left === 0) {
            unsubs.forEach((u) => u())
            resolve(out)
          }
        }),
      )
    }
  })
}
