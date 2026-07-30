import type { Metadata } from 'next';
import '@/fonts/exo2.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ellines EIP — Enterprise Intelligence Platform',
  description: 'Where Enterprise Systems Think Together. Powered by Ellinea AI.',
  icons: {
    icon: [
      { url: '/brand/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/icon-48.png', sizes: '48x48', type: 'image/png' },
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/brand/icon-32.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/brand/icon-180.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
