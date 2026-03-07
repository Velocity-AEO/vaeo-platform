import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'Velocity AEO — Operator Dashboard',
  description: 'Velocity AEO operator dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen">
        <Header />
        <main className="mx-auto max-w-screen-xl px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
