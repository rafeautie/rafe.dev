import { createFileRoute } from '@tanstack/react-router'
import { Canvas } from '@/components/livery/canvas'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { CommandControls } from '@/components/livery/commands/command-controls'
import { LayersPanel } from '@/components/livery/layers-panel'
import { ShapePropertiesPanel } from '@/components/livery/shape-properties-panel'
import { CommandPalette } from '@/components/livery/commands/command-palette'

export const Route = createFileRoute('/livery')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="absolute top-0 left-0 right-0 bottom-0 h-(--inset-area-height) rounded-lg border-solid border-[calc(var(--inset-area-border))] border-blue-500 select-none overflow-hidden">
      <Canvas />
      <div className="flex justify-between items-start h-(--canvas-area-height) absolute inset-0 py-5 px-5 pointer-events-none">
        <div className="flex gap-4 pointer-events-auto">
          <SidebarTrigger variant="outline" size="icon" />
          <CommandControls />
        </div>
        <div className="flex flex-col justify-start gap-5 h-full">
          <LayersPanel />
          <ShapePropertiesPanel />
        </div>
      </div>
      <CommandPalette />
    </div>
  )
}
