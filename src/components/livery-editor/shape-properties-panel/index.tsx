import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronDownIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { ScrollArea } from '../../ui/scroll-area'
import { ShapePropertyItem } from './shape-property-item'
import { useLiveryEditorStore } from '@/state/livery-editor-store'
import { SHAPE_ATTRIBUTE_CONFIG, TRANSFORMER_REF } from '@/constants/livery'
import { cn, uniqWith } from '@/lib/utils'

const HEIGHT = 384 // tw: h-96

export const ShapePropertiesPanel = () => {
  const [visible, setVisible] = useState(false)
  const selectedShapeIds = useLiveryEditorStore(
    (state) => state.selectedShapeIds,
  )

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
      setVisible(!visible)
    }
  }, [selectedShapeIds.length, visible])

  useEffect(() => {
    setVisible(selectedShapeIds.length === 1)
  }, [selectedShapeIds])

  return (
    <Card
      variant="translucent"
      className="self-end justify-self-end pointer-events-auto overflow-hidden"
    >
      <CardHeader
        onClick={onVisibleTriggerClick}
        className={cn('cursor-pointer')}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex justify-between">Properties</CardTitle>
          <motion.div
            layout
            initial={{ rotate: 0 }}
            animate={{ rotate: visible ? 0 : 90 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronDownIcon />
          </motion.div>
        </div>
      </CardHeader>
      <CardContent className="px-2 overflow-x-visible">
        <motion.div
          transition={{ duration: 0.3 }}
          initial={{ height: visible ? HEIGHT : 0 }}
          animate={{
            height: visible ? HEIGHT : 0,
            opacity: visible ? 1 : 0,
          }}
        >
          <ScrollArea className="h-96">
            <div className="space-y-5 px-4 py-1">
              {shapeAttributes.map((attr) => (
                <ShapePropertyItem
                  {...attr}
                  propKey={attr.key}
                  shapeId={selectedShapeIds[0]}
                  key={attr.key}
                />
              ))}
            </div>
          </ScrollArea>
        </motion.div>
        <motion.div
          transition={{ duration: 0.2 }}
          className="px-4 text-sm text-muted-foreground"
          initial={{
            opacity: !visible ? 1 : 0,
            height: !visible ? 'auto' : 0,
          }}
          animate={{
            opacity: !visible ? 1 : 0,
            height: !visible ? 'auto' : 0,
          }}
        >
          <div>Select a single shape to edit its properties.</div>
        </motion.div>
      </CardContent>
    </Card>
  )
}
