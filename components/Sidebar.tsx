'use client';

import { useState, useRef, useEffect } from 'react';
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
    }
  | {
      label: string;
      href: null;
      matchPrefixes: string[];
      active: false;
    };

const navItems: NavItem[] = [
  { label: 'Головна', href: '/dashboard', matchPrefixes: ['/dashboard'], active: true },
  {
    label: 'Написати рілс',
    href: '/projects',
    matchPrefixes: ['/projects', '/project/'],
    active: true,
    badgeKey: 'reels',
  },
  {
    label: 'Аналіз конкурентів',
    href: '/competitor-analysis',
    matchPrefixes: ['/competitor-analysis'],
    active: true,
  },
  {
    label: 'Сторітел',
    href: '/storytellings',
    matchPrefixes: ['/storytellings', '/storytelling/'],
    active: true,
    badgeKey: 'storytelling',
  },
  { label: 'Карусель', href: null, matchPrefixes: [], active: false },
  { label: 'Налаштування', href: '/settings', matchPrefixes: ['/settings'], active: true },
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
    <aside className="relative flex h-full w-full flex-col overflow-hidden border-r border-[#e5e5e5] bg-white px-2 py-4">
      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map((item) => {
          if (!item.active) {
            return (
              <div
                key={item.label}
                className="flex cursor-default select-none items-center justify-between rounded-lg px-3 py-2.5 text-sm text-zinc-500"
              >
                <span className="truncate">{item.label}</span>
                <span className="ml-2 shrink-0 rounded bg-[#f5f5f5] px-1.5 py-0.5 text-[10px] font-medium leading-none text-zinc-500">
                  незабаром
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
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isCurrentPage
                  ? 'bg-[#e8f0fc] text-[#004BA8] ring-1 ring-[#004BA8]/20'
                  : 'text-zinc-600 hover:bg-[#f5f5f5] hover:text-black'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {hasDot && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-[#004BA8]"
                  title="Є нове"
                  aria-hidden
                />
              )}
            </a>
          );
        })}
      </nav>

      <div className="relative mt-auto" ref={popoverRef}>
        {accountOpen && (
          <div className="absolute bottom-full left-0 z-20 mb-2 w-52 rounded-xl border border-[#e5e5e5] bg-white py-1 shadow-xl">
            <a
              href="/settings"
              className="flex w-full cursor-pointer items-center px-4 py-2.5 text-left text-sm text-zinc-800 transition-colors hover:bg-[#f5f5f5]"
              onClick={() => setAccountOpen(false)}
            >
              Налаштування
            </a>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full cursor-pointer items-center px-4 py-2.5 text-left text-sm text-zinc-800 transition-colors hover:bg-[#f5f5f5]"
            >
              Вийти
            </button>
            <button
              type="button"
              onClick={() => {
                setAccountOpen(false);
                setFeedbackOpen(true);
              }}
              className="flex w-full cursor-pointer items-center px-4 py-2.5 text-left text-sm text-zinc-800 transition-colors hover:bg-[#f5f5f5]"
            >
              Дати фідбек
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAccountOpen((v) => !v)}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#f5f5f5]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5f5f5] text-zinc-600">
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
          <span className="truncate text-sm font-medium text-zinc-800">{displayName}</span>
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
            className="relative z-[101] w-full max-w-md cursor-default rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setFeedbackOpen(false)}
              className="absolute right-3 top-3 cursor-pointer rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-[#f5f5f5] hover:text-zinc-900"
              aria-label="Закрити"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 id="feedback-modal-title" className="font-display pr-10 text-xl font-semibold text-zinc-900">
              Дати фідбек!
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              Я дуже хочу дізнатись про те, що тобі сподобалось/не сподобалось, які функції додати або що
              виправити. Будь-ласка, напиши мені в Телеграм!
            </p>
            <a
              href={TELEGRAM_FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex w-full cursor-pointer items-center justify-center rounded-xl bg-[#004BA8] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#0d5bb8]"
            >
              Написати в Телеграм
            </a>
          </div>
        </div>
      )}
    </aside>
  );
}
