import { ButtonGroup } from '../../ui/button-group'
import { Button } from '../../ui/button'
import { STATIC_COMMAND_CONFIG } from '@/constants/livery'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export const CommandControls = () => {
  return (
    <div
      className="flex gap-5"
      onContextMenu={(e) => {
        e.preventDefault()
      }}
    >
      {[
        STATIC_COMMAND_CONFIG.shapeCommands,
        STATIC_COMMAND_CONFIG.layerCommands,
      ].map((commandGroup, index) => (
        <ButtonGroup key={index}>
          {commandGroup.commands.map(({ icon: Icon, name, execute }) => (
            <Tooltip key={name} delayDuration={1000}>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={execute}>
                  <Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent variant="translucent">
                <p>{name}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </ButtonGroup>
      ))}
    </div>
  )
}
