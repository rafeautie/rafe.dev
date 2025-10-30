import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import AppSidebar from '@/components/app-sidebar'
import { getThemeServerFn } from '@/lib/theme'
import { Toaster } from '@/components/ui/sonner'
import { getSidebarStateServerFn } from '@/lib/sidebar'
import { cn } from '@/lib/utils'
import TanstackStoreDevtoolPanel from '@/devtools/store-devtools/store-devtool-panel'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'rafe.dev',
      },
      {
        name: 'description',
        content: 'Custom software development services.',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  loader: async () => {
    const [theme, sidebarState] = await Promise.all([
      getThemeServerFn(),
      getSidebarStateServerFn(),
    ])
    return {
      theme,
      sidebarState,
    }
  },
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { theme, sidebarState } = Route.useLoaderData()

  return (
    <html lang="en" className={cn(theme)}>
      <head>
        <HeadContent />
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 110 100%22><text y=%22.9em%22 font-size=%2290%22>💿</text></svg>"
        />
      </head>
      <body>
        <ThemeProvider theme={theme}>
          <SidebarProvider defaultOpen={sidebarState}>
            <AppSidebar />
            <SidebarInset>
              {children}
              <Toaster position="bottom-right" />
            </SidebarInset>
          </SidebarProvider>
        </ThemeProvider>

        <TanStackDevtools
          config={{
            position: 'bottom-left',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            {
              name: 'Tanstack Query',
              render: <ReactQueryDevtoolsPanel />,
            },
            {
              name: 'Tanstack Store',
              render: <TanstackStoreDevtoolPanel />,
            },
          ]}
        />

        <Scripts />
      </body>
    </html>
  )
}
