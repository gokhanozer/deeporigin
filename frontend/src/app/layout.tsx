/**
 * Root layout.
 *
 * Wraps every page in the global providers and the site chrome. Providers are
 * client components; this layout stays a server component so the HTML shell
 * still renders on the server.
 */

import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '../providers/AuthProvider';
import { ToastProvider } from '../providers/ToastProvider';
import { Header } from '../components/layout/Header';

export const metadata: Metadata = {
  title: {
    default: 'Shortener — shorten, share, measure',
    // Pages set only their own name; the suffix is appended automatically.
    template: '%s · Shortener',
  },
  description:
    'Shorten long URLs into clean, shareable short links, then track how popular they are.',
  // Short links are shared constantly; keeping them out of search results
  // avoids indexing what are effectively private redirects.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b0f19',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Renders the HTML shell shared by every route.
 *
 * @param props.children The active page.
 * @returns The document layout.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <ToastProvider>
            {/* Lets keyboard users jump past the navigation. Visible only on focus. */}
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-white"
            >
              Skip to content
            </a>

            <Header />

            <main id="main">{children}</main>

            <footer className="mt-16 border-t border-border/70 py-8">
              <div className="mx-auto max-w-6xl px-4 text-center text-xs text-subtle sm:px-6">
                Shortener — built with Next.js, NestJS, Prisma and PostgreSQL.
              </div>
            </footer>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
