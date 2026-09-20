let expired: ((accountId: string | null) => void) | null = null;

export function onAccountExpired(cb: (accountId: string | null) => void) {
  expired = cb;
  return () => {
    if (expired === cb) expired = null;
  };
}

export function notifyAccountExpired(accountId: string | null) {
  expired?.(accountId);
}

export function onSignedOut(cb: () => void) {
  return onAccountExpired(() => cb());
}

export function notifySignedOut() {
  notifyAccountExpired(null);
}
