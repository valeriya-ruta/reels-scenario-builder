'use client';

export type RantInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
};

/** Той самий стиль поля ренту, що на головній (Rant to Reel). */
export default function RantInput({
  value,
  onChange,
  placeholder = 'Про що будемо розповідати сьогодні?',
  disabled,
  id,
  'aria-invalid': ariaInvalid,
}: RantInputProps) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      aria-invalid={ariaInvalid}
      className="min-h-[88px] w-full resize-y rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-left text-sm leading-normal text-black placeholder:text-zinc-400 focus:border-[color:var(--accent)] focus:shadow-[inset_0_0_0_2px_var(--accent)] focus:outline-none focus:ring-0 disabled:opacity-60 sm:min-h-[100px]"
    />
  );
}
