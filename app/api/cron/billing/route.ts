import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabaseAdmin';
import { sendPaymentEmail } from '@/lib/paymentNotify';
import {
  chargeWithRecToken,
  daysFromNow,
  generateOrderRef,
  toDateDDMMYYYY,
} from '@/lib/wayforpay';

type CronJobResult = {
  userId: string;
  status: 'success' | 'failed';
  error?: string;
};

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

async function notifyCronAlert(subject: string, text: string): Promise<void> {
  const to = process.env.CRON_ALERT_EMAIL?.trim();
  await sendPaymentEmail(to, subject, text);
}

function isChargeApproved(raw: Record<string, unknown>): boolean {
  return String(raw.transactionStatus ?? '').toLowerCase() === 'approved';
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function oneDayFromNowIso(): string {
  return addDays(new Date(), 1).toISOString();
}

function threeDaysFromNowIso(): string {
  return addDays(new Date(), 3).toISOString();
}

type ClaimedRow = {
  id: string;
  user_id: string;
  subscription_status: string;
  previous_next_billing: string;
  trial_end: string | null;
  rec_token: string | null;
  plan_price: number | string | null;
  client_email: string | null;
  client_phone: string | null;
  retry_count: number | null;
  is_founder: boolean | null;
  consecutive_failed_charges: number | null;
  phase: string | null;
};

async function handleBillingCron(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const results: CronJobResult[] = [];

  const { data: claimed, error: claimErr } = await admin.rpc('claim_due_subscriptions', {
    p_limit: 100,
  });

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  for (const row of (claimed ?? []) as ClaimedRow[]) {
    const sub = row;
    if (!sub.rec_token) {
      results.push({ userId: sub.user_id, status: 'failed', error: 'missing_rec_token' });
      continue;
    }

    const orderRef = generateOrderRef('CHG', sub.user_id);
    const clientEmail = sub.client_email ?? 'billing@ruta.app';
    const clientPhone = (sub.client_phone ?? '380000000000').replace(/\D/g, '') || '380000000000';

    // WARNING: Never modify plan_price for subscriptions where is_founder = true.
    // Founders are locked at $5/month forever. To change pricing for new users,
    // update the default only in the signup flow, never here.
    const amountToCharge = Number(sub.plan_price ?? 5);
    if (!Number.isFinite(amountToCharge) || amountToCharge <= 0) {
      results.push({ userId: sub.user_id, status: 'failed', error: 'invalid_plan_price' });
      continue;
    }

    const prevNext = new Date(sub.previous_next_billing);
    const trialEnd = sub.trial_end ? new Date(sub.trial_end) : null;

    try {
      const { error: payErr } = await admin.from('payments').insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        order_reference: orderRef,
        amount: amountToCharge,
        transaction_status: 'pending',
        currency: 'USD',
        updated_at: nowIso,
      });

      if (payErr) {
        await admin
          .from('subscriptions')
          .update({ next_billing_date: oneDayFromNowIso(), updated_at: nowIso })
          .eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.error('BILLING_FAILED userId=' + sub.user_id, payErr.message);
        results.push({ userId: sub.user_id, status: 'failed', error: payErr.message });
        continue;
      }

      const { error: refErr } = await admin
        .from('subscriptions')
        .update({ recurring_order_ref: orderRef, updated_at: nowIso })
        .eq('id', sub.id);

      if (refErr) {
        await admin
          .from('subscriptions')
          .update({ next_billing_date: oneDayFromNowIso(), updated_at: nowIso })
          .eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.error('BILLING_FAILED userId=' + sub.user_id, refErr.message);
        results.push({ userId: sub.user_id, status: 'failed', error: refErr.message });
        continue;
      }

      const raw = (await chargeWithRecToken({
        orderReference: orderRef,
        amount: amountToCharge,
        recToken: sub.rec_token,
        productLabel: 'Ruta — підписка',
        clientEmail,
        clientPhone,
        regularMode: 'monthly',
        dateNext: toDateDDMMYYYY(daysFromNow(30)),
        dateEnd: '01.01.2099',
      })) as Record<string, unknown>;

      if (isChargeApproved(raw)) {
        let nextBill: Date;
        const firstTrialCycle =
          sub.phase === 'trial' && trialEnd != null && !Number.isNaN(trialEnd.getTime());
        if (firstTrialCycle) {
          nextBill = addDays(trialEnd!, 30);
        } else {
          nextBill = addDays(prevNext, 30);
        }

        const nextIso = nextBill.toISOString();

        await admin
          .from('subscriptions')
          .update({
            status: 'active',
            phase: 'full',
            retry_count: 0,
            consecutive_failed_charges: 0,
            next_billing_date: nextIso,
            phase_ends_at: nextIso,
            current_amount: amountToCharge,
            wfp_recurring_status: 'Active',
            has_access: true,
            access_expires_at: addDays(new Date(), 35).toISOString(),
            updated_at: nowIso,
          })
          .eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.log('BILLING_SUCCESS userId=' + sub.user_id + ' amount=' + amountToCharge);
        results.push({ userId: sub.user_id, status: 'success' });
      } else {
        const prev = sub.retry_count ?? sub.consecutive_failed_charges ?? 0;
        const nextCount = prev + 1;
        const update: Record<string, unknown> = {
          next_billing_date: threeDaysFromNowIso(),
          retry_count: nextCount,
          consecutive_failed_charges: nextCount,
          updated_at: nowIso,
        };
        if (nextCount < 3) {
          update.status = 'past_due';
        } else {
          update.status = 'suspended';
          update.suspended_at = nowIso;
        }
        await admin.from('subscriptions').update(update).eq('id', sub.id);
        // eslint-disable-next-line no-console
        console.log('BILLING_DECLINED userId=' + sub.user_id);
        results.push({
          userId: sub.user_id,
          status: 'failed',
          error: String(raw.transactionStatus ?? 'not_approved'),
        });
        if (nextCount >= 3) {
          await notifyCronAlert(
            'Ruta cron: billing suspended',
            `userId=${sub.user_id} retry_count=${nextCount}`,
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        const prev = sub.retry_count ?? sub.consecutive_failed_charges ?? 0;
        const nextCount = prev + 1;
        const update: Record<string, unknown> = {
          next_billing_date: threeDaysFromNowIso(),
          retry_count: nextCount,
          consecutive_failed_charges: nextCount,
          updated_at: new Date().toISOString(),
        };
        if (nextCount < 3) {
          update.status = 'past_due';
        } else {
          update.status = 'suspended';
          update.suspended_at = new Date().toISOString();
        }
        await admin.from('subscriptions').update(update).eq('id', sub.id);
        if (nextCount >= 3) {
          await notifyCronAlert(
            'Ruta cron: billing exception → suspended',
            `userId=${sub.user_id} retry_count=${nextCount} error=${msg}`,
          );
        }
      } catch {
        // ignore secondary failure
      }
      // eslint-disable-next-line no-console
      console.log('BILLING_EXCEPTION userId=' + sub.user_id);
      results.push({ userId: sub.user_id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}

export const GET = handleBillingCron;
export const POST = handleBillingCron;
