import { EventClient } from '@tanstack/devtools-event-client'

type EventMap = {
  'store-devtools:register-store': { storeName: string }
  'store-devtools:state-change': {
    storeName: string
    action: string
    state: any
    timestamp: number
  }
}

class StoreEventClient extends EventClient<EventMap> {
  constructor() {
    super({
      pluginId: 'store-devtools',
      debug: true,
    })
  }
}

export const DevtoolsStoreEventClient = new StoreEventClient()
