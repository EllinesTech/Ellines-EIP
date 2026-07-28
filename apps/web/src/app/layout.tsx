import type { Metadata } from 'next';
import { Exo_2 } from 'next/font/google';
import './globals.css';

const exo2 = Exo_2({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-exo-2',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ellines EIP — Enterprise Intelligence Platform',
  description: 'Where Enterprise Systems Think Together. Powered by Ellinea AI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={exo2.variable}>{children}</body>
    </html>
  );
}
