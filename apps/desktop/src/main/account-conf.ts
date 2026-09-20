import Conf from "conf";
import { app } from "electron";
import { createAccountVault, VAULT_KEY, type AccountVault } from "./account-store";

let vault: AccountVault | null = null;

export function getAccountVault() {
  if (vault) return vault;
  const conf = new Conf({
    cwd: app.getPath("userData"),
    projectName: app.getName(),
    projectVersion: app.getVersion(),
  });
  vault = createAccountVault({
    read: () => (conf.get(VAULT_KEY) as never) ?? null,
    write: (state) => {
      conf.set(VAULT_KEY, state);
    },
    readLegacy: (key) => conf.get(key),
    writeLegacy: (key, value) => {
      conf.set(key, value);
    },
    deleteLegacy: (key) => {
      conf.delete(key);
    },
  });
  return vault;
}

export function vaultStorage() {
  const next = getAccountVault();
  return {
    getItem: (name: string) => next.getBlob(name),
    setItem: (name: string, value: unknown) => next.setBlob(name, value),
  };
}
