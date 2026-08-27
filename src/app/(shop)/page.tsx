import { Suspense } from 'react'
import HomeView from '@/components/HomeView'

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <HomeView />
    </Suspense>
  )
}
