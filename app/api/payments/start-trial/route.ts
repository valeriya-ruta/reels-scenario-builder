import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { createServiceRoleClient } from '@/lib/supabaseAdmin';
import { optionalServerEnv } from '@/lib/env';
import { buildVerifyFormParams, generateOrderRef, missingWayForPayVerifyEnv } from '@/lib/wayforpay';

const VERIFY_ACTION =
  process.env.WAYFORPAY_VERIFY_URL?.trim() || 'https://secure.wayforpay.com/verify';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { phone?: string };
    try {
      body = (await request.json()) as { phone?: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';

    const phoneFromUser =
      (user as { phone?: string }).phone?.trim() ||
      (user.user_metadata as { phone?: string } | undefined)?.phone?.trim() ||
      null;

    const clientPhone = (phoneRaw || phoneFromUser || '380000000000').replace(/\D/g, '') || '380000000000';
    if (clientPhone.length < 10) {
      return NextResponse.json(
        { error: 'Некоректний номер телефону для WayForPay' },
        { status: 400 },
      );
    }

    const missingWfp = missingWayForPayVerifyEnv();
    if (missingWfp.length > 0) {
      return NextResponse.json(
        {
          error: `Не налаштовано WayForPay. Додайте у .env.local: ${missingWfp.join(', ')}`,
        },
        { status: 503 },
      );
    }

    if (!optionalServerEnv('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        {
          error:
            'Не налаштовано SUPABASE_SERVICE_ROLE_KEY. Додайте ключ у .env.local (Supabase → Settings → API → service_role).',
        },
        { status: 503 },
      );
    }

    const admin = createServiceRoleClient();

    const { data: sub, error: subErr } = await admin
      .from('subscriptions')
      .select('phase, status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }

    const st = (sub as { status?: string })?.status;
    if (st != null && st !== 'pending_verify' && st !== 'canceled') {
      return NextResponse.json({ error: 'Already subscribed' }, { status: 409 });
    }

    const phase = sub?.phase;
    if (st == null && phase != null && phase !== 'pending_verify' && phase !== 'cancelled') {
      return NextResponse.json({ error: 'Already subscribed' }, { status: 409 });
    }

    const orderRef = generateOrderRef('VRF', user.id);

    const { error: upErr } = await admin.from('subscriptions').upsert(
      {
        user_id: user.id,
        phase: 'pending_verify',
        verify_order_ref: orderRef,
        client_email: user.email ?? null,
        client_phone: clientPhone,
        has_access: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const formParams = buildVerifyFormParams({
      orderReference: orderRef,
      clientEmail: user.email ?? undefined,
      clientPhone,
    });

    // TEMP DIAGNOSTIC — remove after debugging
    const mask = (v: string | undefined) =>
      v ? `${v.slice(0, 4)}…${v.slice(-2)} (len=${v.length})` : '(empty)';
    // eslint-disable-next-line no-console
    console.log('[WFP_DIAG]', JSON.stringify({
      action: VERIFY_ACTION,
      merchantAccount: formParams.merchantAccount,
      merchantDomainName: formParams.merchantDomainName,
      orderReference: formParams.orderReference,
      amount: formParams.amount,
      currency: formParams.currency,
      returnUrl: formParams.returnUrl,
      serviceUrl: formParams.serviceUrl,
      signature: mask(formParams.merchantSignature),
      secretKeyFingerprint: mask(process.env.WAYFORPAY_SECRET_KEY),
    }));

    return NextResponse.json({
      formParams,
      action: VERIFY_ACTION,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    // eslint-disable-next-line no-console
    console.error('[start-trial]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
