/**
 * PostCSS configuration.
 *
 * Tailwind CSS v4 ships its own PostCSS plugin and reads its configuration from
 * the stylesheet itself (`@theme` in `globals.css`), so no `tailwind.config.js`
 * is required.
 *
 * @type {import('postcss-load-config').Config}
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
