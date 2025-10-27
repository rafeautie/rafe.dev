import { useEffect, useState } from 'react'
import JsonView from 'react18-json-view'
import 'react18-json-view/src/style.css'
import { ChevronDownIcon } from 'lucide-react'
import { diff } from 'deep-object-diff'
import { DateTime } from 'luxon'
import { DevtoolsStoreEventClient } from './store-event-client'
import { cn } from '@/lib/utils'

interface StateItem {
  state: any | null
  stateHistory: Array<{ diffResult: object; action: string; timestamp: number }>
}

const TanstackStoreDevtoolPanel = () => {
  const [state, setState] = useState<{ [name: string]: StateItem }>({})
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [selectedChangeIndex, setSelectedChangeIndex] = useState<number>(0)
  const [displayCurrentState, setDisplayCurrentState] = useState(false)
  const [displayChangeDetails, setDisplayChangeDetails] = useState(true)

  useEffect(() => {
    const cleanupRegisterStore = DevtoolsStoreEventClient.on(
      'register-store',
      (e) => {
        setState((prev) => {
          if (e.payload.storeName in prev) {
            throw new Error(
              `Store with name ${e.payload.storeName} already exists.`,
            )
          }

          return {
            ...prev,
            [e.payload.storeName]: {
              state: {},
              stateHistory: [],
            },
          }
        })

        if (selectedStore === null) {
          setSelectedStore(e.payload.storeName)
        }
      },
    )

    const cleanupStateChange = DevtoolsStoreEventClient.on(
      'state-change',
      (e) => {
        setState((prev) => {
          const diffResult = diff(
            prev[e.payload.storeName].state,
            e.payload.state,
          )

          const nextStateHistory = [
            {
              diffResult,
              action: e.payload.action,
              timestamp: e.payload.timestamp,
            },
            ...prev[e.payload.storeName].stateHistory,
          ]

          return {
            ...prev,
            [e.payload.storeName]: {
              state: e.payload.state,
              stateHistory: nextStateHistory,
            },
          }
        })
      },
    )

    return () => {
      cleanupRegisterStore()
      cleanupStateChange()
    }
  }, [])

  const selectedStoreValue = selectedStore != null ? state[selectedStore] : null
  const selectedHistoryItemValue =
    selectedStoreValue?.stateHistory[0] != null
      ? selectedStoreValue.stateHistory[selectedChangeIndex]
      : null

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col flex-1">
        <p className="p-2 font-bold border-b">Stores</p>
        <div className="flex-1 overflow-y-auto">
          {Object.keys(state).map((name) => (
            <div
              key={name}
              onClick={() => {
                setSelectedStore(name)
                setSelectedChangeIndex(0)
              }}
              className={cn('p-2 border-b', {
                'bg-black/30': selectedStore === name,
              })}
            >
              <p>{name}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col flex-1 border-l">
        <p className="p-2 font-bold border-b">State Changes</p>
        <div className="flex-1 overflow-y-auto">
          {selectedStore != null &&
            state[selectedStore].stateHistory.map(
              ({ action, timestamp }, index) => (
                <div
                  key={action + index}
                  onClick={() => {
                    setSelectedChangeIndex(index)
                  }}
                  className={cn(
                    'flex justify-between items-center p-2 border-b',
                    {
                      'bg-black/30': selectedChangeIndex === index,
                    },
                  )}
                >
                  <p>{action}</p>
                  <p className="text-foreground/50 text-xs">
                    {DateTime.fromMillis(timestamp).toFormat('h:mm:ss.SSS a')}
                  </p>
                </div>
              ),
            )}
        </div>
      </div>

      <div className="flex flex-col flex-3 border-l overflow-y-scroll">
        <div
          className={cn({
            'flex-1 border-b': displayCurrentState,
          })}
        >
          <div
            className="flex justify-between border-b p-2"
            onClick={() => {
              setDisplayCurrentState(!displayCurrentState)
            }}
          >
            <p className="font-bold">Current State</p>
            <ChevronDownIcon
              className={cn({ 'rotate-90': !displayCurrentState })}
            />
          </div>
          {displayCurrentState && (
            <JsonView
              collapsed={2}
              className="p-2"
              dark
              src={selectedStoreValue?.state}
            />
          )}
        </div>

        <div className="flex-1">
          <div
            className="flex justify-between border-b p-2"
            onClick={() => {
              setDisplayChangeDetails(!displayChangeDetails)
            }}
          >
            <p className="font-bold">Change Details</p>
            <ChevronDownIcon
              className={cn({ 'rotate-90': !displayChangeDetails })}
            />
          </div>
          {displayChangeDetails && (
            <div className="p-2 overflow-y-auto">
              {selectedHistoryItemValue != null ? (
                <JsonView dark src={selectedHistoryItemValue.diffResult} />
              ) : (
                <p>No change selected.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TanstackStoreDevtoolPanel
