import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Textarea } from './ui/textarea'
import { Card, CardContent } from './ui/card'
import { Spinner } from './ui/spinner'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import useContactFormMutation from '@/hooks/use-contact-form-mutation'

const formSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.email(),
  description: z.string().min(10),
})

const ContactForm = () => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      description: '',
    },
  })

  const { mutate, isPending } = useContactFormMutation<
    z.infer<typeof formSchema>
  >({
    onSuccess: () => {
      form.reset()
      toast.success("Thank you for reaching out! I'll get back to you soon.")
    },
    onError: () => {
      form.reset()
      toast.error(
        'Something went wrong submitting the form. Please try again later.',
      )
    },
  })

  const onSubmit = (data: z.infer<typeof formSchema>) => mutate(data)

  return (
    <Card className="w-full" id="contact">
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="you@gmail.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tell me about your project</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-48"
                      placeholder="An overview of what you would like to build..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner /> : null}
              Submit
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

export default ContactForm
