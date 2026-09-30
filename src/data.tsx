import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// One refresh signal for the whole page: any action bumps it and every panel refetches,
// so the driver's phone and the ops console stay in step. A slow poll covers other tabs.
const RefreshCtx = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => {} });

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setVersion((v) => v + 1);
    }, 5000);
    return () => clearInterval(t);
  }, []);
  return <RefreshCtx.Provider value={{ version, bump }}>{children}</RefreshCtx.Provider>;
}

export function useRefresh() {
  return useContext(RefreshCtx);
}

export interface DataState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
}

export function useData<T>(fetcher: () => Promise<T>, deps: readonly unknown[]): DataState<T> {
  const { version } = useRefresh();
  const [state, setState] = useState<DataState<T>>({ data: undefined, error: undefined, loading: true });
  useEffect(() => {
    let alive = true;
    fetcher().then(
      (data) => alive && setState({ data, error: undefined, loading: false }),
      (error: Error) => alive && setState((s) => ({ data: s.data, error, loading: false })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return state;
}

// Runs an action, reports failure, and refreshes everything either way.
export function useAction() {
  const { bump } = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setBusy(false);
        bump();
      }
    },
    [bump],
  );
  return { run, busy, error, clearError: () => setError(null) };
}

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private window, blocked site data): the page still works
  }
}
