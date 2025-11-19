import { useCallback } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  getNonPaintableShapes,
  getShapeById,
  updateShape,
  useLiveryEditorStore,
} from '@/state/livery-store'

export const TemplateOptions = () => {
  const nonPaintableShape = useLiveryEditorStore(getNonPaintableShapes)

  if (nonPaintableShape.length === 0) {
    return null
  }

  return (
    <div className="space-y-5 rounded-md p-4 inset-shadow-[0_0_20px_rgba(0,0,0,0.3)] bg-neutral-900/35">
      {nonPaintableShape.map((shapeId) => (
        <TemplateOptionsItem key={shapeId} shapeId={shapeId} />
      ))}
    </div>
  )
}

const TemplateOptionsItem = ({ shapeId }: { shapeId: string }) => {
  const shape = useLiveryEditorStore((state) => getShapeById(state, shapeId))

  const onCheckedChange = useCallback(
    (checked: boolean) => {
      updateShape(shapeId, { visible: checked })
    },
    [shapeId],
  )

  return (
    <div className="flex items-center justify-between space-x-2">
      <Label htmlFor={shape?.name}>{shape?.name}</Label>
      <Switch
        id={shape?.name}
        onCheckedChange={onCheckedChange}
        checked={shape?.visible ?? true}
      />
    </div>
  )
}
