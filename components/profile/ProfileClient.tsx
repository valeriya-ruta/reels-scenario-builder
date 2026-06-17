'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pencil,
  Bell,
  LifeBuoy,
  LogOut,
  ChevronRight,
  Palette,
  Check,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';
import { useToast } from '@/components/ToastProvider';
import SupportSheet from '@/components/SupportSheet';

const ACCENT = '#004BA8';

export type ProfileSubscription = {
  planName: string;
  priceLabel: string;
  nextChargeLabel: string | null;
};

type ProfileClientProps = {
  userId: string;
  initialDisplayName: string;
  email: string;
  initialInstagramHandle: string;
  initialAvatarUrl: string;
  subscription: ProfileSubscription | null;
};

/** Small inline Instagram glyph (lucide@1.8 has no Instagram export). */
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return '?';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '');
}

export default function ProfileClient({
  userId,
  initialDisplayName,
  email,
  initialInstagramHandle,
  initialAvatarUrl,
  subscription,
}: ProfileClientProps) {
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [instagramHandle, setInstagramHandle] = useState(initialInstagramHandle);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(initialDisplayName);
  const [draftHandle, setDraftHandle] = useState(initialInstagramHandle);
  const [draftAvatar, setDraftAvatar] = useState(initialAvatarUrl);
  const [saving, setSaving] = useState(false);

  const [supportOpen, setSupportOpen] = useState(false);

  const initials = useMemo(() => initialsFrom(displayName, email), [displayName, email]);

  const openEditor = () => {
    setDraftName(displayName);
    setDraftHandle(instagramHandle);
    setDraftAvatar(avatarUrl);
    setEditing(true);
  };

  const saveProfile = async () => {
    if (saving) return;
    setSaving(true);

    const nextName = draftName.trim();
    const nextHandle = normalizeHandle(draftHandle);
    const nextAvatar = draftAvatar.trim();

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: userId, display_name: nextName }, { onConflict: 'id' });

    const { error: metaError } = await supabase.auth.updateUser({
      data: { full_name: nextName, instagram_handle: nextHandle, avatar_url: nextAvatar },
    });

    setSaving(false);

    if (profileError || metaError) {
      toast?.pushToast('Не вдалося зберегти профіль', 'error');
      return;
    }

    setDisplayName(nextName);
    setInstagramHandle(nextHandle);
    setAvatarUrl(nextAvatar);
    setEditing(false);
    toast?.pushToast('Профіль оновлено', 'success');
    router.refresh();
  };

  // WayForPay is NOT wired yet — subscription CTAs must never trigger a real
  // payment call. They route to a coming-soon stub.
  const handleSubscriptionCta = () => {
    toast?.pushToast('Оплата скоро буде доступна', 'info');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-md pb-4">
      <h1 className="font-display text-2xl font-semibold text-zinc-900">Профіль</h1>

      {/* Account header */}
      <section className="mt-5">
        {editing ? (
          <div className="rounded-2xl border border-[color:var(--border)] bg-white p-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--surface)] text-lg font-semibold text-zinc-600"
                aria-hidden
              >
                {draftAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draftAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <p className="text-sm text-zinc-500">Онови імʼя, Instagram та фото профілю.</p>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Імʼя</span>
                <input
                  data-testid="edit-name"
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[color:var(--accent)]"
                  placeholder="Твоє імʼя"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">Instagram</span>
                <div className="flex items-center rounded-xl border border-[color:var(--border)] bg-white px-3">
                  <span className="text-sm text-zinc-400">@</span>
                  <input
                    data-testid="edit-handle"
                    type="text"
                    value={draftHandle}
                    onChange={(e) => setDraftHandle(e.target.value)}
                    className="w-full bg-transparent py-2 pl-1 text-sm text-zinc-900 outline-none"
                    placeholder="username"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-zinc-500">
                  Посилання на фото (необовʼязково)
                </span>
                <input
                  data-testid="edit-avatar"
                  type="url"
                  value={draftAvatar}
                  onChange={(e) => setDraftAvatar(e.target.value)}
                  className="w-full rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[color:var(--accent)]"
                  placeholder="https://..."
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-[color:var(--surface)] disabled:opacity-50"
              >
                <X className="h-4 w-4" /> Скасувати
              </button>
              <button
                type="button"
                data-testid="save-profile"
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white transition disabled:opacity-50"
                style={{ backgroundColor: ACCENT }}
              >
                <Check className="h-4 w-4" /> {saving ? 'Збереження...' : 'Зберегти'}
              </button>
            </div>
          </div>
        ) : (
          <div
            data-testid="account-header"
            className="flex items-center gap-4 rounded-2xl border border-[color:var(--border)] bg-white p-4"
          >
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--surface)] text-lg font-semibold text-zinc-600">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden>{initials}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-zinc-900">
                {displayName || 'Без імені'}
              </p>
              <p className="truncate text-sm text-zinc-500">{email}</p>
              {instagramHandle ? (
                <p
                  className="mt-0.5 truncate text-sm font-medium"
                  style={{ color: ACCENT }}
                  data-testid="instagram-handle"
                >
                  @{instagramHandle}
                </p>
              ) : (
                <p className="mt-0.5 truncate text-sm text-zinc-400">Instagram не вказано</p>
              )}
            </div>
            <button
              type="button"
              data-testid="edit-profile"
              onClick={openEditor}
              aria-label="Редагувати профіль"
              className="shrink-0 rounded-full p-2 text-zinc-500 transition hover:bg-[color:var(--surface)] hover:text-zinc-800"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>

      {/* Subscription */}
      <section className="mt-7">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Підписка</h2>
        {subscription ? (
          <div
            data-testid="subscription-active"
            className="mt-2 rounded-2xl border border-[color:rgba(0,75,168,0.18)] bg-[color:var(--accent-soft)] p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-semibold text-zinc-900">{subscription.planName}</p>
              <span
                className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                style={{ color: ACCENT, borderColor: 'rgba(0,75,168,0.3)' }}
              >
                Активна
              </span>
            </div>
            <p className="mt-1.5 text-sm text-zinc-600">{subscription.priceLabel}</p>
            {subscription.nextChargeLabel && (
              <p className="mt-0.5 text-sm text-zinc-500">{subscription.nextChargeLabel}</p>
            )}
            <button
              type="button"
              data-testid="manage-subscription"
              onClick={handleSubscriptionCta}
              className="mt-3 w-full rounded-xl border border-[color:var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)]"
            >
              Керувати підпискою
            </button>
          </div>
        ) : (
          <div
            data-testid="subscription-none"
            className="mt-2 rounded-2xl border border-[color:var(--border)] bg-white p-4"
          >
            <p className="text-base font-semibold text-zinc-900">Немає активної підписки</p>
            <p className="mt-1.5 text-sm text-zinc-600">
              Оформи підписку, щоб зафіксувати ціну та зберегти доступ.
            </p>
            <button
              type="button"
              data-testid="subscribe"
              onClick={handleSubscriptionCta}
              className="mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.99]"
              style={{ backgroundColor: ACCENT }}
            >
              Оформити підписку
            </button>
          </div>
        )}
      </section>

      {/* Settings */}
      <section className="mt-7">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Налаштування
        </h2>
        <div
            data-testid="settings-list"
            className="mt-2 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white"
        >
          {/* Branding — LIVE, links to the existing brand settings */}
          <a
            href="/settings?tab=brand"
            data-testid="branding-row"
            className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-[color:var(--surface)]"
          >
            <Palette className="h-5 w-5 shrink-0 text-zinc-500" />
            <span className="flex-1 text-sm font-medium text-zinc-800">Брендинг</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </a>

          <div className="border-t border-[color:var(--border)]" />

          {/* Instagram — DISABLED placeholder */}
          <div
            data-testid="instagram-row"
            aria-disabled="true"
            className="flex cursor-not-allowed select-none items-center gap-3 px-4 py-3.5 opacity-[0.55]"
          >
            <InstagramGlyph className="h-5 w-5 shrink-0 text-zinc-500" />
            <span className="flex-1 text-sm font-medium text-zinc-800">Instagram</span>
            <SoonPill />
          </div>

          <div className="border-t border-[color:var(--border)]" />

          {/* Notifications — DISABLED placeholder */}
          <div
            data-testid="notifications-row"
            aria-disabled="true"
            className="flex cursor-not-allowed select-none items-center gap-3 px-4 py-3.5 opacity-[0.55]"
          >
            <Bell className="h-5 w-5 shrink-0 text-zinc-500" />
            <span className="flex-1 text-sm font-medium text-zinc-800">Сповіщення</span>
            <SoonPill />
          </div>

          <div className="border-t border-[color:var(--border)]" />

          {/* Support — LIVE, opens the support popup (placeholder until that task lands) */}
          <button
            type="button"
            data-testid="support-row"
            onClick={() => setSupportOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[color:var(--surface)]"
          >
            <LifeBuoy className="h-5 w-5 shrink-0 text-zinc-500" />
            <span className="flex-1 text-sm font-medium text-zinc-800">Підтримка</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>

          <div className="border-t border-[color:var(--border)]" />

          {/* Logout — the one sanctioned red usage */}
          <button
            type="button"
            data-testid="logout-row"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-red-600 transition hover:bg-red-50"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-sm font-medium">Вийти</span>
          </button>
        </div>
      </section>

      {supportOpen && (
        <SupportSheet
          onClose={() => setSupportOpen(false)}
          userId={userId}
          email={email}
          handle={instagramHandle}
        />
      )}
    </div>
  );
}

function SoonPill() {
  return (
    <span className="shrink-0 rounded-full bg-[color:var(--surface2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide leading-none text-zinc-600">
      Скоро
    </span>
  );
}

