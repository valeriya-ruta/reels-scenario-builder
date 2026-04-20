import { NextResponse } from 'next/server';

function trialSuccessRedirect(request: Request) {
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = envBase || new URL(request.url).origin;
  return NextResponse.redirect(new URL('/trial/success', base));
}

export async function GET(request: Request) {
  return trialSuccessRedirect(request);
}

export async function POST(request: Request) {
  return trialSuccessRedirect(request);
}
