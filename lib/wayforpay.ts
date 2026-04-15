import 'server-only';

import crypto from 'node:crypto';

function readEnv(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

const VERIFY_FORM_ENV_KEYS = [
  'WAYFORPAY_MERCHANT_ACCOUNT',
  'WAYFORPAY_MERCHANT_DOMAIN',
  'WAYFORPAY_SECRET_KEY',
  'WAYFORPAY_RETURN_URL',
  'WAYFORPAY_SERVICE_URL',
] as const;

/** Names of missing env vars required for the card-verify form (empty if all set). */
export function missingWayForPayVerifyEnv(): string[] {
  return VERIFY_FORM_ENV_KEYS.filter((k) => !readEnv(k));
}

const MA = process.env.WAYFORPAY_MERCHANT_ACCOUNT!;
const DOM = process.env.WAYFORPAY_MERCHANT_DOMAIN!;
const SK = process.env.WAYFORPAY_SECRET_KEY!;
const MP = process.env.WAYFORPAY_MERCHANT_PASSWORD!;

// ─── CORE HELPERS ─────────────────────────────────────────────────────────────

export const hmacMd5 = (str: string, key = SK): string =>
  crypto.createHmac('md5', key).update(str, 'utf8').digest('hex');

export function generateOrderRef(prefix: 'VRF' | 'CHG', userId: string): string {
  const idPart = userId.replace(/-/g, '').slice(0, 8);
  return `${prefix}_${idPart}_${Date.now()}`;
}

export function toDateDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function amountForSignature(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

// ─── VERIFY ───────────────────────────────────────────────────────────────────

export function buildVerifyFormParams(opts: {
  orderReference: string;
  clientEmail?: string;
  clientPhone?: string;
}): Record<string, string> {
  const ma = readEnv('WAYFORPAY_MERCHANT_ACCOUNT');
  const dom = readEnv('WAYFORPAY_MERCHANT_DOMAIN');
  const sk = readEnv('WAYFORPAY_SECRET_KEY');
  const returnUrl = readEnv('WAYFORPAY_RETURN_URL');
  const serviceUrl = readEnv('WAYFORPAY_SERVICE_URL');
  if (!ma || !dom || !sk || !returnUrl || !serviceUrl) {
    throw new Error(
      `WayForPay verify env incomplete (need: ${missingWayForPayVerifyEnv().join(', ') || 'all keys'})`,
    );
  }

  const amount = '0';
  const currency = 'UAH';
  const sig = hmacMd5([ma, dom, opts.orderReference, amount, currency].join(';'), sk);

  return {
    merchantAccount: ma,
    merchantAuthType: 'SimpleSignature',
    merchantDomainName: dom,
    merchantSignature: sig,
    orderReference: opts.orderReference,
    amount,
    currency,
    paymentSystem: 'card',
    verifyType: 'simple',
    apiVersion: '1',
    returnUrl,
    serviceUrl,
    ...(opts.clientEmail ? { clientEmail: opts.clientEmail } : {}),
    ...(opts.clientPhone ? { clientPhone: opts.clientPhone } : {}),
  };
}

// ─── CHARGE ───────────────────────────────────────────────────────────────────

export async function chargeWithRecToken(opts: {
  orderReference: string;
  amount: number;
  recToken: string;
  productLabel: string;
  clientEmail: string;
  clientPhone: string;
  clientFirstName?: string;
  clientLastName?: string;
  regularMode?: 'monthly';
  dateNext?: string;
  dateEnd?: string;
}): Promise<Record<string, unknown>> {
  const orderDate = Math.floor(Date.now() / 1000);
  const productNames = [opts.productLabel];
  const productCounts = [1];
  const productPrices = [opts.amount];

  const sigStr = [
    MA,
    DOM,
    opts.orderReference,
    orderDate,
    amountForSignature(opts.amount),
    'USD',
    ...productNames,
    ...productCounts,
    ...productPrices.map(amountForSignature),
  ].join(';');

  const body: Record<string, unknown> = {
    transactionType: 'CHARGE',
    merchantAccount: MA,
    merchantAuthType: 'SimpleSignature',
    merchantDomainName: DOM,
    merchantTransactionType: 'SALE',
    merchantTransactionSecureType: 'NON3DS',
    merchantSignature: hmacMd5(sigStr),
    apiVersion: 1,
    serviceUrl: process.env.WAYFORPAY_SERVICE_URL!,
    orderReference: opts.orderReference,
    orderDate,
    amount: opts.amount,
    currency: 'USD',
    recToken: opts.recToken,
    productName: productNames,
    productPrice: productPrices,
    productCount: productCounts,
    clientEmail: opts.clientEmail,
    clientFirstName: opts.clientFirstName ?? 'Ruta',
    clientLastName: opts.clientLastName ?? 'User',
    clientPhone: opts.clientPhone,
    clientCountry: 'UKR',
    ...(opts.regularMode === 'monthly'
      ? {
          regularMode: 'monthly',
          regularAmount: opts.amount,
          regularBehavior: 'preset',
          regularOn: '1',
          dateNext: opts.dateNext ?? toDateDDMMYYYY(daysFromNow(30)),
          dateEnd: opts.dateEnd ?? '01.01.2099',
        }
      : {}),
  };

  const res = await fetch('https://api.wayforpay.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text, status: res.status, parseError: true };
  }
}

// ─── REGULAR API ──────────────────────────────────────────────────────────────

async function callRegularApi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.wayforpay.com/regularApi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchantAccount: MA, merchantPassword: MP, ...body }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text, status: res.status, parseError: true };
  }
}

export const changeRecurringAmount = (orderReference: string, newAmount: number) =>
  callRegularApi({
    requestType: 'CHANGE',
    orderReference,
    regularMode: 'monthly',
    amount: String(newAmount),
    currency: 'USD',
    dateBegin: toDateDDMMYYYY(new Date()),
    dateEnd: '01.01.2099',
  });

export const suspendRecurring = (ref: string) =>
  callRegularApi({ requestType: 'SUSPEND', orderReference: ref });

export const resumeRecurring = (ref: string) =>
  callRegularApi({ requestType: 'RESUME', orderReference: ref });

export const getRecurringStatus = (ref: string) =>
  callRegularApi({ requestType: 'STATUS', orderReference: ref });

// ─── WEBHOOK HELPERS ──────────────────────────────────────────────────────────

/** WayForPay serviceUrl body — normalize missing fields to empty strings for HMAC. */
export function verifyWebhookSignature(body: Record<string, unknown>): boolean {
  const sig = body.merchantSignature;
  if (typeof sig !== 'string' || !sig) return false;
  const merchantAccount = String(body.merchantAccount ?? '');
  const orderReference = String(body.orderReference ?? '');
  if (!merchantAccount || !orderReference) return false;

  const str = [
    merchantAccount,
    orderReference,
    String(body.amount ?? ''),
    String(body.currency ?? ''),
    String(body.authCode ?? ''),
    String(body.cardPan ?? ''),
    String(body.transactionStatus ?? ''),
    String(body.reasonCode ?? ''),
  ].join(';');
  const expected = hmacMd5(str);
  return expected.toLowerCase() === sig.toLowerCase();
}

export function buildWebhookAck(orderReference: string): Record<string, unknown> {
  const time = Math.floor(Date.now() / 1000);
  const signature = hmacMd5(`${orderReference};accept;${time}`);
  return { orderReference, status: 'accept', time, signature };
}
