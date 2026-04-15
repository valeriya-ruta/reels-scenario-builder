import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.redirect(
    new URL('/trial/success', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'),
  );
}
