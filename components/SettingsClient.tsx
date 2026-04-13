'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BrandDNASetup from '@/components/BrandDNASetup';
import { useBrandStore } from '@/components/BrandProvider';
import { useToast } from '@/components/ToastProvider';
import { localizeAuthError } from '@/lib/authErrorMessages';
import { createClient } from '@/lib/supabaseClient';
import type { BrandSettings } from '@/lib/brand';

type TabId = 'account' | 'brand';
type PlanType = 'free' | 'founding' | 'standard';

interface SubscriptionRow {
  plan: string | null;
  next_billing_date: string | null;
  status: string | null;
}

export default function SettingsClient({ initialBrandSettings }: { initialBrandSettings: BrandSettings | null }) {
  const [tab, setTab] = useState<TabId>('account');
  const { brandSettings, refetchBrand } = useBrandStore();
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [savedDisplayName, setSavedDisplayName] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const plan = (subscription?.plan?.toLowerCase() as PlanType | undefined) ?? 'free';
  const effectiveBrandSettings = brandSettings ?? initialBrandSettings;
  const isPaidPlan = plan === 'founding' || plan === 'standard';
  const isNameDirty = displayName.trim() !== savedDisplayName.trim();
  const isEmailDirty = email.trim().toLowerCase() !== savedEmail.trim().toLowerCase();

  const planLabel = useMemo(() => {
    if (plan === 'founding') return 'Founding - $5/міс';
    if (plan === 'standard') return 'Standard - $10/міс';
    return 'Free';
  }, [plan]);

  const planBadgeClass = useMemo(() => {
    if (plan === 'founding') return 'bg-amber-50 text-amber-800 border-amber-200';
    if (plan === 'standard') return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    return 'bg-zinc-100 text-zinc-700 border-zinc-200';
  }, [plan]);

  const formattedNextBillingDate = useMemo(() => {
    const raw = subscription?.next_billing_date;
    if (!raw || !isPaidPlan) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }, [isPaidPlan, subscription?.next_billing_date]);

  useEffect(() => {
    const loadAccountSettings = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setUserId(null);
        setEmail('');
        setSavedEmail('');
        setDisplayName('');
        setSavedDisplayName('');
        setProfileLoading(false);
        setSubscriptionLoading(false);
        return;
      }

      setUserId(user.id);
      const authEmail = user.email ?? '';
      setEmail(authEmail);
      setSavedEmail(authEmail);
      setEmailNotice(null);

      const [profileRes, subscriptionRes] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle<{ display_name: string | null }>(),
        supabase
          .from('subscriptions')
          .select('plan,next_billing_date,status')
          .eq('user_id', user.id)
          .maybeSingle<SubscriptionRow>(),
      ]);

      if (!profileRes.error && profileRes.data) {
        const displayNameValue =
          profileRes.data.display_name ||
          (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
          '';
        setDisplayName(displayNameValue);
        setSavedDisplayName(displayNameValue);
      } else {
        const fallback = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
        setDisplayName(fallback);
        setSavedDisplayName(fallback);
      }
      setProfileLoading(false);

      if (!subscriptionRes.error) {
        setSubscription(subscriptionRes.data ?? null);
      }
      setSubscriptionLoading(false);
    };

    void loadAccountSettings();
  }, [supabase]);

  const saveDisplayName = async () => {
    const nextName = displayName.trim();
    if (!userId || !isNameDirty || savingName) return;

    setSavingName(true);
    const { error } = await supabase.from('profiles').upsert(
      { id: userId, display_name: nextName },
      { onConflict: 'id' },
    );
    setSavingName(false);

    if (error) {
      toast?.pushToast('Не вдалося зберегти імʼя', 'error');
      return;
    }

    setSavedDisplayName(nextName);
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { full_name: nextName },
    });
    if (metadataError) {
      toast?.pushToast('Імʼя збережено, але не синхронізовано у профілі сесії', 'info');
      return;
    }
    toast?.pushToast('Профіль оновлено', 'success');
  };

  const saveEmail = async () => {
    const nextEmail = email.trim();
    if (!nextEmail || !isEmailDirty || savingEmail) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(nextEmail)) {
      toast?.pushToast('Некоректна адреса пошти', 'error');
      return;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser(
      { email: nextEmail },
      { emailRedirectTo: `${origin}/settings` },
    );
    setSavingEmail(false);

    if (error) {
      toast?.pushToast(localizeAuthError(error), 'error');
      return;
    }

    setEmailNotice('Майже готово: підтверди нову пошту через лист, який ми надіслали.');
    toast?.pushToast('Підтверди новий email у пошті', 'success');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-semibold text-black">Налаштування</h1>
      <div className="mt-5 flex flex-wrap gap-2 border-b border-[color:var(--border)] pb-3">
        <button
          type="button"
          onClick={() => setTab('account')}
          className={[
            'rounded-lg px-3 py-1.5 text-sm font-medium transition',
            tab === 'account'
              ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              : 'text-zinc-600 hover:bg-[color:var(--surface)]',
          ].join(' ')}
        >
          Акаунт
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('brand');
            void refetchBrand();
          }}
          className={[
            'rounded-lg px-3 py-1.5 text-sm font-medium transition',
            tab === 'brand'
              ? 'bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              : 'text-zinc-600 hover:bg-[color:var(--surface)]',
          ].join(' ')}
        >
          Бренд
        </button>
      </div>

      <div className="mt-5">
        {tab === 'account' ? (
          <div className="max-w-3xl">
            <section className="py-2">
              <h2 className="font-display text-lg font-semibold text-zinc-900">Профіль</h2>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm text-zinc-600">Display name</span>
                  <input
                    type="text"
                    value={displayName}
                    disabled={profileLoading || savingName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onBlur={() => {
                      void saveDisplayName();
                    }}
                    className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[color:var(--accent)]"
                    placeholder="Введи імʼя"
                  />
                </label>
                <label className="block">
                  <p className="text-sm text-zinc-600">Email</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      value={email}
                      disabled={profileLoading || savingEmail}
                      onChange={(e) => setEmail(e.target.value)}
                      className="min-w-[240px] flex-1 rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-[color:var(--accent)]"
                      placeholder="you@example.com"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void saveEmail();
                      }}
                      disabled={!isEmailDirty || savingEmail || profileLoading}
                      className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingEmail ? 'Збереження...' : 'Змінити email'}
                    </button>
                  </div>
                </label>
                {emailNotice && <p className="text-sm text-zinc-600">{emailNotice}</p>}
                <button
                  type="button"
                  onClick={() => {
                    void saveDisplayName();
                  }}
                  disabled={!isNameDirty || savingName || profileLoading}
                  className="rounded-lg bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingName ? 'Збереження...' : 'Зберегти'}
                </button>
              </div>
            </section>

            <div className="my-6 h-px bg-[color:var(--border)]" />

            <section className="py-2">
              <h2 className="font-display text-lg font-semibold text-zinc-900">Підписка</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-zinc-600">Поточний план</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${planBadgeClass}`}>
                    {subscriptionLoading ? 'Завантаження...' : planLabel}
                  </span>
                </div>
                {formattedNextBillingDate && (
                  <p className="text-zinc-600">Наступне списання: {formattedNextBillingDate}</p>
                )}
                {!isPaidPlan ? (
                  <button
                    type="button"
                    className="rounded-lg border border-[color:var(--border)] px-3 py-2 font-medium text-zinc-800 transition hover:bg-[color:var(--surface)]"
                  >
                    Перейти на Pro {'->'}
                  </button>
                ) : (
                  <a
                    href="https://example.com/wayforpay-portal"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm font-medium text-[color:var(--accent)] hover:underline"
                  >
                    Керувати підпискою
                  </a>
                )}
              </div>
            </section>

            <div className="my-6 h-px bg-[color:var(--border)]" />

            <section className="py-2">
              <h2 className="font-display text-lg font-semibold text-zinc-900">Акаунт</h2>
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)]"
                >
                  Вийти
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(true)}
                  className="block text-sm font-medium text-red-600 transition hover:text-red-700"
                >
                  Видалити акаунт
                </button>
              </div>
            </section>
          </div>
        ) : (
          <BrandDNASetup
            key={effectiveBrandSettings ? `brand-${effectiveBrandSettings.favColorHex}-${effectiveBrandSettings.theme}-${effectiveBrandSettings.vibe}` : 'brand-empty'}
            initialValues={effectiveBrandSettings}
            editMode
            onComplete={() => {
              void refetchBrand();
              toast?.pushToast('Бренд оновлено!', 'success');
            }}
          />
        )}
      </div>

      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрити"
            onClick={() => setDeleteModalOpen(false)}
          />
          <div
            className="relative z-[111] w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-account-modal-title" className="font-display text-xl font-semibold text-zinc-900">
              Ти впевнена?
            </h3>
            <p className="mt-3 text-sm leading-normal text-zinc-600">
              Всі твої дані будуть видалені назавжди.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-[color:var(--surface)]"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => {
                  // TODO: call delete account edge function
                  setDeleteModalOpen(false);
                }}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
