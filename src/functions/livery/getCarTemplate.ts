import { createServerFn } from '@tanstack/react-start'
import z from 'zod'
import { CAR_TEMPLATE_URL } from '@/constants/livery'
import { extractEntry } from '@/lib/zip'

const UserSchema = z.object({
  entryName: z.string().min(1),
})

export const getCarTemplate = createServerFn()
  .inputValidator(UserSchema)
  .handler(async ({ data }) => {
    const { stream, size } = await extractEntry(
      CAR_TEMPLATE_URL,
      data.entryName,
    )
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${data.entryName}"`,
        'Content-Length': size.toString(),
      },
    })
  })
