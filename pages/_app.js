import '@/styles/globals.css'
import Head from 'next/head'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>ZiCount - Receipt Analyzer</title>
        <meta name="description" content="Analyze receipt images to extract items and prices using OCR" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#3B82F6" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
    </>
  )
}
