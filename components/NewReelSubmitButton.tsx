'use client';

import { useFormStatus } from 'react-dom';

interface NewReelSubmitButtonProps {
  idleLabel: string;
  pendingLabel: string;
}

export default function NewReelSubmitButton({
  idleLabel,
  pendingLabel,
}: NewReelSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-primary cursor-pointer rounded-xl bg-[color:var(--accent)] px-4 py-2 font-medium text-white transition-[background,transform] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
