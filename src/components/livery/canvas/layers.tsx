import { Layer } from 'react-konva'
import Shape from './shape'
import { useLiveryEditorStore } from '@/state/livery-store'

export const Layers = () => {
  const layers = useLiveryEditorStore((state) => state.layers)

  return (
    <>
      {layers.map((layer) => (
        <Layer key={layer.id} {...layer}>
          {layer.shapeIds.map((shapeId) => (
            <Shape key={shapeId} shapeId={shapeId} />
          ))}
        </Layer>
      ))}
    </>
  )
}
