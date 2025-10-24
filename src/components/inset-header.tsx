import VariableFontCursorProximity from './fancy/text/variable-font-cursor-proximity'
import { SidebarTrigger } from './ui/sidebar'

interface InsetHeaderProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  title: string
}

const InsetHeader = ({ containerRef, title }: InsetHeaderProps) => {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center p-3 backdrop-blur-sm sticky top-0 z-50 rounded-t-lg">
      <div className="justify-self-start">
        <SidebarTrigger />
      </div>
      <VariableFontCursorProximity
        className="text-2xl md:text-3xl justify-self-center text-center font-[100]"
        fromFontVariationSettings="'wght' 100, 'slnt' 0"
        toFontVariationSettings="'wght' 900, 'slnt' -10"
        falloff="exponential"
        radius={100}
        containerRef={containerRef}
      >
        {title}
      </VariableFontCursorProximity>
      <div className="justify-self-end"></div>
    </div>
  )
}

export default InsetHeader
