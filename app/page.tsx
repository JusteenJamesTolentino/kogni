'use client'

import dynamic from 'next/dynamic'

const NextClientApp = dynamic(() => import('../src/NextClientApp'), { ssr: false })

export default function HomePage() {
  return <NextClientApp />
}
