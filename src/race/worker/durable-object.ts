import { DurableObject } from 'cloudflare:workers'
import {
  createErrorMessage,
  createGameStateMessage,
  createRoomAckMessage,
  isRaceClientMessage,
  serializeServerMessage,
} from '../messages'
import { createGameActor } from './game-state-machine'
import {
  buildVisibleContextForPlayer,
  createServerPlayer,
  flattenStateValue,
  getRoomSlugFromHeader,
} from './utils'
import type {
  GameActorRef,
  GameEvent,
  GameSnapshot,
  GameStatePayload,
  RaceClientMessage,
  RaceServerMessage,
  SessionMetadata,
} from '../types'

const PERSISTENCE_KEY = 'game-state-snapshot'

export class WebSocketHibernationServer extends DurableObject {
  private readonly sessions = new Map<WebSocket, SessionMetadata>()
  private readonly decoder = new TextDecoder()
  private actor!: GameActorRef

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    this.ctx.blockConcurrencyWhile(async () => {
      const persistedSnapshot = (await this.ctx.storage.get(
        PERSISTENCE_KEY,
      )) as GameSnapshot

      this.actor = createGameActor({
        snapshot: persistedSnapshot,
      })
      this.actor.start()
      this.actor.subscribe((snapshot) => {
        this.broadcastState(snapshot)
        this.persistSnapshot()
      })

      this.ctx.getWebSockets().forEach((ws) => {
        const metadata = ws.deserializeAttachment() as SessionMetadata
        this.registerSession(ws, metadata, { addPlayer: false, sendAck: false })
      })

      this.ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair('ping', 'pong'),
      )
    })
  }

  fetch(request: Request): Response {
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)

    // if (this.actor.getSnapshot().value !== 'waitingForPlayers') {
    //   this.terminateSession(server, 1011, 'Room not accepting players')
    //   return new Response('Room not accepting players', { status: 403 })
    // }

    const roomId = getRoomSlugFromHeader(request.headers)
    if (!roomId) {
      return new Response('Missing room identifier', { status: 400 })
    }

    this.ctx.acceptWebSocket(server)
    const metadata: SessionMetadata = {
      roomId,
      player: createServerPlayer(),
    }
    if (
      !this.registerSession(server, metadata, {
        addPlayer: true,
        sendAck: true,
      })
    ) {
      this.terminateSession(server, 1011, 'Failed to register player')
      return new Response('Unable to register player', { status: 500 })
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (!this.sessions.has(ws)) {
      this.terminateSession(ws, 1011, 'Unknown session')
      return
    }

    const clientMessage = this.decodeClientMessage(ws, message)
    if (!clientMessage) {
      return
    }

    const serverEvent = this.translateClientEvent(ws, clientMessage)
    if (!serverEvent) {
      return
    }

    this.actor.send(serverEvent)
  }

  webSocketError(ws: WebSocket, error: unknown): void | Promise<void> {
    this.terminateSession(
      ws,
      1011,
      'WebSocket error occurred: ' + String(error),
    )
  }

  webSocketClose(ws: WebSocket, code: number) {
    this.terminateSession(ws, code, 'Server closed connection')
  }

  private broadcastState(snapshot?: GameSnapshot) {
    const current = snapshot ?? this.actor.getSnapshot()
    for (const [socket, metadata] of this.sessions.entries()) {
      const payload = this.getStatePayload(current, metadata.player.id)
      this.sendMessage(socket, createGameStateMessage(payload))
    }
  }

  private getStatePayload(
    snapshot: GameSnapshot,
    playerId: string,
  ): GameStatePayload {
    return {
      value: snapshot.value,
      context: buildVisibleContextForPlayer(snapshot, playerId),
      statePath: flattenStateValue(snapshot.value),
    }
  }

  private sendMessage(ws: WebSocket, message: RaceServerMessage) {
    try {
      ws.send(serializeServerMessage(message))
    } catch {
      this.terminateSession(ws, 1011, 'Failed to deliver message')
    }
  }

  private registerSession(
    ws: WebSocket,
    metadata: SessionMetadata,
    options: { addPlayer: boolean; sendAck: boolean },
  ): boolean {
    this.sessions.set(ws, metadata)
    ws.serializeAttachment(metadata)

    if (options.sendAck) {
      this.sendMessage(
        ws,
        createRoomAckMessage(metadata.roomId, metadata.player),
      )
    }

    if (options.addPlayer) {
      this.actor.send({ type: 'ADD_PLAYER', player: metadata.player })
    }
    return true
  }

  private decodeClientMessage(
    ws: WebSocket,
    message: ArrayBuffer | string,
  ): RaceClientMessage | null {
    const raw =
      typeof message === 'string' ? message : this.decoder.decode(message)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      this.sendMessage(ws, createErrorMessage('Invalid JSON payload'))
      return null
    }

    if (!isRaceClientMessage(parsed)) {
      this.sendMessage(ws, createErrorMessage('Unsupported message payload'))
      return null
    }

    return parsed
  }

  private translateClientEvent(
    ws: WebSocket,
    event: RaceClientMessage,
  ): GameEvent | null {
    const session = this.sessions.get(ws)
    if (!session) {
      this.sendMessage(ws, createErrorMessage('Unknown session'))
      return null
    }

    switch (event.type) {
      case 'START_SETUP':
        return { type: 'START_SETUP' }
      case 'PLAY_CARDS': {
        const carId = this.getCarIdForPlayer(session.player.id)
        if (!carId) {
          this.sendMessage(ws, createErrorMessage('No car assigned to player'))
          return null
        }
        return { type: 'PLAY_CARDS', carId, cards: event.cards }
      }
      case 'DISCARD_CARDS': {
        const carId = this.getCarIdForPlayer(session.player.id)
        if (!carId) {
          this.sendMessage(ws, createErrorMessage('No car assigned to player'))
          return null
        }
        return { type: 'DISCARD_CARDS', carId, cards: event.cards }
      }
      default:
        this.sendMessage(ws, createErrorMessage('Unsupported event type'))
        return null
    }
  }

  private getCarIdForPlayer(playerId: string): string | null {
    const snapshot = this.actor.getSnapshot()
    for (const [carId, car] of Object.entries(snapshot.context.cars)) {
      if (car.playerId === playerId) {
        return carId
      }
    }
    return null
  }

  private async persistSnapshot() {
    const snapshot = this.actor.getPersistedSnapshot()
    await this.ctx.storage.put(PERSISTENCE_KEY, snapshot)
  }

  private async terminateSession(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason)
    } catch {
      // Socket already closed
    }

    const session = this.sessions.get(ws)
    if (!session) {
      return
    }

    this.sessions.delete(ws)
    this.actor.send({
      type: 'REMOVE_PLAYER',
      playerId: session.player.id,
    })

    if (this.sessions.size === 0) {
      this.actor.send({ type: 'RESET' })
      await this.ctx.storage.delete(PERSISTENCE_KEY)
    }
  }
}
