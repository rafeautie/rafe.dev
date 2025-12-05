import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { negate } from 'lodash'
import {
  getAnyAnimationInProgress,
  getCurrentCardSelectionValidForDiscard,
  getCurrentCardSelectionValidForExtend,
  getCurrentCardSelectionValidForPlay,
  getIsOwnPlayersTurn,
  getIsQualifyingSelectionComplete,
  getIsRacingChallengeSelectionComplete,
  getLatestGameState,
  getOwnPlayerCar,
  getSelectedCards,
  toggleCardSelection,
  useRaceStore,
} from '../state'
import { useRaceWebsocketSubscription } from '../hooks/useRaceWebsocketSubscription'
import { Card } from './card'
import type { Transition, Variants } from 'motion/react'
import type { GameStateControlAction, GameStateControlMap } from '../type'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface DeckProps {
  className?: string
}

// Card hover constants
const CARD_HOVER_Y_OFFSET = -30
const CARD_SELECTED_Y_OFFSET = -30
const CARD_HOVER_ROTATE_SCALE = 0.5
const CARD_EXIT_Y_OFFSET = -500

// Deck hover constants
const DECK_HOVER_SCALE = 1.1
const DECK_HOVER_Y_RESTING_OFFSET = -20
const DECK_HOVER_Y_OFFSET = -200 + DECK_HOVER_Y_RESTING_OFFSET
const DECK_HOVER_X_SCALE = 0.65
const DECK_HOVER_ROTATE_SCALE = 1.5
const DECK_HOVER_Y_CURVE_SCALE = 1.5

const noOpTrue = () => true
const noOpFalse = () => false
const GAME_STATE_CONTROL_MAP: Partial<GameStateControlMap> = {
  'qualifying.selection': {
    title: 'Select Qualifying Cards',
    description:
      'All players will select qualify cards to determine the starting grid order.',
    actions: [
      {
        type: 'playCards',
        label: 'Qualify',
        validator: getCurrentCardSelectionValidForPlay,
      },
    ],
    actionCompleteValidator: getIsQualifyingSelectionComplete,
    actionCompleteTitle: 'Waiting for Other Players',
    actionCompleteDescription:
      'You have selected your qualifying cards.\nWaiting for other players to finish.',
    opponentTurnOnlyValidator: noOpFalse,
    opponentTurnOnlyTitle: 'Waiting for Other Players',
  },
  'racing.challengeSelection': {
    title: 'Select Challenge Cards',
    description:
      'You and your opponent will select challenge cards.\nHighest card wins. Choose wisely.',
    actions: [
      {
        type: 'playCards',
        label: 'Challenge',
        validator: getCurrentCardSelectionValidForPlay,
      },
    ],
    actionCompleteValidator: getIsRacingChallengeSelectionComplete,
    actionCompleteTitle: 'Waiting for Opponent',
    actionCompleteDescription:
      'You have selected your challenge cards. Waiting for your opponent to finish.',
    opponentTurnOnlyValidator: negate(getIsOwnPlayersTurn),
    opponentTurnOnlyTitle: 'Waiting for Other Players',
    opponentTurnOnlyDescription:
      'Other players are selecting their challenge cards.',
  },
  'racing.awaitingAction': {
    title: 'Extend or Discard',
    description:
      'You must either extend or discard to end your turn. If you are leading, you can only extend with E1 or E2.',
    actions: [
      {
        type: 'playCards',
        label: 'Extend',
        validator: getCurrentCardSelectionValidForExtend,
      },
      {
        type: 'discardCards',
        label: 'Discard',
        validator: getCurrentCardSelectionValidForDiscard,
      },
    ],
    actionCompleteValidator: noOpFalse,
    actionCompleteTitle: 'Ready for Next Turn',
    actionCompleteDescription:
      'You have extended or discarded cards. Ready for the next turn.',
    opponentTurnOnlyValidator: negate(getIsOwnPlayersTurn),
    opponentTurnOnlyTitle: 'Waiting for Other Players',
    opponentTurnOnlyDescription:
      'Tip: Use this time to think about your next move.',
  },
}

