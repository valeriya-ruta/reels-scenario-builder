// Next.js instrumentation hook — wires PostHog server-side error tracking.
// See https://posthog.com/docs/libraries/next-js#error-tracking

import { PostHog } from 'posthog-node'

export async function register() {
  // No-op on register; PostHog client is created lazily inside onRequestError.
}

export async function onRequestError(
  err: unknown,
  request: {
    path: string
    method: string
    headers: { [key: string]: string | undefined }
  },
  context: {
    routerKind: 'Pages Router' | 'App Router'
    routePath: string
    routeType: 'render' | 'route' | 'action' | 'middleware'
    renderSource?: string
    revalidateReason?: string
    renderType?: string
  },
) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return

  const posthog = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  })

  try {
    const error = err instanceof Error ? err : new Error(String(err))
    await posthog.captureException(error, undefined, {
      $request_path: request.path,
      $request_method: request.method,
      $route_path: context.routePath,
      $route_type: context.routeType,
      $router_kind: context.routerKind,
    })
  } catch {
    // Swallow — error tracking must never break the request.
  } finally {
    await posthog.shutdown()
  }
}
