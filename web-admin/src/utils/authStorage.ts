const SUPABASE_KEY_PREFIX = 'sb-';
const SUPABASE_KEY_SUFFIX = '-auth-token';

/**
 * Clears any Supabase auth tokens stored in localStorage.
 * Returns the list of keys that were removed to aid debugging.
 */
export const clearSupabaseAuthStorage = (): string[] => {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  const clearedKeys: string[] = [];

  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (key.startsWith(SUPABASE_KEY_PREFIX) && key.endsWith(SUPABASE_KEY_SUFFIX)) {
      localStorage.removeItem(key);
      clearedKeys.push(key);
    }
  }

  return clearedKeys;
};

