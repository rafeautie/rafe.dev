import { useCallback, useMemo } from 'react'
import { motion } from 'motion/react'
import { ChevronDownIcon } from 'lucide-react'
import { uniqWith } from 'lodash'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { ShapePropertyItem } from './shape-property-item'
import { setIsPanelOpen, useLiveryEditorStore } from '@/state/livery-store'
import { SHAPE_ATTRIBUTE_CONFIG, TRANSFORMER_REF } from '@/constants/livery'
import { cn } from '@/lib/utils'

export const ShapePropertiesPanel = () => {
  const isOpen = useLiveryEditorStore((state) => state.panels.shapePanel.isOpen)
  const selectedShapeIds = useLiveryEditorStore(
    (state) => state.selectedShapeIds,
  )
  const hasOneShape = selectedShapeIds.length === 1
  const visibility = isOpen && hasOneShape

  const shapeAttributes = useMemo(() => {
    const nodes = TRANSFORMER_REF.current?.getNodes()
    const mappedNodes = selectedShapeIds.map((id) => {
      return nodes?.find((node) => node.attrs.id === id)
    })
    const selectedClassname = mappedNodes[0]?.getClassName()

    if (!selectedClassname) {
      return SHAPE_ATTRIBUTE_CONFIG.Base
    }

    return uniqWith(
      [
        ...SHAPE_ATTRIBUTE_CONFIG[
          selectedClassname as keyof typeof SHAPE_ATTRIBUTE_CONFIG
        ],
        ...SHAPE_ATTRIBUTE_CONFIG.Base,
      ],
      (a, b) => a.key === b.key,
    )
  }, [selectedShapeIds])

  const onVisibleTriggerClick = useCallback(() => {
    if (selectedShapeIds.length === 1) {
      setIsPanelOpen('shapePanel', !isOpen)
    }
  }, [selectedShapeIds.length, isOpen])

  return (
    <Card
      variant="translucent"
      className={cn(
        'pointer-events-auto overflow-hidden w-96 min-h-[106px] max-h-[calc(var(--canvas-area-height-with-padding))]',
      )}
      onContextMenu={(e) => {
        e.preventDefault()
      }}
    >
      <CardHeader className="cursor-pointer" onClick={onVisibleTriggerClick}>
        <div className="flex items-center justify-between">
          <CardTitle>Properties</CardTitle>
          <motion.div
            transition={{ duration: 0.3 }}
            initial={{
              rotate: visibility ? 0 : 90,
              opacity: selectedShapeIds.length === 1 ? 1 : 0.5,
            }}
            animate={{
              rotate: visibility ? 0 : 90,
              opacity: selectedShapeIds.length === 1 ? 1 : 0.5,
            }}
          >
            <ChevronDownIcon />
          </motion.div>
        </div>
      </CardHeader>
      <CardContent className="pl-6 pr-3 overflow-y-scroll">
        <motion.div
          className={cn('flex flex-col gap-2', {
            'pointer-events-none': !visibility,
          })}
          transition={{
            duration: 0.3,
          }}
          initial={{
            opacity: visibility ? 1 : 0,
            height: visibility ? 'auto' : 0,
          }}
          animate={{
            opacity: visibility ? 1 : 0,
            height: visibility ? 'auto' : 0,
          }}
        >
          {shapeAttributes.map((attr) => (
            <ShapePropertyItem
              {...attr}
              propKey={attr.key}
              shapeId={selectedShapeIds[0]}
              key={attr.key}
            />
          ))}
        </motion.div>
        <motion.div
          transition={{ duration: 0.2 }}
          className="absolute bottom-6 text-sm text-muted-foreground"
          initial={{
            opacity: !visibility ? 1 : 0,
            height: !visibility ? 'auto' : 0,
          }}
          animate={{
            opacity: !visibility ? 1 : 0,
            height: !visibility ? 'auto' : 0,
          }}
        >
          <div>Select a single shape to edit its properties.</div>
        </motion.div>
      </CardContent>
    </Card>
  )
}
