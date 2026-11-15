import { monthOptions } from '../lib/range'

export const RECENT = 'baru'
const MONTHS = monthOptions(12)

/** [a, b) untuk pilihan periode riwayat: "31 hari terakhir" atau bulan tertentu. */
export function periodRange(key: string, since: number): [number, number] {
  const m = MONTHS.find((x) => x.key === key)
  return m ? [m.a, m.b] : [since, Infinity]
}

export function PeriodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 'auto' }}>
      <option value={RECENT}>31 hari terakhir</option>
      {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
    </select>
  )
}
