import '@/styles/globals.css'
import '@/styles/variables.css'
import '@/styles/components/participant-selection.css'
import '@/styles/components/people-manager.css'
import '@/styles/components/buttons.css'
import '@/styles/components/forms.css'
import '@/styles/components/debt-solver.css'
import Head from 'next/head'
import ErrorBoundary from '@/components/ErrorBoundary'
import DarkModeToggle from '@/components/DarkModeToggle'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Development-only: suppress noisy HMR hot-update.json 404 console errors
    // This prevents the console from filling with harmless 404 messages
    // when the dev client requests an outdated hot-update manifest.
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return

    const origConsoleError = console.error
    console.error = (...args) => {
      try {
        const first = args[0]
        if (typeof first === 'string' && first.includes('webpack.hot-update.json')) {
          // swallow this specific noisy message
          return
        }
      } catch (e) {
        // ignore filter errors and fall through to original
      }
      origConsoleError(...args)
    }

    return () => {
      console.error = origConsoleError
    }
  }, [])
  // Create a single QueryClient per app instance
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid refetching on window focus by default; tweak as needed
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5, // 5 minutes
        cacheTime: 1000 * 60 * 30, // 30 minutes
      }
    }
  })

  return (
    <QueryClientProvider client={queryClient}>
      <>
        <Head>
          <title>ZiCount - Receipt Analyzer</title>
          <meta name="description" content="Analyze receipt images to extract items and prices using OCR" />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <meta name="theme-color" content="#3B82F6" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <DarkModeToggle />
        <ErrorBoundary>
          <Component {...pageProps} />
        </ErrorBoundary>
        <ReactQueryDevtools initialIsOpen={false} />
      </>
    </QueryClientProvider>
  )
}
