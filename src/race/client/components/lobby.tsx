import { CheckIcon } from 'lucide-react'
import { getLatestGameState, useRaceStore } from '../state'
import { useRaceWebsocketSubscription } from '../hooks/useRaceWebsocketSubscription'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { MIN_PLAYERS } from '@/race/constants'
import { cn } from '@/lib/utils'

export const Lobby = () => {
  const { startSetup } = useRaceWebsocketSubscription()
  const gameState = useRaceStore(getLatestGameState)
  const hasMinPlayers = (gameState?.context.players.length ?? 0) >= MIN_PLAYERS

  return (
    <div className="h-full flex justify-center items-center">
      <Card className="w-96">
        <CardHeader
          className={cn(
            'flex justify-between items-center pr-7',
            hasMinPlayers ? 'pr-6' : 'pr-7',
          )}
        >
          <CardTitle>
            {hasMinPlayers ? 'Ready to Start' : 'Waiting for Players'}
          </CardTitle>
          {hasMinPlayers ? (
            <CheckIcon className="text-green-500" />
          ) : (
            <Spinner />
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {gameState?.context.players.map((player) => (
            <div className="flex justify-between items-center" key={player.id}>
              {player.name}
              <CheckIcon className="text-green-500" />
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button
            disabled={!hasMinPlayers}
            className="w-full"
            onClick={startSetup}
          >
            Start Race
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
