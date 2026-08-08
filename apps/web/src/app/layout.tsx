import type { Metadata } from 'next';
import '@/fonts/exo2.css';
import './globals.css';
import { ErrorBoundary } from '@/components/error-boundary';

export const metadata: Metadata = {
  title: 'Ellines EIP — Enterprise Intelligence Platform',
  description: 'Where Enterprise Systems Think Together. Powered by Ellinea AI.',
  applicationName: 'Ellines EIP',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Ellines EIP',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/brand/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/icon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/brand/icon-180.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
    { media: '(prefers-color-scheme: light)', color: '#6F2D8D' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/brand/icon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/brand/icon-180.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Ellines EIP" />
      </head>
      <body suppressHydrationWarning><ErrorBoundary>{children}</ErrorBoundary></body>
    </html>
  );
}
