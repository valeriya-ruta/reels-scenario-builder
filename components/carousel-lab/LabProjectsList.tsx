'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LabSlide } from '@/lib/carousel-lab/types';
import { createLabProject, deleteLabProject } from '@/app/carousel-lab/actions';
import LabSlideCanvas from './LabSlideCanvas';

export type LabListItem = { id: string; name: string; cover: LabSlide | null; updatedAt: string };

export default function LabProjectsList({ items }: { items: LabListItem[] }) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-neutral-800">Каруселі</h1>
          <p className="text-[12.5px] text-neutral-400">Lab · Modern Elegant (v2, ізольований рушій)</p>
        </div>
        <form action={createLabProject}>
          <button
            type="submit"
            data-testid="create-project"
            className="rounded-full bg-[#4a6cf7] px-4 py-2 text-[14px] font-semibold text-white"
          >
            + Нова
          </button>
        </form>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 py-16 text-center text-[14px] text-neutral-400">
          Каруселей ще немає — створи першу.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((p) => (
            <li key={p.id} className="group relative">
              <button
                type="button"
                onClick={() => router.push(`/carousel-lab/${p.id}`)}
                data-testid={`open-${p.id}`}
                className="block w-full overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition hover:border-[#4a6cf7]"
              >
                <div className="flex items-center justify-center bg-[#BCC7AB]">
                  {p.cover ? (
                    <LabSlideCanvas slide={p.cover} renderWidth={220} />
                  ) : (
                    <div style={{ width: 220, height: 275 }} />
                  )}
                </div>
                <div className="truncate px-2.5 py-2 text-[13px] font-medium text-neutral-700">{p.name}</div>
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteLabProject(p.id);
                    setList((prev) => prev.filter((x) => x.id !== p.id));
                  })
                }
                className="absolute right-1.5 top-1.5 hidden rounded-md bg-black/50 px-2 py-1 text-[11px] text-white group-hover:block"
              >
                Видалити
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
