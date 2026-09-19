let signedOut: (() => void) | null = null;

export function onSignedOut(cb: () => void) {
  signedOut = cb;
  return () => {
    if (signedOut === cb) signedOut = null;
  };
}

export function notifySignedOut() {
  signedOut?.();
}
