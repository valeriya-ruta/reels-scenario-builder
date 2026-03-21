/** Maps Supabase GoTrue English messages to Ukrainian for UI. */

const EXACT: Record<string, string> = {
  'Invalid login credentials': 'Невірний email або пароль',
  'Invalid email or password': 'Невірний email або пароль',
  'Email not confirmed': 'Підтверди email — перевір пошту',
  'User already registered': 'Користувач з цією поштою вже зареєстрований',
  'Signup not allowed': 'Реєстрацію вимкнено',
  'Signups not allowed for this instance': 'Реєстрацію вимкнено',
  'Email rate limit exceeded': 'Забагато спроб. Зачекай трохи й спробуй знову.',
  'For security purposes, you can only request this after 60 seconds':
    'З міркувань безпеки можна надіслати запит лише раз на 60 секунд.',
  'New password should be different from the old password':
    'Новий пароль має відрізнятися від старого.',
  'Session expired': 'Сесію завершено. Увійди знову.',
  'Invalid Refresh Token: Refresh Token Not Found': 'Сесію завершено. Увійди знову.',
  'Token has expired or is invalid': 'Посилання недійсне або застаріло.',
  'Email link is invalid or has expired': 'Посилання недійсне або застаріло.',
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message.trim();
  if (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message.trim();
  }
  return '';
}

export function localizeAuthError(err: unknown): string {
  const raw = getErrorMessage(err);
  if (!raw) {
    return 'Сталася помилка. Спробуй ще раз.';
  }

  if (EXACT[raw]) {
    return EXACT[raw];
  }

  const lower = raw.toLowerCase();
  for (const [en, uk] of Object.entries(EXACT)) {
    if (en.toLowerCase() === lower) {
      return uk;
    }
  }

  if (lower.includes('invalid login') || lower.includes('invalid credentials')) {
    return 'Невірний email або пароль';
  }
  if (lower.includes('email not confirmed')) {
    return 'Підтверди email — перевір пошту';
  }
  if (lower.includes('user already registered') || lower.includes('already registered')) {
    return 'Користувач з цією поштою вже зареєстрований';
  }
  if (lower.includes('password should be at least') || lower.includes('at least 6 characters')) {
    return 'Пароль має бути не коротше 6 символів';
  }
  if (lower.includes('invalid email') || lower.includes('invalid format')) {
    return 'Некоректна адреса пошти';
  }
  if (lower.includes('rate limit')) {
    return 'Забагато спроб. Зачекай трохи й спробуй знову.';
  }
  if (lower.includes('only request this after') && lower.includes('second')) {
    return 'З міркувань безпеки зачекай перед наступною спробою.';
  }
  if (lower.includes('same password') || lower.includes('different from the old')) {
    return 'Новий пароль має відрізнятися від старого.';
  }

  return 'Сталася помилка. Спробуй ще раз.';
}
