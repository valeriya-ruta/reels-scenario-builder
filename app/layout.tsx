import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { getOperatorContext } from "@/lib/pro/operator";
import { listProProjects } from "@/lib/pro/projects";
import { getActiveProjectId } from "@/lib/pro/activeProject";
import type { ProState } from "@/components/pro/ProContext";
import { PostHogProvider } from "@/components/PostHogProvider";
import StandaloneLaunchRedirect from '@/components/StandaloneLaunchRedirect';
import { PostHogPageView } from "@/components/PostHogPageView";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Планувальник Рілів",
  description:
    "Покроковий план зйомок та перехідів для коротких відео.",
  // iOS ignores the manifest's `display`, so standalone mode needs this too.
  // Without it an added-to-home-screen icon opens in a Safari chrome window.
  appleWebApp: {
    capable: true,
    title: 'Ruta',
    statusBarStyle: 'default',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = await getCurrentUser();
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "";
  const isAuthRoute =
    pathname.startsWith("/auth") ||
    pathname === "/subscribe" ||
    pathname === "/trial/success" ||
    pathname === "/" ||
    pathname === "/signup";
  // Public share links (actor/editor/client) render full-screen with no app chrome.
  const isBareRoute = pathname.startsWith("/share");

  // Ruta Pro: resolve the operator context + bloggers once, server-side, so the
  // top selector and per-project brand are seeded without a client round-trip.
  let pro: ProState | undefined;
  if (user && !isAuthRoute) {
    const { isOperator } = await getOperatorContext();
    if (isOperator) {
      const projects = await listProProjects();
      const pinned = await getActiveProjectId();
      const activeProject = pinned ? projects.find((p) => p.id === pinned) ?? null : null;
      pro = {
        isOperator: true,
        projects,
        activeProjectId: activeProject ? activeProject.id : null,
        activeProject,
      };
    }
  }

  return (
    <html lang="uk">
      <head>
        {/* Material Symbols, subset to the icons the app actually renders. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:FILL@0..1&icon_names=view_carousel,movie,auto_stories,lightbulb_2&display=block"
        />
      </head>
      <body className="antialiased" style={{ background: 'var(--canvas)', color: 'var(--foreground)' }}>
        <PostHogProvider>
          <Suspense>
            <PostHogPageView />
          </Suspense>
          {/* iOS ignores the manifest's start_url for Add-to-Home-Screen, so an
              icon created on Каруселі keeps opening Каруселі. This lands the
              installed app on Головна on launch, whatever URL got baked in. */}
          <Suspense>
            <StandaloneLaunchRedirect />
          </Suspense>
          {isBareRoute ? (
            children
          ) : user && !isAuthRoute ? (
            <AppShell
              userName={user.user_metadata?.full_name ?? null}
              userEmail={user.email ?? null}
              pro={pro}
            >
              {children}
            </AppShell>
          ) : (
            <div
              className="flex min-h-screen items-center justify-center px-4"
              style={{ background: 'var(--canvas)' }}
            >
              {children}
            </div>
          )}
        </PostHogProvider>
      </body>
    </html>
  );
}
