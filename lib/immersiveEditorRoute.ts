/**
 * Full-screen, immersive editing surfaces hide the global bottom navbar
 * (Головна · План · ➕ · Аналіз · Профіль). They are focused editors that own
 * their exit affordance (a back-arrow: «Всі каруселі» / «До всіх сценаріїв» /
 * «До всіх сторітелінгів»), so the global nav only steals vertical space and
 * invites the user to leave mid-edit.
 *
 * The carousel editor (`/carousel/[id]`) already behaved this way; the reel/
 * script editor (`/project/[id]`) and the story editor (`/storytelling/[id]`)
 * are brought in line here (task 86d3d23qu). List/index routes
 * (`/carousel`, `/projects`, `/storytellings`) keep the navbar.
 */
export function isImmersiveEditorRoute(pathname: string): boolean {
  return (
    // /carousel/<id> — list lives at /carousel (no trailing id segment).
    (pathname.startsWith('/carousel/') && pathname !== '/carousel') ||
    // /carousel-lab/<id> — v2 lab editor; list lives at /carousel-lab. NOTE this
    // must be checked separately because `/carousel-lab/` does NOT start with
    // `/carousel/`. The public demo editor (/lab-demo) is immersive too.
    (pathname.startsWith('/carousel-lab/') && pathname !== '/carousel-lab') ||
    pathname === '/lab-demo' ||
    // /project/<id> — the reels list lives at /projects (no slash collision).
    pathname.startsWith('/project/') ||
    // /storytelling/<id> — the list lives at /storytellings (no slash collision).
    pathname.startsWith('/storytelling/')
  );
}
