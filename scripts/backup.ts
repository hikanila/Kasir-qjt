/**
 * Backup otomatis Kasir TB. Qeela Jaya Tama → email.
 * Dijalankan oleh GitHub Actions (.github/workflows/backup.yml).
 *
 *   npx tsx scripts/backup.ts mingguan   → data 8 hari terakhir (zip)
 *   npx tsx scripts/backup.ts bulanan    → seluruh data (zip) + laporan Excel bulan lalu
 *
 * Opsi uji:  --dry-run (simpan ke folder backup-out/, tidak kirim email)
 *            --from-file data.json (pakai data contoh, tanpa Firebase)
 *
 * PENTING: repositori ini publik dan log GitHub Actions bisa dilihat orang lain.
 * Skrip ini TIDAK BOLEH mencetak isi data — hanya jumlah dokumen.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { buildMonthlyReport, summarize } from '../src/lib/report'
import type { Customer, Payment, Product, Sale, Settings } from '../src/types'
import type { Query } from 'firebase-admin/firestore'

type Rows = Record<string, unknown>[]
const COLS = ['products', 'customers', 'settings', 'users', 'meta', 'sales', 'payments', 'moves', 'logs'] as const
const TIMED = new Set(['sales', 'payments', 'moves', 'logs'])

const args = process.argv.slice(2)
const mode = args[0] === 'bulanan' ? 'bulanan' : 'mingguan'
const dryRun = args.includes('--dry-run')
const fromFile = args.includes('--from-file') ? args[args.indexOf('--from-file') + 1] : null

const pad = (n: number) => String(n).padStart(2, '0')
const tgl = (t: number) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` }
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const rp = (n: number) => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

async function loadData(since: number | null): Promise<Record<string, Rows>> {
  if (fromFile) {
    const j = JSON.parse(readFileSync(fromFile, 'utf8')) as { data: Record<string, Rows> }
    const out: Record<string, Rows> = {}
    for (const c of COLS) {
      const rows = j.data[c] || []
      out[c] = since && TIMED.has(c) ? rows.filter((r) => (r.waktu as number) >= since) : rows
    }
    return out
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Secret FIREBASE_SERVICE_ACCOUNT belum diisi')
  const { initializeApp, cert } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')
  const app = initializeApp({ credential: cert(JSON.parse(raw)) })
  const db = getFirestore(app)
  const base = db.collection('toko').doc('utama')
  const out: Record<string, Rows> = {}
  for (const c of COLS) {
    let q: Query = base.collection(c)
    if (since && TIMED.has(c)) q = q.where('waktu', '>=', since)
    const snap = await q.get()
    out[c] = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
  }
  return out
}

async function main() {
  const now = Date.now()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const since = mode === 'mingguan' ? today.getTime() - 8 * 864e5 : null
  const data = await loadData(since)
  console.log(`Mode ${mode}: ` + COLS.map((c) => `${c}=${data[c].length}`).join(', '))

  const settings = (data.settings.find((s) => s.id === 'toko') as Settings | undefined)
  const namaToko = settings?.namaToko || 'TB. Qeela Jaya Tama'
  const sales = data.sales as unknown as Sale[]
  const payments = data.payments as unknown as Payment[]
  const customers = data.customers as unknown as Customer[]
  const products = data.products as unknown as Product[]

  // Arsip JSON (format sama dengan tombol "Unduh backup" di aplikasi, bisa dipulihkan lewat "Pulihkan dari file").
  const zip = new JSZip()
  const jenis = mode === 'mingguan' ? 'mingguan (8 hari terakhir)' : 'lengkap'
  zip.file(`backup-kasir-${iso(now)}.json`, JSON.stringify({ app: 'kasir-qjt', versi: 1, waktu: now, jenis, data }))
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
  const attachments: { filename: string; content: Buffer }[] = [
    { filename: `Backup-${mode}-QJT-${iso(now)}.zip`, content: zipBuf },
  ]

  let subject: string
  let ringkas: string
  const piutang = customers.reduce((a, c) => a + Math.max(0, c.saldo || 0), 0)

  if (mode === 'bulanan') {
    const a = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime()
    const b = new Date(today.getFullYear(), today.getMonth(), 1).getTime()
    const label = `${BULAN[new Date(a).getMonth()]} ${new Date(a).getFullYear()}`
    const xls = await buildMonthlyReport({ namaToko, judulPeriode: label, a, b, sales, payments, products, customers })
    attachments.push({ filename: `Laporan ${namaToko} - ${label}.xlsx`, content: Buffer.from(xls) })
    const s = summarize(sales.filter((x) => x.waktu >= a && x.waktu < b), payments.filter((x) => x.waktu >= a && x.waktu < b))
    subject = `[Backup ${namaToko}] Laporan & backup lengkap — ${label}`
    ringkas = [
      `Laporan bulan ${label}:`,
      `- Omzet: ${rp(s.omzet)} (${s.transaksi} transaksi)`,
      `- Tunai: ${rp(s.tunai)} · Transfer/QRIS: ${rp(s.transfer)}`,
      `- Bon baru: ${rp(s.bonBaru)} · Bon dibayar: ${rp(s.bayarBon)}`,
      `- Transaksi dibatalkan: ${s.batal}`,
      `Total piutang saat ini: ${rp(piutang)}`,
      '',
      'Lampiran: laporan Excel bulan lalu + backup LENGKAP seluruh data (zip).',
    ].join('\n')
  } else {
    const a = today.getTime() - 7 * 864e5
    const s = summarize(sales.filter((x) => x.waktu >= a), payments.filter((x) => x.waktu >= a))
    subject = `[Backup ${namaToko}] Mingguan — ${tgl(a)} s.d. ${tgl(now)}`
    ringkas = [
      `Ringkasan 7 hari terakhir (${tgl(a)} – ${tgl(now)}):`,
      `- Omzet: ${rp(s.omzet)} (${s.transaksi} transaksi)`,
      `- Bon baru: ${rp(s.bonBaru)} · Bon dibayar: ${rp(s.bayarBon)}`,
      `- Transaksi dibatalkan: ${s.batal}`,
      `Total piutang saat ini: ${rp(piutang)}`,
      '',
      'Lampiran: backup transaksi 8 hari terakhir + data barang & pelanggan terbaru (zip).',
      'Backup lengkap seluruh data dikirim setiap tanggal 1.',
    ].join('\n')
  }
  const body = `${ringkas}\n\nCara memulihkan: buka file zip, lalu di aplikasi pilih Lainnya → Pengaturan → Pulihkan dari file, dan pilih file .json di dalamnya.\nSimpan email ini; jangan diteruskan ke orang lain karena berisi data pelanggan.\n\n— Backup otomatis aplikasi kasir`

  if (dryRun) {
    mkdirSync('backup-out', { recursive: true })
    for (const f of attachments) writeFileSync(`backup-out/${f.filename}`, f.content)
    writeFileSync('backup-out/email.txt', `Subject: ${subject}\n\n${body}`)
    console.log('Dry run: file disimpan di backup-out/')
    return
  }

  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  const to = process.env.BACKUP_TO || user
  if (!user || !pass) throw new Error('Secret GMAIL_USER / GMAIL_APP_PASSWORD belum diisi')
  const { default: nodemailer } = await import('nodemailer')
  const tr = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: pass.replace(/\s/g, '') } })
  await tr.sendMail({ from: `"Backup ${namaToko}" <${user}>`, to, subject, text: body, attachments })
  console.log(`Email terkirim (${attachments.length} lampiran, ${(zipBuf.length / 1024).toFixed(0)} KB zip).`)
}

main().catch((e) => {
  // Cetak pesan saja (tanpa data).
  console.error('Backup gagal:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
