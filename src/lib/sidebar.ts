import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import * as z from 'zod'

const postThemeValidator = z.union([z.literal('true'), z.literal('false')])
export type T = z.infer<typeof postThemeValidator>
const storageKey = 'sidebar_state'

export const getSidebarStateServerFn = createServerFn().handler(
  () => getCookie(storageKey) === 'true',
)

export const setSidebarStateServerFn = createServerFn({ method: 'POST' })
  .inputValidator(postThemeValidator)
  .handler(({ data }) => setCookie(storageKey, data))
