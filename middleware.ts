import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { subscriptionAllowsAppAccess } from '@/lib/subscriptionAccess';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SUBSCRIPTION_SELECT = 'has_access, access_expires_at, phase';

function isPublicPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/signup') return true;
  if (pathname.startsWith('/auth')) return true;
  if (pathname === '/subscribe' || pathname === '/trial/success') return true;
  if (pathname.startsWith('/share')) return true;
  if (pathname === '/api/payments/webhook') return true;
  if (pathname === '/api/payments/verify-return') return true;
  if (pathname.startsWith('/api/cron/')) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: Parameters<NextResponse['cookies']['set']>[2];
        }[],
      ) {
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (
    user &&
    (pathname === '/api/payments/start-trial' || pathname === '/api/payments/status')
  ) {
    return supabaseResponse;
  }

  if (!user) {
    if (pathname === '/subscribe' || pathname === '/trial/success') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/projects') ||
      pathname.startsWith('/settings') ||
      pathname.startsWith('/carousel') ||
      pathname.startsWith('/competitor-analysis') ||
      pathname.startsWith('/storytellings') ||
      pathname.startsWith('/storytelling') ||
      pathname.startsWith('/project')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (isPublicPath(pathname)) {
    if (pathname === '/subscribe') {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select(SUBSCRIPTION_SELECT)
        .eq('user_id', user.id)
        .maybeSingle();

      if (subscriptionAllowsAppAccess(sub)) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
    }
    return supabaseResponse;
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', user.id)
    .maybeSingle();

  const hasAccess = subscriptionAllowsAppAccess(sub);

  if (hasAccess) {
    return supabaseResponse;
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'subscription_required' }, { status: 403 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/subscribe';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
