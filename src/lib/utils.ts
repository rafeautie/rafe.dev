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
