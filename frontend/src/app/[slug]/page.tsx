/**
 * Catch-all short-link resolver: `https://{domain}/{slug}`.
 *
 * This route is why short links live on the frontend domain rather than the
 * API's — it produces exactly the `https://{domain}/abc123` shape the task
 * asks for, and an unknown slug falls through to Next's own 404 page.
 *
 * It is a **server component**, which matters:
 *  • the redirect happens before any HTML reaches the browser, so there is no
 *    flash of an intermediate page;
 *  • the visitor's IP and User-Agent are read server-side and forwarded to the
 *    API, so tracking cannot be blocked or forged by client-side script;
 *  • no JavaScript is required for a short link to work.
 *
 * Route precedence handles the collisions: Next matches static segments
 * (`/links`, `/dashboard`) before this dynamic one, and the backend's reserved-
 * slug list prevents anyone claiming those names in the first place.
 */

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { INTERNAL_API_BASE_URL } from '../../lib/api-client';

/**
 * Never pre-render or cache this route: every hit must reach the server so the
 * visit is counted and the current destination is used.
 */
export const dynamic = 'force-dynamic';

/** Route parameters. Promise-shaped, per the Next.js 15 async params API. */
interface SlugPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Resolves a slug and redirects to its destination.
 *
 * @param props.params Route parameters carrying the slug.
 * @returns Never returns normally — it either redirects or renders the 404.
 */
export default async function SlugRedirectPage({ params }: SlugPageProps): Promise<never> {
  const { slug } = await params;

  const targetUrl = await resolveSlug(slug);

  // `notFound()` and `redirect()` work by throwing a control-flow signal that
  // Next catches. They must therefore stay OUTSIDE any try/catch — a stray
  // `catch` would swallow the signal and break the route. This is exactly why
  // `resolveSlug` returns `null` instead of throwing.
  if (!targetUrl) notFound();

  redirect(targetUrl);
}

/**
 * Asks the API to resolve a slug, forwarding the visitor's metadata.
 *
 * The metadata is passed explicitly in the body because this is a server-to-
 * server call: without it, every visit would be attributed to the frontend
 * container's own IP and Node's default User-Agent.
 *
 * @param slug The slug from the URL path.
 * @returns The destination URL, or `null` when the slug cannot be resolved.
 */
async function resolveSlug(slug: string): Promise<string | null> {
  const requestHeaders = await headers();

  // The client IP as seen by whatever proxy fronts this app.
  const forwardedFor = requestHeaders.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ?? requestHeaders.get('x-real-ip') ?? undefined;

  try {
    const response = await fetch(
      `${INTERNAL_API_BASE_URL}/redirect/${encodeURIComponent(slug)}/resolve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip,
          userAgent: requestHeaders.get('user-agent') ?? undefined,
          referrer: extractReferrerHost(requestHeaders.get('referer')),
        }),
        // Belt and braces alongside `force-dynamic`: a cached redirect would
        // both under-count visits and keep serving an edited link's old target.
        cache: 'no-store',
      },
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as { targetUrl?: string };
    return payload.targetUrl ?? null;
  } catch {
    // The API is unreachable. A 404 is the honest response — we genuinely
    // cannot tell where this link points.
    return null;
  }
}

/**
 * Reduces a `Referer` header to its bare hostname.
 *
 * Only the host is forwarded: full referrer URLs can carry session tokens and
 * other sensitive query data that the analytics has no need for.
 *
 * @param referer Raw header value.
 * @returns The referring hostname, or `undefined` for direct traffic.
 */
function extractReferrerHost(referer: string | null): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).hostname.replace(/^www\./i, '') || undefined;
  } catch {
    return undefined;
  }
}
