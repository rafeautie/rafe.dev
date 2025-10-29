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

export function throttle<TFunc extends (...args: Array<any>) => void>(
  func: TFunc,
  timeFrame: number,
) {
  let lastTime = 0
  return function (...args: Parameters<TFunc>) {
    const now = Date.now()
    if (now - lastTime >= timeFrame) {
      func(...args)
      lastTime = now
    }
  }
}

export const uniqWith = <
  TArr extends Array<any>,
  TFunc extends (...args: Array<any>) => any,
>(
  arr: TArr,
  fn: TFunc,
) =>
  arr.filter(
    (element, index) => arr.findIndex((step) => fn(element, step)) === index,
  )

export const capitalize = (str: string): string => {
  if (!str) return ''
  return str[0].toUpperCase() + str.slice(1)
}
