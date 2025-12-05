import {
  createContext,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import confetti from 'canvas-confetti'
import type React from 'react'
import type { ReactNode } from 'react'
import type {
  GlobalOptions as ConfettiGlobalOptions,
  CreateTypes as ConfettiInstance,
  Options as ConfettiOptions,
} from 'canvas-confetti'

import { Button } from '@/components/ui/button'

type Api = {
  fire: (options?: ConfettiOptions) => void
}

type Props = React.ComponentPropsWithRef<'canvas'> & {
  options?: ConfettiOptions
  globalOptions?: ConfettiGlobalOptions
  manualStart?: boolean
  children?: ReactNode
}

export type ConfettiRef = Api | null

const ConfettiContext = createContext<Api>({} as Api)

// Define component first
const ConfettiComponent = forwardRef<ConfettiRef, Props>((props, ref) => {
  const {
    options,
    globalOptions = { resize: true, useWorker: true },
    manualStart = false,
    children,
    ...rest
  } = props
  const instanceRef = useRef<ConfettiInstance | null>(null)

  const canvasRef = useCallback(
    (node: HTMLCanvasElement) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (node !== null) {
        if (instanceRef.current) return
        instanceRef.current = confetti.create(node, {
          ...globalOptions,
          resize: true,
        })
      } else {
        if (instanceRef.current) {
          instanceRef.current.reset()
          instanceRef.current = null
        }
      }
    },
    [globalOptions],
  )

  const fire = useCallback(
    async (opts = {}) => {
      try {
        await instanceRef.current?.({ ...options, ...opts })
      } catch (error) {
        console.error('Confetti error:', error)
      }
    },
    [options],
  )

  const api = useMemo(
    () => ({
      fire,
    }),
    [fire],
  )

  useImperativeHandle(ref, () => api, [api])

  useEffect(() => {
    if (!manualStart) {
      ;(async () => {
        try {
          await fire()
        } catch (error) {
          console.error('Confetti effect error:', error)
        }
      })()
    }
  }, [manualStart, fire])

  return (
    <ConfettiContext.Provider value={api}>
      <canvas ref={canvasRef} {...rest} />
      {children}
    </ConfettiContext.Provider>
  )
})

// Set display name immediately
ConfettiComponent.displayName = 'Confetti'

// Export as Confetti
export const Confetti = ConfettiComponent

interface ConfettiButtonProps extends React.ComponentProps<'button'> {
  options?: ConfettiOptions &
    ConfettiGlobalOptions & { canvas?: HTMLCanvasElement }
}

const ConfettiButtonComponent = ({
  options,
  children,
  ...props
}: ConfettiButtonProps) => {
  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    try {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      await confetti({
        ...options,
        origin: {
          x: x / window.innerWidth,
          y: y / window.innerHeight,
        },
      })
    } catch (error) {
      console.error('Confetti button error:', error)
    }
  }

  return (
    <Button onClick={handleClick} {...props}>
      {children}
    </Button>
  )
}

ConfettiButtonComponent.displayName = 'ConfettiButton'

export const ConfettiButton = ConfettiButtonComponent
