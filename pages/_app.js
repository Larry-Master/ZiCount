import '@/styles/globals.css'
import '@/styles/variables.css'
import '@/styles/components/participant-selection.css'
import '@/styles/components/people-manager.css'
import '@/styles/components/buttons.css'
import '@/styles/components/forms.css'
import '@/styles/components/debt-solver.css'
import Head from 'next/head'
import ErrorBoundary from '@/components/ErrorBoundary'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

// Create QueryClient singleton outside component to avoid recreation on re-renders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
    }
  }
})

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return

    const origConsoleError = console.error
    console.error = (...args) => {
      const first = args[0]
      if (typeof first === 'string' && first.includes('webpack.hot-update.json')) return
      origConsoleError(...args)
    }
    return () => { console.error = origConsoleError }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <>
        <Head>
          <title>ZiCount - Receipt Analyzer</title>
          <meta name="description" content="Analyze receipt images to extract items and prices using OCR" />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <meta name="theme-color" content="#0f1720" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <ErrorBoundary>
          <Component {...pageProps} />
        </ErrorBoundary>
        <ReactQueryDevtools initialIsOpen={false} />
      </>
    </QueryClientProvider>
  )
}
