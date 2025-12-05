import { randomUUID } from 'node:crypto'
import { and, assign, createActor, createMachine } from 'xstate'
import { getCarsInTrackOrder, getMostRecentChallengeResolution } from '../utils'
import {
  appendCardPlayEvent,
  appendLog,
  appendWithLog,
  applyCardUsage,
  areCarsAdjacent,
  areChallengeSelectionsRevealed,
  areQualifyingSelectionsRevealed,
  buildChallengeResult,
  buildGridPosition,
  carHasCardsInHand,
  createCarBlueprints,
  createDealtDecksForCars,
  createInitialContext,
  emptyTurnState,
  ensureScoreEntries,
  getCarAhead,
  getLastPlaceCar,
  hasOpenSpaceAhead,
  isExtendCardPlay,
  moveCarForwardOne,
  resolveQualifyingOrder,
  scoreCardSet,
} from './utils'
import type { ActorOptions } from 'xstate'
import type {
  CarBlueprint,
  CarState,
  GameContext,
  GameEvent,
  Player,
  Scoreboard,
} from '../types'

const POINTS_BY_FINISH = [9, 6, 4, 3, 2, 1] as const
const MAX_PASSES_PER_TURN = 2
const TOTAL_RACES = 7

export const gameStateMachine = createMachine(
  {
    id: 'race-game',
    types: {} as {
      context: GameContext
      events: GameEvent
    },
    initial: 'waitingForPlayers',
    context: createInitialContext(TOTAL_RACES),
    states: {
      waitingForPlayers: {
        on: {
          ADD_PLAYER: { actions: 'addPlayer' },
          REMOVE_PLAYER: { actions: 'removePlayer' },
          START_SETUP: {
            guard: 'hasMinimumPlayers',
            target: 'setup.assignCars',
          },
        },
      },
      setup: {
        initial: 'assignCars',
        states: {
          assignCars: {
            entry: 'assignCars',
            always: 'dealCards',
          },
          dealCards: {
            entry: 'dealCards',
            always: '#race-game.qualifying.selection',
          },
        },
      },
      qualifying: {
        initial: 'selection',
        states: {
          selection: {
            on: {
              PLAY_CARDS: {
                guard: 'cardsInHand',
                actions: 'recordQualSelection',
              },
            },
            always: [
              {
                guard: 'allCarsReadyForQualifying',
                actions: 'applyQualifyingResolution',
                target: 'ready',
              },
            ],
          },
          ready: {
            entry: 'prepareRaceStart',
            always: '#race-game.racing.lapGate',
          },
        },
      },
      racing: {
        initial: 'lapGate',
        states: {
          lapGate: {
            entry: ['openLap', 'primeLap'],
            always: [
              {
                guard: 'hasActiveCar',
                target: 'awaitingAction',
              },
            ],
          },
          awaitingAction: {
            entry: 'queueAutomaticChallenge',
            always: [
              {
                guard: 'challengePending',
                target: 'challengeSelection',
              },
            ],
            on: {
              PLAY_CARDS: {
                guard: and(['isTurnExtendPlay', 'cardsInHand']),
                actions: 'handleExtendPlay',
                target: 'turnEnded',
              },
              DISCARD_CARDS: {
                guard: and(['isTurnDiscardPlay', 'cardsInHand']),
                actions: 'handleDiscardPlay',
                target: 'turnEnded',
              },
            },
          },
          challengeSelection: {
            on: {
              PLAY_CARDS: {
                guard: and(['canSubmitChallengeCards', 'cardsInHand']),
                actions: 'recordChallengeSelection',
              },
            },
            always: [
              {
                guard: 'challengeReadyToResolve',
                actions: 'applyChallengeResolution',
                target: 'postChallenge',
              },
            ],
          },
          postChallenge: {
            always: [
              {
                guard: 'turnMustEndAutomatically',
                target: 'turnEnded',
              },
              { target: 'awaitingAction' },
            ],
          },
          turnEnded: {
            entry: 'advanceTurn',
            always: [
              {
                guard: 'raceShouldEnd',
                target: '#race-game.scoring',
              },
              {
                guard: 'hasActiveCar',
                target: 'awaitingAction',
              },
              { target: 'lapGate' },
            ],
          },
        },
      },
      scoring: {
        entry: ['recordFinishingOrder', 'applyPoints', 'incrementRaceCounter'],
        always: 'postRace',
      },
      postRace: {
        always: [
          {
            guard: 'championshipComplete',
            target: 'championshipComplete',
          },
          {
            actions: 'prepareNextRace',
            target: 'setup.assignCars',
          },
        ],
      },
      championshipComplete: {
        type: 'final',
      },
    },
    on: {
      RESET: {
        target: '.waitingForPlayers',
        actions: 'resetContext',
      },
    },
  },
  {
    actions: {
      addPlayer: assign(({ context, event }) => {
        if (event.type !== 'ADD_PLAYER') return {}
        const scoreboard = ensureScoreEntries(context.scoreboard, event.player)
        return {
          players: [...context.players, event.player],
          scoreboard,
          log: appendLog(context, `Player ${event.player.name} joined.`),
        }
      }),
      removePlayer: assign(({ context, event }) => {
        if (event.type !== 'REMOVE_PLAYER') return {}
        const remaining = context.players.filter(
          (player: Player) => player.id !== event.playerId,
        )
        return {
          players: remaining,
          log: appendLog(context, `Player ${event.playerId} removed.`),
        }
      }),
      assignCars: assign(({ context }) => {
        if (context.players.length === 0) {
          return {
            cars: {},
            gridPosition: {},
            log: appendLog(context, 'Skipped car assignment: no players.'),
          }
        }
        const blueprints = createCarBlueprints(context.players)
        const orderedCarIds = blueprints.map((car: CarBlueprint) => car.id)
        const cars = blueprints.reduce<Record<string, CarState>>(
          (acc: Record<string, CarState>, car: CarBlueprint) => {
            acc[car.id] = {
              ...car,
              cardsRemaining: 0,
              drawPile: [],
              discardPile: [],
              status: 'ready',
            }
            return acc
          },
          {},
        )
        return {
          cars,
          gridPosition: buildGridPosition(orderedCarIds),
          log: appendLog(context, `Assigned ${blueprints.length} cars.`),
        }
      }),
      dealCards: assign(({ context }) => {
        const carIds = getCarsInTrackOrder(context.gridPosition)
        const dealt = createDealtDecksForCars(carIds)
        const nextCars = { ...context.cars }
        carIds.forEach((carId) => {
          const car = nextCars[carId] as CarState | undefined
          if (!car) return
          const drawPile = dealt[carId]
          nextCars[carId] = {
            ...car,
            drawPile,
            cardsRemaining: drawPile.length,
            discardPile: [],
          }
        })
        return {
          cars: nextCars,
          log: appendLog(
            context,
            `Cards built, shuffled, and dealt across ${carIds.length} cars.`,
          ),
        }
      }),
      recordQualSelection: assign(({ context, event }) => {
        if (event.type !== 'PLAY_CARDS') return {}
        const usage = applyCardUsage(context, event.carId, event.cards)
        let log = usage.eliminationMessage
          ? appendLog(context, usage.eliminationMessage)
          : context.log
        log = appendWithLog(
          context,
          log,
          `Car ${event.carId} selected qualifying cards.`,
        )
        return {
          pendingQualifyingSelections: {
            ...context.pendingQualifyingSelections,
            [event.carId]: event.cards,
          },
          cars: usage.cars,
          finalLapTriggered: usage.finalLapTriggered,
          finishingOrder: usage.finishingOrder,
          log,
        }
      }),
      applyQualifyingResolution: assign(({ context }) => {
        const resolution = resolveQualifyingOrder(context)
        const results = resolution.order.map((carId, index) => {
          const cards = context.pendingQualifyingSelections[carId] ?? []
          const total = scoreCardSet(cards)
          return {
            carId,
            cards,
            position: index,
            score: total,
            total,
          }
        })
        const appended = appendCardPlayEvent(context, {
          type: 'qualifyingResolution',
          results,
        })
        return {
          gridPosition: buildGridPosition(resolution.order),
          pendingQualifyingSelections: {},
          cardPlayEvents: appended.cardPlayEvents,
          log: appendLog(
            context,
            `Qualifying resolved. Leader: ${resolution.order[0] ?? 'n/a'}.`,
          ),
        }
      }),
      prepareRaceStart: assign(({ context }) => {
        const lastPlace = getLastPlaceCar(context.gridPosition)
        return {
          turnNumber: 0,
          pendingChallenge: null,
          pendingChallengeSelections: {},
          pendingQualifyingSelections: {},
          turn: {
            ...emptyTurnState(),
            activeCarId: lastPlace,
          },
          finalLapTriggered: false,
          log: appendLog(context, 'Race start prepared.'),
        }
      }),
      openLap: assign(({ context }) => {
        const nextTurn = context.turnNumber + 1
        return {
          turnNumber: nextTurn,
          log: appendLog(context, `Turn ${nextTurn} started.`),
        }
      }),
      primeLap: assign(({ context }) => {
        if (context.turn.activeCarId) return {}
        return {
          turn: {
            ...context.turn,
            activeCarId: getLastPlaceCar(context.gridPosition),
          },
        }
      }),
      queueAutomaticChallenge: assign(({ context }) => {
        if (context.pendingChallenge) return {}
        if (context.turn.passes >= MAX_PASSES_PER_TURN) return {}
        const attackerId = context.turn.activeCarId
        if (!attackerId) return {}
        const defenderId = getCarAhead(context.gridPosition, attackerId)
        if (!defenderId) return {}
        if (!areCarsAdjacent(context.gridPosition, attackerId, defenderId)) {
          return {}
        }
        return {
          pendingChallenge: {
            id: randomUUID(),
            attackerId,
            defenderId,
          },
          pendingChallengeSelections: {},
          log: appendLog(
            context,
            `Challenge declared: ${attackerId} attacks ${defenderId}.`,
          ),
        }
      }),
      recordChallengeSelection: assign(({ context, event }) => {
        if (event.type !== 'PLAY_CARDS') return {}
        const pending = context.pendingChallenge
        if (!pending) return {}
        if (![pending.attackerId, pending.defenderId].includes(event.carId)) {
          return {}
        }
        if (
          (context.pendingChallengeSelections[event.carId] ?? []).length > 0
        ) {
          return {}
        }
        const usage = applyCardUsage(context, event.carId, event.cards)
        let log = usage.eliminationMessage
          ? appendLog(context, usage.eliminationMessage)
          : context.log
        log = appendWithLog(
          context,
          log,
          `Car ${event.carId} locked challenge cards.`,
        )
        return {
          pendingChallengeSelections: {
            ...context.pendingChallengeSelections,
            [event.carId]: event.cards,
          },
          cars: usage.cars,
          finalLapTriggered: usage.finalLapTriggered,
          finishingOrder: usage.finishingOrder,
          log,
        }
      }),
      applyChallengeResolution: assign(({ context }) => {
        const pending = context.pendingChallenge
        if (!pending) return {}
        const attackerCards =
          context.pendingChallengeSelections[pending.attackerId] ?? []
        const defenderCards =
          context.pendingChallengeSelections[pending.defenderId] ?? []
        const result = buildChallengeResult({
          attackerId: pending.attackerId,
          defenderId: pending.defenderId,
          attackerCards,
          defenderCards,
        })
        const attackerWon = result.winnerId === result.attackerId
        const passes = attackerWon
          ? Math.min(context.turn.passes + 1, MAX_PASSES_PER_TURN)
          : 0
        const updatedOrder = attackerWon
          ? moveCarForwardOne(context.gridPosition, result.attackerId)
          : context.gridPosition

        const appended = appendCardPlayEvent(context, {
          type: 'challengeResolution',
          challengeId: pending.id,
          attackerId: result.attackerId,
          defenderId: result.defenderId,
          winnerId: result.winnerId,
          loserId: result.loserId,
          attackerCards: result.attackerCards,
          defenderCards: result.defenderCards,
          attackerTotal: result.attackerTotal,
          defenderTotal: result.defenderTotal,
        })

        return {
          gridPosition: updatedOrder,
          pendingChallenge: null,
          pendingChallengeSelections: {},
          turn: {
            activeCarId: result.attackerId,
            passes,
          },
          cardPlayEvents: appended.cardPlayEvents,
          log: appendLog(
            context,
            `Challenge resolved. Winner ${result.winnerId} over ${result.loserId}.`,
          ),
        }
      }),
      handleDiscardPlay: assign(({ context, event }) => {
        if (event.type !== 'DISCARD_CARDS') return {}
        const usage = applyCardUsage(context, event.carId, event.cards)
        const logBase = usage.eliminationMessage
          ? appendLog(context, usage.eliminationMessage)
          : context.log
        const total = scoreCardSet(event.cards)
        const appended = appendCardPlayEvent(context, {
          type: 'discardPlay',
          carId: event.carId,
          cards: event.cards,
          total,
        })
        return {
          cars: usage.cars,
          finalLapTriggered: usage.finalLapTriggered,
          finishingOrder: usage.finishingOrder,
          cardPlayEvents: appended.cardPlayEvents,
          log: appendWithLog(
            context,
            logBase,
            `Car ${event.carId} discarded cards.`,
          ),
        }
      }),
      handleExtendPlay: assign(({ context, event }) => {
        if (event.type !== 'PLAY_CARDS') return {}
        const usage = applyCardUsage(context, event.carId, event.cards)
        const logBase = usage.eliminationMessage
          ? appendLog(context, usage.eliminationMessage)
          : context.log
        const fromPosition = context.gridPosition[event.carId] ?? -1
        const gridPosition = moveCarForwardOne(
          context.gridPosition,
          event.carId,
        )
        const total = scoreCardSet(event.cards)
        const appended = appendCardPlayEvent(context, {
          type: 'extendPlay',
          carId: event.carId,
          cards: event.cards,
          fromPosition,
          toPosition: gridPosition[event.carId] ?? fromPosition,
          total,
        })
        return {
          gridPosition,
          cars: usage.cars,
          finalLapTriggered: usage.finalLapTriggered,
          finishingOrder: usage.finishingOrder,
          cardPlayEvents: appended.cardPlayEvents,
          log: appendWithLog(
            context,
            logBase,
            `Car ${event.carId} extended using ${event.cards.join(',')}.`,
          ),
        }
      }),
      advanceTurn: assign(({ context }) => {
        const previousCar = context.turn.activeCarId
        const nextCar = previousCar
          ? getCarAhead(context.gridPosition, previousCar)
          : getLastPlaceCar(context.gridPosition)
        const logMessage = nextCar
          ? `Turn advanced to ${nextCar}.`
          : 'Turn complete. Resetting to last-place challenger.'
        return {
          turn: {
            ...emptyTurnState(),
            activeCarId: nextCar ?? null,
          },
          pendingChallenge: null,
          pendingChallengeSelections: {},
          log: appendLog(context, logMessage),
        }
      }),
      recordFinishingOrder: assign(({ context }) => {
        const order =
          context.finishingOrder.length > 0
            ? context.finishingOrder
            : getCarsInTrackOrder(context.gridPosition)
        return {
          finishingOrder: order,
          log: appendLog(
            context,
            `Race finalized with winner ${order[0] ?? 'n/a'}.`,
          ),
        }
      }),
      applyPoints: assign(({ context }) => {
        const next: Scoreboard = {
          drivers: { ...context.scoreboard.drivers },
          teams: { ...context.scoreboard.teams },
        }

        context.finishingOrder.forEach((carId, index) => {
          const car = context.cars[carId] as CarState | undefined
          if (!car) return
          const player = context.players.find((p) => p.id === car.playerId)
          if (!player) return
          const points = POINTS_BY_FINISH[index] ?? 0
          next.drivers[player.id] = (next.drivers[player.id] ?? 0) + points
          const teamKey = player.teamId ?? player.id
          next.teams[teamKey] = (next.teams[teamKey] ?? 0) + points
        })

        return {
          scoreboard: next,
          log: appendLog(context, 'Points applied to championship tables.'),
        }
      }),
      incrementRaceCounter: assign(({ context }) => ({
        completedRaces: context.completedRaces + 1,
      })),
      prepareNextRace: assign(({ context }) => ({
        gridPosition: {},
        pendingQualifyingSelections: {},
        pendingChallengeSelections: {},
        pendingChallenge: null,
        turn: emptyTurnState(),
        finishingOrder: [],
        turnNumber: 0,
        finalLapTriggered: false,
        cardPlayEvents: [],
        log: appendLog(context, 'Preparing next race.'),
      })),
      resetContext: assign(() => createInitialContext(TOTAL_RACES)),
    },
    guards: {
      hasMinimumPlayers: ({ context }) => context.players.length >= 2,
      allCarsReadyForQualifying: ({ context }) => {
        return areQualifyingSelectionsRevealed(context)
      },
      hasActiveCar: ({ context }) => Boolean(context.turn.activeCarId),
      cardsInHand: ({ context, event }) => {
        if (event.type !== 'PLAY_CARDS' && event.type !== 'DISCARD_CARDS') {
          return false
        }
        return carHasCardsInHand(context.cars[event.carId], event.cards)
      },
      isTurnExtendPlay: ({ context, event }) => {
        if (event.type !== 'PLAY_CARDS') return false
        if (context.turn.activeCarId !== event.carId) return false
        if (!isExtendCardPlay(event.cards)) return false
        if (!hasOpenSpaceAhead(context.gridPosition, event.carId)) return false
        const card = event.cards[0]
        if (
          card.rank === 'E3' &&
          getCarAhead(context.gridPosition, event.carId) === null
        ) {
          return false
        }
        return true
      },
      isTurnDiscardPlay: ({ context, event }) => {
        if (event.type !== 'DISCARD_CARDS') return false
        if (context.turn.activeCarId !== event.carId) return false
        return event.cards.length > 0
      },
      challengePending: ({ context }) => Boolean(context.pendingChallenge),
      canSubmitChallengeCards: ({ context, event }) => {
        if (event.type !== 'PLAY_CARDS') return false
        const pending = context.pendingChallenge
        if (!pending) return false
        if (![pending.attackerId, pending.defenderId].includes(event.carId)) {
          return false
        }
        return (
          (context.pendingChallengeSelections[event.carId] ?? []).length === 0
        )
      },
      challengeReadyToResolve: ({ context }) => {
        return areChallengeSelectionsRevealed(context)
      },
      turnMustEndAutomatically: ({ context }) => {
        const carId = context.turn.activeCarId
        if (!carId) return false
        const lastChallenge = getMostRecentChallengeResolution(context)
        if (lastChallenge?.loserId === carId) return true
        return context.turn.passes >= MAX_PASSES_PER_TURN
      },
      raceShouldEnd: ({ context }) =>
        context.finalLapTriggered && context.finishingOrder.length > 0,
      championshipComplete: ({ context }) =>
        context.completedRaces >= context.totalRaces,
    },
  },
)

export const createGameActor = (
  options?: ActorOptions<typeof gameStateMachine>,
) => createActor(gameStateMachine, { inspect: console.log, ...options })
