'use client';

import { useState, useRef, useEffect, type ComponentType } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';
import { useNavBadges, type NavBadgeKey } from '@/components/NavBadgeContext';

interface SidebarProps {
  userName?: string | null;
  userEmail?: string | null;
}

const TELEGRAM_FEEDBACK_URL = 'https://t.me/valeriya_ruta';

type NavItem =
  | {
      label: string;
      href: string;
      matchPrefixes: string[];
      active: true;
      badgeKey?: NavBadgeKey;
      icon?: ComponentType<{ className?: string }>;
    }
  | {
      label: string;
      href: null;
      matchPrefixes: string[];
      active: false;
      icon?: ComponentType<{ className?: string }>;
    };

const navItems: NavItem[] = [
  { label: 'Головна', href: '/dashboard', matchPrefixes: ['/dashboard'], active: true },
  {
    label: 'Рілси',
    href: '/projects',
    matchPrefixes: ['/projects', '/project/'],
    active: true,
    badgeKey: 'reels',
  },
  {
    label: 'Каруселі',
    href: '/carousel',
    matchPrefixes: ['/carousel'],
    active: true,
    badgeKey: 'carousel',
  },
  {
    label: 'Сторітели',
    href: '/storytellings',
    matchPrefixes: ['/storytellings', '/storytelling/'],
    active: true,
    badgeKey: 'storytelling',
  },
  {
    label: 'Аналіз профілю',
    href: '/competitor-analysis',
    matchPrefixes: ['/competitor-analysis'],
    active: true,
  },
  { label: 'Статистика', href: null, matchPrefixes: [], active: false },
  { label: 'Календар', href: null, matchPrefixes: [], active: false },
];

export default function Sidebar({ userName, userEmail }: SidebarProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const popoverRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { badges } = useNavBadges();

  const displayName = userName || userEmail || 'Акаунт';

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    if (accountOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountOpen]);

  useEffect(() => {
    if (!feedbackOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFeedbackOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [feedbackOpen]);

  return (
    <aside className="relative flex h-full w-full flex-col overflow-hidden border-r border-[color:var(--border)] bg-white px-2 pb-4 pt-3">
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => {
          if (!item.active) {
            return (
              <div
                key={item.label}
                className="flex cursor-not-allowed select-none items-center justify-between rounded-lg px-3 py-2.5 text-sm text-zinc-500 opacity-40"
              >
                <span className="truncate">{item.label}</span>
                <span className="ml-2 shrink-0 rounded-full bg-[color:var(--surface2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide leading-none text-zinc-600">
                  Soon
                </span>
              </div>
            );
          }

          const isCurrentPage = item.matchPrefixes.some((p) => pathname.startsWith(p));
          const hasDot = item.badgeKey ? badges[item.badgeKey] : false;

          return (
            <a
              key={item.label}
              href={item.href}
              className={[
                'relative flex items-center gap-2 rounded-lg py-2.5 pl-3 pr-3 text-sm font-medium transition-[background,color] duration-150 ease-out',
                isCurrentPage
                  ? 'border-l-[3px] border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                  : 'border-l-[3px] border-transparent text-zinc-600 hover:bg-[color:var(--surface)] hover:text-zinc-900',
              ].join(' ')}
            >
              {item.icon ? <item.icon className="h-4 w-4 shrink-0" /> : null}
              <span className="min-w-0 flex-1 truncate pr-2">{item.label}</span>
              {hasDot && (
                <span className="nav-badge-dot shrink-0" title="Є нове" aria-hidden />
              )}
            </a>
          );
        })}
      </nav>

      <div className="relative mt-auto border-t border-[color:var(--border)] pt-3" ref={popoverRef}>
        {accountOpen && (
          <div className="absolute bottom-full left-0 z-20 mb-2 w-52 rounded-xl border border-[color:var(--border)] bg-white py-1 shadow-xl">
            <a
              href="/settings"
              className="flex w-full cursor-pointer items-center px-4 py-2.5 text-left text-sm leading-normal text-zinc-800 transition-colors hover:bg-[color:var(--surface)]"
              onClick={() => setAccountOpen(false)}
            >
              Налаштування
            </a>
            <button
              type="button"
              onClick={() => {
                setAccountOpen(false);
                setFeedbackOpen(true);
              }}
              className="flex w-full cursor-pointer items-center px-4 py-2.5 text-left text-sm leading-normal text-zinc-800 transition-colors hover:bg-[color:var(--surface)]"
            >
              Дати фідбек
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full cursor-pointer items-center px-4 py-2.5 text-left text-sm leading-normal text-zinc-800 transition-colors hover:bg-[color:var(--surface)]"
            >
              Вийти
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAccountOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--surface)]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface)] text-zinc-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <span className="truncate text-sm font-medium leading-normal text-zinc-800">{displayName}</span>
        </button>
      </div>

      {feedbackOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрити"
            onClick={() => setFeedbackOpen(false)}
          />
          <div
            className="relative z-[101] w-full max-w-md cursor-default rounded-2xl border border-[color:var(--border)] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setFeedbackOpen(false)}
              className="absolute right-3 top-3 cursor-pointer rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-[color:var(--surface)] hover:text-zinc-900"
              aria-label="Закрити"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 id="feedback-modal-title" className="font-display pr-10 text-xl font-semibold text-zinc-900">
              Дати фідбек!
            </h2>
            <p className="mt-4 text-sm leading-normal text-zinc-600">
              Я дуже хочу дізнатись про те, що тобі сподобалось/не сподобалось, які функції додати або що
              виправити. Будь-ласка, напиши мені в Телеграм!
            </p>
            <a
              href={TELEGRAM_FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-6 flex w-full cursor-pointer items-center justify-center rounded-xl bg-[color:var(--accent)] px-4 py-3 text-sm font-medium text-white transition-colors hover:brightness-110"
            >
              Написати в Телеграм
            </a>
          </div>
        </div>
      )}
    </aside>
  );
}
