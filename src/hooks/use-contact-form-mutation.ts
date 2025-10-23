import { useMutation } from '@tanstack/react-query'
import type { MutationOptions } from '@tanstack/react-query'

const useContactFormMutation = <TData extends object>(
  options: MutationOptions<unknown, unknown, TData> = {},
) => {
  return useMutation({
    mutationFn: async (formData) => {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: 'b99a86c9-3a88-4361-bf49-712c302dc628',
          ...formData,
        }),
      })

      await response.json()
    },
    ...options,
  })
}

export default useContactFormMutation
