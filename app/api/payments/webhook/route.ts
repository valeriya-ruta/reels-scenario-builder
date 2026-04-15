import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabaseAdmin';
import { buildWebhookAck, verifyWebhookSignature } from '@/lib/wayforpay';
import { sendPaymentEmail } from '@/lib/paymentNotify';

export async function POST(request: Request) {
  let orderReference = '';
  try {
    const text = await request.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // eslint-disable-next-line no-console
      console.error('WEBHOOK_PARSE_ERROR');
      return NextResponse.json(buildWebhookAck(''), { status: 200 });
    }

    orderReference = String(body.orderReference ?? '');

    if (!verifyWebhookSignature(body)) {
      // eslint-disable-next-line no-console
      console.warn('INVALID_SIGNATURE');
      return NextResponse.json(buildWebhookAck(orderReference), { status: 200 });
    }

    const admin = createServiceRoleClient();

    const { data: dup } = await admin
      .from('payments')
      .select('transaction_status')
      .eq('order_reference', orderReference)
      .maybeSingle();

    if (dup?.transaction_status === 'Approved') {
      // eslint-disable-next-line no-console
      console.log('DUPLICATE_APPROVED', orderReference);
      return NextResponse.json(buildWebhookAck(orderReference), { status: 200 });
    }

    const { data: sub } = await admin
      .from('subscriptions')
      .select(
        'id, user_id, verify_order_ref, recurring_order_ref, rec_token, consecutive_failed_charges, phase, client_phone, client_email',
      )
      .or(`verify_order_ref.eq.${orderReference},recurring_order_ref.eq.${orderReference}`)
      .maybeSingle();

    const transactionStatus = String(body.transactionStatus ?? '');
    const amount =
      typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount ?? '0'));

    await admin.from('payments').upsert(
      {
        user_id: sub?.user_id ?? null,
        subscription_id: sub?.id ?? null,
        order_reference: orderReference,
        amount: Number.isFinite(amount) ? amount : 0,
        currency: String(body.currency ?? 'USD'),
        transaction_status: transactionStatus,
        auth_code: body.authCode != null ? String(body.authCode) : null,
        card_pan: body.cardPan != null ? String(body.cardPan) : null,
        card_type: body.cardType != null ? String(body.cardType) : null,
        issuer_bank_name: body.issuerBankName != null ? String(body.issuerBankName) : null,
        payment_system: body.paymentSystem != null ? String(body.paymentSystem) : null,
        wfp_raw: body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'order_reference' },
    );

    if (!sub?.id) {
      // eslint-disable-next-line no-console
      console.log('ORPHAN_WEBHOOK', orderReference);
      return NextResponse.json(buildWebhookAck(orderReference), { status: 200 });
    }

    if (transactionStatus === 'WaitingAmountConfirm') {
      // eslint-disable-next-line no-console
      console.log('WaitingAmountConfirm', orderReference);
      return NextResponse.json(buildWebhookAck(orderReference), { status: 200 });
    }

    const isVerify = orderReference === sub.verify_order_ref;
    const isCharge = orderReference === sub.recurring_order_ref;
    const recTokenRaw = body.recToken != null && String(body.recToken).length > 0 ? String(body.recToken) : '';
    const phoneFromBody = body.phone != null ? String(body.phone).trim() : '';

    if (transactionStatus === 'Approved') {
      if (isVerify) {
        const now = Date.now();
        const phaseEnds = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
        const accessExpires = new Date(now + 32 * 24 * 60 * 60 * 1000).toISOString();
        const update: Record<string, unknown> = {
          client_phone: phoneFromBody || sub.client_phone,
          phase: 'trial',
          phase_ends_at: phaseEnds,
          has_access: true,
          access_expires_at: accessExpires,
          trial_verified_at: new Date(now).toISOString(),
          consecutive_failed_charges: 0,
          updated_at: new Date().toISOString(),
        };
        if (recTokenRaw) {
          update.rec_token = recTokenRaw;
        }
        await admin.from('subscriptions').update(update).eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.log(`CARD_VERIFIED userId=${sub.user_id}`);
      } else if (isCharge) {
        await admin
          .from('subscriptions')
          .update({
            consecutive_failed_charges: 0,
            has_access: true,
            access_expires_at: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.log(`CHARGE_APPROVED userId=${sub.user_id} amount=${amount}`);
      }
    } else if (isCharge) {
      const prev = sub.consecutive_failed_charges ?? 0;
      const newCount = prev + 1;
      if (newCount >= 3) {
        await admin
          .from('subscriptions')
          .update({
            consecutive_failed_charges: newCount,
            has_access: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);
        await sendPaymentEmail(
          sub.client_email,
          'Ruta — доступ призупинено',
          'Не вдалося списати кошти кілька разів. Оновіть картку в підписці або зверніться до підтримки.',
        );
        // eslint-disable-next-line no-console
        console.log(`ACCESS_REVOKED userId=${sub.user_id}`);
      } else {
        await admin
          .from('subscriptions')
          .update({
            consecutive_failed_charges: newCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);
        await sendPaymentEmail(
          sub.client_email,
          'Ruta — проблема з оплатою',
          'Не вдалося списати черговий платіж. Ми спробуємо ще раз; перевірте картку та баланс.',
        );
        // eslint-disable-next-line no-console
        console.log(`CHARGE_FAILED attempt=${newCount}`);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('WEBHOOK_ERROR', e);
  }

  return NextResponse.json(buildWebhookAck(orderReference), { status: 200 });
}