const BASE_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
  mass: 0.5,
}

const CONTROL_TRANSITION: Transition = {
  type: 'tween',
  duration: 0.225,
}

const DECK_VARIANTS: Variants = {
  hidden: ({ baseRotation, baseX }) => ({
    rotate: baseRotation * 0 - 20,
    x: baseX * 1.3 - 150,
    y: 150,
    opacity: 1,
    scale: 1,
    transition: {
      delay: 1,
    },
  }),
  resting: ({ baseRotation, baseX, baseY }) => ({
    rotate: baseRotation,
    x: baseX,
    y: baseY,
    opacity: 1,
    scale: 1,
    transition: {
      ...BASE_TRANSITION,
      delay: 0.15,
    },
  }),
  hovered: ({ baseRotation, baseX, baseY }) => ({
    rotate: baseRotation * DECK_HOVER_ROTATE_SCALE,
    x: baseX * DECK_HOVER_X_SCALE,
    y: baseY + DECK_HOVER_Y_OFFSET,
    opacity: 1,
    scale: DECK_HOVER_SCALE,
  }),
  exit: ({ baseRotation }) => ({
    y: CARD_EXIT_Y_OFFSET,
    rotate: baseRotation * 0.5,
    opacity: 0,
  }),
}

const CARD_VARIANTS: Variants = {
  hovered: {
    rotate: CARD_HOVER_ROTATE_SCALE,
    y: CARD_HOVER_Y_OFFSET,
  },
  selected: {
    y: CARD_SELECTED_Y_OFFSET,
  },
  'selected hovered': {
    y: CARD_HOVER_Y_OFFSET + CARD_SELECTED_Y_OFFSET,
  },
}

const CONTROL_VARIANTS: Variants = {
  hidden: { opacity: 0, filter: 'blur(8px)' },
  visible: { opacity: 1, filter: 'blur(0px)' },
}

