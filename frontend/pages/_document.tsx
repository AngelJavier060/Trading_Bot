import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="es" className="dark">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="AI Trading System - Multi-Platform Trading Bot" />
      </Head>
      <body className="bg-slate-900 text-white antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
