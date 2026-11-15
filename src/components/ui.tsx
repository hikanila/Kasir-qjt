import { useEffect, type ReactNode } from 'react'

export function Modal({
  title, onClose, children, wide,
}: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    // Sentuhan di luar kotak sengaja TIDAK menutup jendela, agar isian tidak hilang tanpa sengaja.
    <div className="modal-bg">
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="close-btn" onClick={onClose} aria-label="Tutup" title="Tutup">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

const P: Record<string, string> = {
  kasir: 'M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  barang: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8',
  stok: 'M7 4v16M7 4 3 8m4-4 4 4M17 20V4m0 16-4-4m4 4 4-4',
  bon: 'M5 3h11l3 3v15H5V3Zm4 6h6m-6 4h6m-6 4h4',
  lainnya: 'M4 6h16M4 12h16M4 18h16',
  scan: 'M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8',
  plus: 'M12 5v14M5 12h14',
  cari: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
}

export function Icon({ name, size = 22 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || ''} />
    </svg>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

/** Input angka uang dengan pemisah ribuan. */
export function MoneyInput({
  value, onChange, autoFocus, placeholder, id,
}: { value: number; onChange: (n: number) => void; autoFocus?: boolean; placeholder?: string; id?: string }) {
  return (
    <input
      id={id}
      inputMode="numeric"
      autoFocus={autoFocus}
      placeholder={placeholder ?? '0'}
      value={value ? value.toLocaleString('id-ID') : ''}
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
      onFocus={(e) => e.target.select()}
    />
  )
}
