'use client';

import { useTransition } from 'react';
import { createCarouselProject } from '@/app/carousel-actions';

export default function CreateCarouselProjectButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await createCarouselProject();
        });
      }}
      className="btn-primary cursor-pointer rounded-xl bg-[color:var(--accent)] px-4 py-2 font-medium text-white transition-[background,transform] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? 'Створюю карусель...' : 'Нова карусель'}
    </button>
  );
}
