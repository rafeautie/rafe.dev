import { extractRoomSlug, generateRoomCode } from './utils'
import type { WebSocketHibernationServer } from './durable-object'

// Worker
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!request.url.includes('/api/race')) {
      return new Response('Not Found', { status: 404 })
    }

    const roomId = extractRoomSlug(request.url) ?? generateRoomCode()
    if (roomId) {
      const upgradeHeader = request.headers.get('Upgrade')
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Worker expected Upgrade: websocket', {
          status: 426,
        })
      }

      if (request.method !== 'GET') {
        return new Response('Worker expected GET method', { status: 400 })
      }

      const stub = env.WEBSOCKET_HIBERNATION_SERVER.getByName(
        roomId,
      ) as unknown as WebSocketHibernationServer

      const headers = new Headers(request.headers)
      headers.set('x-room-id', roomId)
      const reqWithRoomId = new Request(request, { headers })
      return stub.fetch(reqWithRoomId)
    }

    return new Response('Not found', {
      status: 404,
    })
  },
}