export const Deck = ({ className }: DeckProps) => {
  const [isInteractable, setIsInteractable] = useState<boolean>(true)
  const [isDeckHovered, setIsDeckHovered] = useState<boolean>(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const playerCar = useRaceStore(getOwnPlayerCar)
  const selectedCards = useRaceStore(getSelectedCards)
  const cardCount = playerCar?.drawPile.length ?? 0

  return (
    <div
      className={cn('flex items-end justify-center w-[600px] h-56 ', className)}
      onMouseOver={() => setIsDeckHovered(true)}
      onMouseLeave={() => setIsDeckHovered(false)}
    >
      <motion.div
        className="w-full h-lvh bg-radial from-background to-transparent to-50% bg-[length:200%_200%] bg-top fixed bottom-0 left-0 right-0 pointer-events-none"
        transition={BASE_TRANSITION}
        initial={{ opacity: 0 }}
        animate={{ opacity: isDeckHovered ? 1 : 0 }}
        onAnimationComplete={() => setIsInteractable(true)}
        onAnimationStart={() => setIsInteractable(false)}
      />
      <Controls isActive={isDeckHovered} />
      <AnimatePresence mode="popLayout">
        {playerCar?.drawPile.map((card, index) => {
          const isCardHovered = hoveredIndex === index && isInteractable
          const isCardSelected = selectedCards.some((c) => c.id === card.id)

          const center = (cardCount - 1) / 2
          const t = index - center
          const baseRotation = (index - cardCount / 2) * 3
          const baseX = (index - cardCount / 2) * -75 - 30
          const yCurve = isDeckHovered ? DECK_HOVER_Y_CURVE_SCALE : 0.5
          const baseY = t * t * yCurve - DECK_HOVER_Y_RESTING_OFFSET

          const customVariantProps = { baseRotation, baseX, baseY }
          const deckVariant = isDeckHovered ? 'hovered' : 'resting'
          const cardVariant = cn({
            selected: isCardSelected,
            hovered: isCardHovered,
          })

          return (
            <motion.div
              className={cn('select-none cursor-default')}
              style={{ zIndex: isCardHovered ? 1 : 0 }}
              key={card.id + 'deck'}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const cx = rect.left + rect.width / 2
                const cy = rect.top + rect.height / 2
                const dx = e.clientX - cx
                const dy = e.clientY - cy
                const rad = (-baseRotation * Math.PI) / 180
                const localX = dx * Math.cos(rad) - dy * Math.sin(rad)
                const halfWidth = rect.width / 2
                const isLeftSide = localX < halfWidth * 0.4 // right side trimmed off

                if (isLeftSide) {
                  setHoveredIndex(index)
                } else if (index === hoveredIndex && index != cardCount - 1) {
                  setHoveredIndex(null)
                }
              }}
              onMouseLeave={() => setHoveredIndex(null)}
              variants={DECK_VARIANTS}
              custom={customVariantProps}
              transition={BASE_TRANSITION}
              initial="hidden"
              animate={deckVariant}
              exit="exit"
              layout
            >
              <motion.div
                key={card.id + 'card'}
                variants={CARD_VARIANTS}
                custom={(DECK_VARIANTS[deckVariant] as any)(customVariantProps)}
                transition={BASE_TRANSITION}
                animate={cardVariant}
              >
                <Card {...card} onClick={toggleCardSelection} />
              </motion.div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

const Controls = ({ isActive }: { isActive: boolean }) => {
  const gameState = useRaceStore(getLatestGameState)
  const isAnyAnimationInProgress = useRaceStore(getAnyAnimationInProgress)

  const gameStateMessage = gameState?.statePath
    ? GAME_STATE_CONTROL_MAP[gameState.statePath]
    : null
  const isActionComplete = useRaceStore(
    gameStateMessage?.actionCompleteValidator ?? noOpTrue,
  )
  const isOpponentTurnOnly = useRaceStore(
    gameStateMessage?.opponentTurnOnlyValidator ?? noOpFalse,
  )

  const title = isAnyAnimationInProgress
    ? 'Waiting for Turn to Complete'
    : isActionComplete
      ? gameStateMessage?.actionCompleteTitle
      : isOpponentTurnOnly
        ? gameStateMessage?.opponentTurnOnlyTitle
        : gameStateMessage?.title

  const description = isAnyAnimationInProgress
    ? 'Tip: Use this time to think about your next move.'
    : isActionComplete
      ? gameStateMessage?.actionCompleteDescription
      : isOpponentTurnOnly
        ? gameStateMessage?.opponentTurnOnlyDescription
        : gameStateMessage?.description

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={(title ?? '') + (description ?? '')}
        className="flex flex-col justify-center items-center absolute bottom-0 gap-3 h-48"
        transition={CONTROL_TRANSITION}
        initial="hidden"
        animate={isActive ? 'visible' : 'hidden'}
        exit="hidden"
        variants={CONTROL_VARIANTS}
      >
        <motion.p key={title} className="text-lg">
          {title}
        </motion.p>
        {!isActionComplete &&
          !isOpponentTurnOnly &&
          !isAnyAnimationInProgress && (
            <div className="flex gap-5">
              {gameStateMessage?.actions.map((action) => {
                return (
                  <ControlButton
                    key={action.type + title + description}
                    disabled={isActionComplete}
                    {...action}
                  />
                )
              })}
            </div>
          )}
        {description && (
          <motion.p
            key={description}
            className="text-sm text-center w-[350px] pt-1 whitespace-pre-line"
          >
            {description}
          </motion.p>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

const ControlButton = ({
  type,
  label,
  disabled,
  validator,
}: GameStateControlAction & { disabled?: boolean }) => {
  const websocket = useRaceWebsocketSubscription()
  const isValid = useRaceStore(validator)
  return (
    <Button onClick={websocket[type]} disabled={!isValid || disabled} size="lg">
      {label}
    </Button>
  )
}
