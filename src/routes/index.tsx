import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'
import InsetHeader from '@/components/inset-header'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef}>
      <InsetHeader containerRef={containerRef} title="rafe.dev" />
    </div>
  )
}
