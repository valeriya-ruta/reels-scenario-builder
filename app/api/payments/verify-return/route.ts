import { NextResponse } from 'next/server';

function trialSuccessRedirect(request: Request) {
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = envBase || new URL(request.url).origin;
  // Status 303 forces the browser to switch to GET. Default 307 would preserve
  // POST (WayForPay posts form data here), which then cascades through
  // subsequent redirects and hits `/` as a bogus Server Action request.
  return NextResponse.redirect(new URL('/trial/success', base), 303);
}

export async function GET(request: Request) {
  return trialSuccessRedirect(request);
}

export async function POST(request: Request) {
  return trialSuccessRedirect(request);
}
