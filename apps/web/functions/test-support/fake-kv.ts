/**
 * Minimal KVNamespace stand-in for lockout and rate-limit tests.
 * Implements only the operations the Pages Functions use: get / put / delete.
 */
export class FakeKV {
  readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string, _options?: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Read a stored JSON record directly (assertions / state surgery in tests). */
  read(key: string): Record<string, unknown> | null {
    const raw = this.store.get(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  }

  /** Write a JSON record directly (seeding expired locks/windows in tests). */
  write(key: string, value: unknown): void {
    this.store.set(key, JSON.stringify(value));
  }

  /** Cast to the KVNamespace type expected by Env bindings. */
  asNamespace(): KVNamespace {
    return this as unknown as KVNamespace;
  }
}