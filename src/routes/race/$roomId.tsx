import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'
import InsetHeader from '@/components/inset-header'
import { Race } from '@/race/client/components/race'

export const Route = createFileRoute('/race/$roomId')({
  component: App,
})

function App() {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div className="h-full" ref={containerRef}>
      <InsetHeader containerRef={containerRef} className="absolute" />
      <Race />
    </div>
  )
}
