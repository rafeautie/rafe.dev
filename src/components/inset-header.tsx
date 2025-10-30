import VariableFontCursorProximity from './fancy/text/variable-font-cursor-proximity'
import { SidebarTrigger } from './ui/sidebar'
import { cn } from '@/lib/utils'

interface InsetHeaderProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  title: string
  side?: 'left' | 'center' | 'right'
}

const InsetHeader = ({
  containerRef,
  title,
  side = 'center',
}: InsetHeaderProps) => {
  return (
    <div
      className={cn(
        'items-start p-5 relative top-0 z-50 md:rounded-t-lg h-(--inset-header-height)',
        {
          'grid grid-cols-[1fr_auto_1fr]': side === 'center',
          'flex gap-1': side !== 'center',
          'justify-between': side === 'right',
        },
      )}
      draggable={false}
    >
      <div>
        <SidebarTrigger />
      </div>
      <VariableFontCursorProximity
        className={cn(
          'text-2xl md:text-4xl justify-self-center text-center font-[100] select-none',
        )}
        fromFontVariationSettings="'wght' 100, 'slnt' 0"
        toFontVariationSettings="'wght' 900, 'slnt' -10"
        falloff="exponential"
        radius={100}
        containerRef={containerRef}
        draggable={false}
      >
        {title}
      </VariableFontCursorProximity>
      {side !== 'right' && <div className="justify-self-end"></div>}
    </div>
  )
}

export default InsetHeader
