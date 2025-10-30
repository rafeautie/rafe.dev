import { ChevronDownIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { LayerItem } from './layer-item'
import { useLiveryEditorStore } from '@/state/livery-store'
import { cn } from '@/lib/utils'

export const LayersPanel = () => {
  const [visible, setVisible] = useState(true)
  const layers = useLiveryEditorStore((state) => state.layers)

  const hasLayers = layers.length > 0
  const visibility = visible && hasLayers

  const onVisibleTriggerClick = useCallback(() => {
    if (hasLayers) {
      setVisible((prevVisible) => !prevVisible)
    }
  }, [hasLayers])

  return (
    <Card
      variant="translucent"
      className={cn(
        'pointer-events-auto overflow-hidden w-96 min-h-[106px] max-h-[calc(var(--canvas-area-height-with-padding)/2)]',
      )}
      onContextMenu={(e) => {
        e.preventDefault()
      }}
    >
      <CardHeader className="cursor-pointer" onClick={onVisibleTriggerClick}>
        <div className="flex items-center justify-between">
          <CardTitle>Layers</CardTitle>
          <motion.div
            transition={{ duration: 0.3 }}
            initial={{
              rotate: visibility ? 0 : 90,
              opacity: hasLayers ? 1 : 0.5,
            }}
            animate={{
              rotate: visibility ? 0 : 90,
              opacity: hasLayers ? 1 : 0.5,
            }}
          >
            <ChevronDownIcon />
          </motion.div>
        </div>
      </CardHeader>
      <CardContent className="pl-6 pr-5 overflow-y-scroll">
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
          {layers.map((layer) => (
            <LayerItem layerId={layer.id} key={layer.id} />
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
          <div>Manage existing layers.</div>
        </motion.div>
      </CardContent>
    </Card>
  )
}
