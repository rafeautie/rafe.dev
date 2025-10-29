import {
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  deleteSelectedShapes,
  useLiveryEditorStore,
} from '@/state/livery-editor-store'

export const ShapeMenu = () => {
  const selectedShapeIds = useLiveryEditorStore(
    (state) => state.selectedShapeIds,
  )

  if (selectedShapeIds.length < 1) {
    return null
  }

  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onClick={deleteSelectedShapes}>
        Delete
      </ContextMenuItem>
    </>
  )
}
