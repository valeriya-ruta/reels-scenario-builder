import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-zinc-900`}
      >
        {user && !isAuthRoute ? (
          <AppShell
            userName={user.user_metadata?.full_name ?? null}
            userEmail={user.email ?? null}
          >
            {children}
          </AppShell>
        ) : (
          <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
            {children}
          </div>
        )}
      </body>
    </html>
  );
}
