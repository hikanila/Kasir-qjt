import { useEffect, useMemo, useState } from 'react'
import type { Col } from './backend'
import { useStore } from './store'

type Timed = { id: string; waktu: number }

/**
 * Data dalam rentang waktu [a, b).
 * Data terbaru sudah dimuat otomatis (`live`); bagian yang lebih tua dari `since`
 * diambil sekali dari database saat dibutuhkan, supaya kuota baca tetap kecil.
 */
export function useRange<T extends Timed>(col: Col, live: T[], since: number, a: number, b: number) {
  const { backend } = useStore()
  const needQuery = a < since
  const [old, setOld] = useState<T[] | null>(null)

  useEffect(() => {
    if (!needQuery) { setOld(null); return }
    let alive = true
    setOld(null)
    backend
      .query<T>(col, [
        { field: 'waktu', op: '>=', value: a },
        { field: 'waktu', op: '<', value: Math.min(b, since) },
      ])
      .then((r) => alive && setOld(r))
      .catch((e) => { console.error(e); if (alive) setOld([]) })
    return () => { alive = false }
  }, [backend, col, a, b, since, needQuery])

  const rows = useMemo(() => {
    const m = new Map<string, T>()
    for (const r of old || []) m.set(r.id, r)
    for (const r of live) if (r.waktu >= a && r.waktu < b) m.set(r.id, r)
    return [...m.values()]
  }, [old, live, a, b])

  return { rows, loading: needQuery && old === null }
}

/** Semua dokumen dengan field == value (mis. riwayat bon satu pelanggan), digabung dengan data terbaru. */
export function useWhere<T extends { id: string }>(col: Col, field: string, value: string, live: T[]) {
  const { backend } = useStore()
  const [old, setOld] = useState<T[] | null>(null)
  useEffect(() => {
    let alive = true
    backend.query<T>(col, [{ field, op: '==', value }])
      .then((r) => alive && setOld(r))
      .catch((e) => { console.error(e); if (alive) setOld([]) })
    return () => { alive = false }
  }, [backend, col, field, value])
  const rows = useMemo(() => {
    const m = new Map<string, T>()
    for (const r of old || []) m.set(r.id, r)
    for (const r of live) if ((r as unknown as Record<string, unknown>)[field] === value) m.set(r.id, r)
    return [...m.values()]
  }, [old, live, field, value])
  return { rows, loading: old === null }
}

export interface PeriodOption { key: string; label: string; a: number; b: number }

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** Pilihan bulan: bulan ini dan n-1 bulan sebelumnya. */
export function monthOptions(n = 12): PeriodOption[] {
  const now = new Date()
  const out: PeriodOption[] = []
  for (let i = 0; i < n; i++) {
    const a = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    out.push({ key: `m-${a.getFullYear()}-${a.getMonth() + 1}`, label: `${BULAN[a.getMonth()]} ${a.getFullYear()}`, a: a.getTime(), b: b.getTime() })
  }
  return out
}
