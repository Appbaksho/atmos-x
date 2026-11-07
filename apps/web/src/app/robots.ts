import type { MetadataRoute } from 'next';

const BASE = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/media/', '/app/admin', '/app/partner', '/app/company', '/app/moderation', '/dev/'] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
