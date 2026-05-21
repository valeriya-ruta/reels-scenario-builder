'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Capture the unhandled render error to PostHog Error Tracking.
    posthog.captureException(error)
  }, [error])

  return (
    <html lang="uk">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#1a1a1a',
            background: '#ffffff',
          }}
        >
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>
            Щось пішло не так.
          </h1>
          <p style={{ color: '#666', marginBottom: 24 }}>
            Ми вже знаємо про помилку. Спробуй оновити сторінку.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 20px',
              background: '#1a1a1a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Спробувати ще раз
          </button>
        </div>
      </body>
    </html>
  )
}
