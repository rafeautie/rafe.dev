import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'
import InsetHeader from '@/components/inset-header'
import EditorCanvas from '@/components/livery-editor/editor-canvas'

export const Route = createFileRoute('/livery')({
  component: RouteComponent,
})

function RouteComponent() {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={containerRef}>
      <InsetHeader containerRef={containerRef} title="livery" />
      <EditorCanvas />
    </div>
  )
}
