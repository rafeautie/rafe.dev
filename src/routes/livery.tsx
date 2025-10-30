import { createFileRoute } from '@tanstack/react-router'
import { Canvas } from '@/components/livery/canvas'

export const Route = createFileRoute('/livery')({
  component: RouteComponent,
})

function RouteComponent() {
  return <Canvas />
}
