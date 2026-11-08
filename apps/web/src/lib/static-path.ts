/**
 * Does a path name a static file (public/ or a metadata route) rather than an app page?
 *
 * Only real file extensions count. App ids can contain dots: farm alert ids end in a coordinate
 * (`lightning-2026-11-09@23.8,90.4`), and treating `.4` as an extension skipped locale routing
 * and turned every alert link into a 404.
 */
const STATIC_FILE = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|ttf|otf|woff2?|txt|xml|json|m?js|css|map|html|webmanifest)$/i;

export function isStaticFilePath(pathname: string): boolean {
  return STATIC_FILE.test(pathname);
}
