// Console users for local auth mode: an admin (you) plus per-client read-only viewers.
// Swapping to Supabase Auth later replaces verifyCredentials/ensureAdminUser — the session
// shape and role/clientId scoping stay identical.
import type { UserRecord, UserRole } from '../types.ts';
import type { Store } from '../store/store.ts';
import { hashPassword, verifyPassword } from './passwords.ts';

export interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
  clientId?: string;
  password: string;
}

/** The browser-safe user view — the hash never crosses the API boundary. */
export type UserView = Omit<UserRecord, 'passwordHash'>;

export function toUserView(u: UserRecord): UserView {
  const { passwordHash, ...view } = u;
  return view;
}

export function createUser(store: Store, input: CreateUserInput): UserRecord {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('a valid email is required');
  if (input.role === 'client' && !input.clientId) throw new Error('client users need a clientId');
  const state = store.getState();
  if (state.users.some((u) => u.email === email)) throw new Error(`a user with email ${email} already exists`);
  if (input.clientId && !state.clients.some((c) => c.id === input.clientId)) {
    throw new Error(`unknown client ${input.clientId}`);
  }
  const user: UserRecord = {
    id: store.nextId('usr'),
    email,
    name: input.name.trim() || email,
    role: input.role,
    clientId: input.role === 'client' ? input.clientId : undefined,
    passwordHash: hashPassword(input.password),
    createdAt: state.simDate,
  };
  store.update((s) => {
    s.users.push(user);
  });
  store.appendAudit({
    ts: state.simDate, actor: 'operator', kind: 'user_added',
    detail: `Console login created for ${email} (${input.role}${user.clientId ? `, scoped to ${user.clientId}` : ''})`,
  });
  return user;
}

export function verifyCredentials(store: Store, email: string, password: string): UserRecord | null {
  const user = store.getState().users.find((u) => u.email === email.trim().toLowerCase());
  if (!user) return null;
  return verifyPassword(password, user.passwordHash) ? user : null;
}

/** Migration/seed: guarantee an admin exists (used by createRuntime; env-overridable). */
export function ensureAdminUser(store: Store, opts: { email: string; password: string }): { created: boolean } {
  const state = store.getState();
  if (!state.users) {
    store.update((s) => {
      (s as { users: UserRecord[] }).users = [];
    });
  }
  if (store.getState().users.some((u) => u.role === 'admin')) return { created: false };
  createUser(store, { email: opts.email, name: 'RevPilot Admin', role: 'admin', password: opts.password });
  return { created: true };
}
