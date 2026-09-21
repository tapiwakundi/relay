let expired: ((accountId: string | null) => void) | null = null;
const suppressed = new Set<string>();

export function onAccountExpired(cb: (accountId: string | null) => void) {
  expired = cb;
  return () => {
    if (expired === cb) expired = null;
  };
}

export function suppressAccountExpiry(accountId: string) {
  suppressed.add(accountId);
  return () => {
    suppressed.delete(accountId);
  };
}

export function notifyAccountExpired(accountId: string | null) {
  if (accountId && suppressed.has(accountId)) return;
  expired?.(accountId);
}

export function onSignedOut(cb: () => void) {
  return onAccountExpired(() => cb());
}

export function notifySignedOut() {
  notifyAccountExpired(null);
}
