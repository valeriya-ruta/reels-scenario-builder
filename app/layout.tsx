import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";

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
  const isAuthRoute = pathname.startsWith("/auth");

  return (
    <html lang="uk">
      <body className="antialiased bg-white text-zinc-900">
        {user && !isAuthRoute ? (
          <AppShell
            userName={user.user_metadata?.full_name ?? null}
            userEmail={user.email ?? null}
          >
            {children}
          </AppShell>
        ) : (
          <div className="flex min-h-screen items-center justify-center bg-white px-4">
            {children}
          </div>
        )}
      </body>
    </html>
  );
}
