import type { MetadataRoute } from 'next';
import { SITE_NAME } from '@/lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: 'PharmaLink',
    description: 'B2B marketplace for GMP-verified pharmaceutical ingredients.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F8FAFC',
    // Ink, matching the shell rail and the marketing hero — not the pre-redesign indigo.
    theme_color: '#06121F',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
    ],
  };
}
