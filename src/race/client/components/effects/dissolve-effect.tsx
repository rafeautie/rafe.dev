import { animate, motion, useAnimation, useMotionValue } from 'motion/react'
import { forwardRef, useId, useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StartDisolveEffectOptions {
  duration?: number
  delay?: number
}

export interface DisolveEffectHandle {
  start: (options?: StartDisolveEffectOptions) => Promise<void>
}

interface BurnEffectProps {
  children: ReactNode
  className?: string
}

const DisolveEffect = forwardRef<DisolveEffectHandle, BurnEffectProps>(
  ({ children, className }, ref) => {
    const id = useId()
    const filterId = `burn-filter-${id}`
    const opacityControls = useAnimation()
    const scale = useMotionValue(0)

    useImperativeHandle(ref, () => ({
      start: async ({ duration = 0.8, delay = 0 } = {}) => {
        const scaleAnimation = animate(scale, 10000, {
          duration,
          delay,
          ease: 'easeInOut',
        })

        const opacityAnimation = opacityControls.start({
          opacity: 0,
          transition: {
            duration: duration * 0.3,
            delay: duration * 0.7,
            ease: 'easeInOut',
          },
        })

        await Promise.all([scaleAnimation.finished, opacityAnimation])
      },
    }))

    return (
      <div
        className={cn(className, 'overflow-hidden rounded-lg')}
        style={{ position: 'relative', isolation: 'isolate' }}
      >
        <svg
          style={{
            position: 'absolute',
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.04"
                numOctaves="1"
                result="noise"
              />
              <motion.feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={scale}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>

        <motion.div
          animate={opacityControls}
          style={{
            filter: `url(#${filterId})`,
          }}
        >
          {children}
        </motion.div>
      </div>
    )
  },
)

DisolveEffect.displayName = 'DisolveEffect'

export default DisolveEffect
