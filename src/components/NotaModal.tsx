import { useMemo, useState } from 'react'
import type { Sale } from '../types'
import { useStore } from '../lib/store'
import { download, notaImage, notaLines, notaText, printNota, shareNotaImage, shareNotaText } from '../lib/nota'
import { Modal } from './ui'
import { rp } from '../lib/format'

export function NotaModal({
  sale, onClose, onNew, allowCancel,
}: { sale: Sale; onClose: () => void; onNew?: () => void; allowCancel?: boolean }) {
  const st = useStore()
  const [busy, setBusy] = useState(false)
  const [batal, setBatal] = useState(false)
  const [alasan, setAlasan] = useState('')
  const current = st.sales.find((s) => s.id === sale.id) || sale
  const hutangTotal = current.metode === 'bon' && current.pelangganId ? st.hutang.get(current.pelangganId) : undefined
  const lines = useMemo(() => notaLines(current, st.settings, hutangTotal), [current, st.settings, hutangTotal])

  const run = async (f: () => Promise<void> | void) => {
    setBusy(true)
    try { await f() } catch (e) { alert(String(e)) } finally { setBusy(false) }
  }

  return (
    <Modal title={`Nota ${current.no}`} onClose={onClose}>
      <pre className="nota-preview">{notaText(lines)}</pre>
      <div className="grid2">
        <button className="btn wa" disabled={busy} onClick={() => run(() => shareNotaImage(current, lines, st.settings.namaToko))}>
          Kirim WA (gambar)
        </button>
        <button className="btn wa-outline" disabled={busy} onClick={() => shareNotaText(current, lines)}>
          Kirim WA (teks)
        </button>
        <button className="btn" disabled={busy}
          onClick={() => run(async () => download(await notaImage(lines), `Nota-${current.no}.png`))}>
          Unduh gambar
        </button>
        <button className="btn" onClick={() => printNota(lines)}>Cetak / PDF</button>
      </div>
      {onNew && <button className="btn primary block lg" onClick={onNew}>Transaksi baru</button>}
      {allowCancel && current.status === 'ok' && (
        !batal ? (
          <button className="btn danger-outline block" onClick={() => setBatal(true)}>Batalkan transaksi</button>
        ) : (
          <div className="card danger-box">
            <p>Batalkan {current.no} ({rp(current.total)})? Stok barang akan dikembalikan.</p>
            <input placeholder="Alasan pembatalan (wajib)" value={alasan} onChange={(e) => setAlasan(e.target.value)} autoFocus />
            <div className="row">
              <button className="btn" onClick={() => setBatal(false)}>Tidak jadi</button>
              <button className="btn danger" disabled={!alasan.trim()}
                onClick={() => { st.cancelSale(current, alasan.trim()); setBatal(false) }}>
                Ya, batalkan
              </button>
            </div>
          </div>
        )
      )}
      {current.status === 'batal' && <p className="alert danger">Dibatalkan: {current.alasanBatal}</p>}
    </Modal>
  )
}
