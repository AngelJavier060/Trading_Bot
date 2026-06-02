import '../styles/globals.css';
import { AppProps } from 'next/app';
import { Toaster } from 'react-hot-toast';
import Head from 'next/head';
import { ThemeProvider } from '../context/ThemeContext';
import { PlatformProvider } from '../context/PlatformContext';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <PlatformProvider>
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <title>AI Trading System</title>
      </Head>
      <Component {...pageProps} />
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            style: {
              background: '#22c55e',
            },
          },
          error: {
            duration: 4000,
            style: {
              background: '#ef4444',
            },
          },
                }}
      />
      </PlatformProvider>
    </ThemeProvider>
  );
}

export default MyApp;