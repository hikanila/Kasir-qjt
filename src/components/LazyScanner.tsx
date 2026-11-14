import { lazy, Suspense, type ComponentProps } from 'react'

const Inner = lazy(() => import('./Scanner').then((m) => ({ default: m.Scanner })))

/** Scanner dimuat saat dibutuhkan saja agar aplikasi cepat terbuka. */
export function Scanner(props: ComponentProps<typeof Inner>) {
  return <Suspense fallback={null}><Inner {...props} /></Suspense>
}
