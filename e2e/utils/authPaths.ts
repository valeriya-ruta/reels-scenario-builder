import path from 'node:path';

/** Directory that holds Playwright storage-state files produced by auth.setup.ts. */
export const AUTH_DIR = path.join(__dirname, '..', '.auth');

/** Storage state for a seeded user WITH an active subscription. */
export const ACTIVE_STATE = path.join(AUTH_DIR, 'active.json');

/** Storage state for a seeded user with NO subscription record. */
export const NOSUB_STATE = path.join(AUTH_DIR, 'nosub.json');

export type SeededAccount = {
  name: 'active' | 'nosub';
  email: string | undefined;
  password: string | undefined;
  storageState: string;
};

/** Seeded test accounts, read from env. Credentials are never committed. */
export function seededAccounts(): SeededAccount[] {
  return [
    {
      name: 'active',
      email: process.env.E2E_ACTIVE_EMAIL,
      password: process.env.E2E_ACTIVE_PASSWORD,
      storageState: ACTIVE_STATE,
    },
    {
      name: 'nosub',
      email: process.env.E2E_NOSUB_EMAIL,
      password: process.env.E2E_NOSUB_PASSWORD,
      storageState: NOSUB_STATE,
    },
  ];
}

/** True when at least one seeded account has full credentials configured. */
export function hasAnyCreds(): boolean {
  return seededAccounts().some((a) => a.email && a.password);
}
