import VariableFontCursorProximity from './fancy/text/variable-font-cursor-proximity'
import { SidebarTrigger } from './ui/sidebar'
import { cn } from '@/lib/utils'

interface InsetHeaderProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  title?: string
  className?: string
}

const InsetHeader = ({ containerRef, title, className }: InsetHeaderProps) => {
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_auto_1fr] items-center p-3 z-50 rounded-t-lg',
        className,
      )}
    >
      <div className="justify-self-start">
        <SidebarTrigger />
      </div>
      {title ? (
        <VariableFontCursorProximity
          className="text-2xl md:text-3xl justify-self-center text-center font-[100] h-8"
          fromFontVariationSettings="'wght' 100, 'slnt' 0"
          toFontVariationSettings="'wght' 900, 'slnt' -10"
          falloff="exponential"
          radius={100}
          containerRef={containerRef}
        >
          {title}
        </VariableFontCursorProximity>
      ) : (
        <div className="justify-self-center h-8"></div>
      )}
      <div className="justify-self-end"></div>
    </div>
  )
}

export default InsetHeader
