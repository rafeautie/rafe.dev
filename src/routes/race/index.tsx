import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'

import InsetHeader from '@/components/inset-header'
import { Menu } from '@/race/client/components/menu'

export const Route = createFileRoute('/race/')({
  component: App,
})

function App() {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div className="h-full" ref={containerRef}>
      <InsetHeader containerRef={containerRef} />
      <Menu allowCreateRoom />
    </div>
  )
}
