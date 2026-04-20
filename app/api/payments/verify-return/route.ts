import { NextResponse } from 'next/server';

function trialSuccessRedirect() {
  return NextResponse.redirect(
    new URL('/trial/success', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'),
  );
}

export async function GET() {
  return trialSuccessRedirect();
}

export async function POST() {
  return trialSuccessRedirect();
}
