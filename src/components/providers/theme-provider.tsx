import { useRouter } from '@tanstack/react-router'
import { createContext, use, useMemo } from 'react'
import type { PropsWithChildren } from 'react'
import type { T as Theme } from '@/lib/theme'
import { setThemeServerFn } from '@/lib/theme'

type ThemeContextVal = { theme: Theme; setTheme: (val: Theme) => void }
type Props = PropsWithChildren<{ theme: Theme }>

const ThemeContext = createContext<ThemeContextVal | null>(null)

export function ThemeProvider({ children, theme }: Props) {
  const router = useRouter()

  const contextValue = useMemo(
    () => ({
      theme,
      setTheme: async (value: Theme) => {
        await setThemeServerFn({ data: value })
        await router.invalidate()
      },
    }),
    [theme],
  )

  return <ThemeContext value={contextValue}>{children}</ThemeContext>
}

export function useTheme() {
  const val = use(ThemeContext)
  if (!val) throw new Error('useTheme called outside of ThemeProvider!')
  return val
}
