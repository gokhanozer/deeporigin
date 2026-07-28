import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to this directory (ESM has no __dirname). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Next.js configuration.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Pin file tracing to this directory. The repo root carries its own
  // package-lock.json (for the `npm run dev` convenience scripts), and without
  // this Next walks up, finds multiple lockfiles, and guesses the repo root as
  // the workspace root. That both emits a warning and makes the local
  // standalone build trace a different tree than the Docker build, where the
  // build context is this directory alone.
  outputFileTracingRoot: projectRoot,

  // Emits a self-contained `.next/standalone` bundle with only the node_modules
  // actually reached at runtime. This is what keeps the production Docker image
  // small — see `frontend/Dockerfile`.
  output: 'standalone',

  reactStrictMode: true,

  // The build must not be allowed to succeed with type errors: a broken
  // deployment is far worse than a failed build.
  typescript: { ignoreBuildErrors: false },

  /**
   * Security headers applied to every response.
   *
   * @returns {Promise<Array<{source: string, headers: Array<{key: string, value: string}>}>>}
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Stop the browser from second-guessing declared content types.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Disallow framing, which blocks clickjacking.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Send only the origin as a referrer to other sites. Notably, this
          // means our own short links leak nothing beyond the short domain.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // No use for these APIs; deny them outright.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
