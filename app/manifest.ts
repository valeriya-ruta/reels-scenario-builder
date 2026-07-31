import type { MetadataRoute } from 'next';

/**
 * Web app manifest.
 *
 * The app had none, so an "Add to Home Screen" shortcut simply froze whatever
 * URL happened to be open when it was created — which is how the app ended up
 * launching straight into Каруселі. Nothing in the code ever routed there: `/`
 * and login both redirect to `/dashboard`.
 *
 * `start_url` makes Головна the entry point regardless of where the shortcut was
 * made from, and `scope` keeps in-app navigation inside the standalone window
 * instead of bouncing out to the browser.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ruta — твоя контент-подружка',
    short_name: 'Ruta',
    description: 'Від думки до опублікованого: ідеї, сценарії, каруселі та сторіс в одному місці.',
    // Always open on Головна — the agenda + insights, never a content list.
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'uk',
    background_color: '#f7f7f5',
    theme_color: '#004ba8',
  };
}
