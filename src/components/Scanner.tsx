import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats as F } from 'html5-qrcode'
import { Modal } from './ui'
import { beep } from '../lib/barcode'

const FORMATS = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.QR_CODE]

/**
 * Scan barcode pakai kamera.
 * continuous = tetap terbuka setelah scan (cocok untuk kasir); jika tidak, tertutup setelah satu kode.
 * onResult boleh mengembalikan pesan (mis. "Semen 50kg ditambahkan") untuk ditampilkan.
 */
export function Scanner({
  onResult, onClose, continuous = false, title = 'Scan barcode',
}: {
  onResult: (code: string) => string | void
  onClose: () => void
  continuous?: boolean
  title?: string
}) {
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const last = useRef({ code: '', t: 0 })
  const cb = useRef(onResult)
  cb.current = onResult
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const el = 'scanner-' + Math.random().toString(36).slice(2)
    const box = document.getElementById('scanner-box')!
    const div = document.createElement('div')
    div.id = el
    box.appendChild(div)
    const s = new Html5Qrcode(el, {
      formatsToSupport: FORMATS,
      verbose: false,
      useBarCodeDetectorIfSupported: true,
    })
    let stopped = false
    const started = s
      .start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: (w, h) => ({ width: Math.min(w * 0.85, 320), height: Math.min(h * 0.45, 160) }) },
        (text) => {
          const now = Date.now()
          if (text === last.current.code && now - last.current.t < 2000) return
          last.current = { code: text, t: now }
          beep()
          const m = cb.current(text)
          if (!continuous) close.current()
          else setMsg(m || text)
        },
        () => {},
      )
      .catch((e: unknown) => {
        const s = String(e)
        setErr(
          /NotAllowed|Permission/i.test(s)
            ? 'Izin kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu coba lagi.'
            : /NotFound|no camera/i.test(s)
              ? 'Kamera tidak ditemukan di perangkat ini.'
              : 'Kamera tidak dapat dibuka: ' + s,
        )
      })
    return () => {
      if (stopped) return
      stopped = true
      started.finally(() => {
        const finish = () => { try { s.clear() } catch { /* */ } div.remove() }
        if (s.isScanning) s.stop().then(finish, finish)
        else finish()
      })
    }
  }, [continuous])

  return (
    <Modal title={title} onClose={onClose}>
      <div id="scanner-box" className="scanner-box" />
      {err && <p className="alert danger">{err}</p>}
      {msg && <p className="alert ok">✓ {msg}</p>}
      <p className="muted small">
        Arahkan kamera ke barcode. {continuous ? 'Bisa scan beberapa barang berturut-turut.' : ''} Scanner USB/Bluetooth
        cukup ditembakkan saat kolom pencarian aktif.
      </p>
      <button className="btn block" onClick={onClose}>Selesai</button>
    </Modal>
  )
}
