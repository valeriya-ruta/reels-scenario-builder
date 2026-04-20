import type { SlideTextAlign } from '@/lib/carouselTypes';

function AlignLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -960 960 960"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M80-80v-800h80v800H80Zm160-200v-120h400v120H240Zm0-280v-120h640v120H240Z" />
    </svg>
  );
}

function AlignCenterIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -960 960 960"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M440-80v-200H240v-120h200v-160H120v-120h320v-200h80v200h320v120H520v160h200v120H520v200h-80Z" />
    </svg>
  );
}

function AlignRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -960 960 960"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M800-80v-800h80v800h-80ZM320-280v-120h400v120H320ZM80-560v-120h640v120H80Z" />
    </svg>
  );
}

export default function TextAlignToggle({
  value,
  onChange,
}: {
  value: SlideTextAlign;
  onChange: (v: SlideTextAlign) => void;
}) {
  const opts: {
    id: SlideTextAlign;
    label: string;
    Icon: typeof AlignLeftIcon;
  }[] = [
    { id: 'left', label: 'Зліва', Icon: AlignLeftIcon },
    { id: 'center', label: 'По центру', Icon: AlignCenterIcon },
    { id: 'right', label: 'Справа', Icon: AlignRightIcon },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.label}
          aria-label={o.label}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={[
            'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition',
            value === o.id
              ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              : 'border-[color:var(--border)] bg-white text-zinc-600 hover:bg-[color:var(--surface)]',
          ].join(' ')}
        >
          <o.Icon className="h-5 w-5" />
        </button>
      ))}
    </div>
  );
}
