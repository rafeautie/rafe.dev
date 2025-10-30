import { Layer, Transformer } from 'react-konva'
import { TRANSFORMER_REF } from '@/constants/livery'

export const TransformerLayer = () => {
  return (
    <Layer>
      <Transformer
        ref={TRANSFORMER_REF}
        anchorCornerRadius={25}
        anchorSize={8}
        anchorStrokeWidth={0}
        anchorFill="#fafafa"
        borderStroke="#fafafa"
      />
    </Layer>
  )
}
