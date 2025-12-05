import { Board } from './board'
import { Deck } from './deck'

export const Game = () => {
  return (
    <div className="flex flex-col justify-center items-center w-full h-full gap-10">
      <Board className="mb-30 z-0" />
      <Deck className="absolute bottom-0 z-10" />
    </div>
  )
}
