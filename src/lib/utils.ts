import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ClassValue } from 'clsx'

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}

export function getCallerName() {
  const stack = new Error().stack?.split('\n')[3]
  const match = stack?.match(/at (.+?) /)
  return match ? match[1] : 'Unknown Caller'
}

export function camelToTitle(input: string): string {
  if (!input) return ''
  const words = input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

export const capitalize = (str: string): string => {
  if (!str) return ''
  return str[0].toUpperCase() + str.slice(1)
}
