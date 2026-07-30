import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { PostHogProvider } from "@/components/PostHogProvider";
import { PostHogPageView } from "@/components/PostHogPageView";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Планувальник Рілів",
  description:
    "Покроковий план зйомок та перехідів для коротких відео.",
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
          {user && !isAuthRoute ? (
            <AppShell
              userName={user.user_metadata?.full_name ?? null}
              userEmail={user.email ?? null}
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
