export const APP_ID = "com.endurancelabs.relaydesktop";
export const AUTH_SCHEME = "com.endurancelabs.relaydesktop";
export const INVITE_SCHEME = "relay";

export const authChannels = {
  getUser: "better-auth:getUser",
  requestAuth: "better-auth:requestAuth",
  signOut: "better-auth:signOut",
  authenticated: "better-auth:authenticated",
  authError: "better-auth:error",
} as const;

export const relayChannels = {
  api: "relay:api",
  signInEmail: "relay:sign-in-email",
  signUpEmail: "relay:sign-up-email",
  realtimeOpen: "relay:realtime-open",
  realtimeClose: "relay:realtime-close",
  realtimeSend: "relay:realtime-send",
  realtimeEvent: "relay:realtime-event",
  realtimeOpenEvent: "relay:realtime-open-event",
  setBadge: "relay:set-badge",
  setActiveChannel: "relay:set-active-channel",
  navigate: "relay:navigate",
  invite: "relay:invite",
  pendingInvites: "relay:pending-invites",
  prepareMedia: "relay:prepare-media",
  showEmojiPanel: "relay:show-emoji-panel",
  listAccounts: "relay:accounts-list",
  switchAccount: "relay:accounts-switch",
  startAddAccount: "relay:accounts-add-start",
  cancelAddAccount: "relay:accounts-add-cancel",
  requestAuth: "relay:request-auth",
  completeAuth: "relay:accounts-complete",
  removeAccount: "relay:accounts-remove",
  accountsChanged: "relay:accounts-changed",
  getUpdateState: "relay:update-state-get",
  checkForUpdates: "relay:update-check",
  downloadUpdate: "relay:update-download",
  installUpdate: "relay:update-install",
  updateState: "relay:update-state",
} as const;

export type FormPart =
  | { field: string; name: string; type: string; data: Uint8Array }
  | { field: string; text: string };

export type ApiRequest = {
  path: string;
  method?: string;
  body?: string;
  form?: FormPart[];
  headers?: Record<string, string>;
  accountId?: string;
};

export type ApiResponse = {
  status: number;
  body: string;
};

export type AuthResult = {
  error: { message: string } | null;
};

export type MediaAccess = {
  microphone: boolean;
  camera: boolean;
};

export type UpdateState = {
  status:
    | "idle"
    | "checking"
    | "up-to-date"
    | "available"
    | "downloading"
    | "downloaded"
    | "error"
    | "disabled";
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
};

export type DesktopAccount = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  activeWorkspaceId: string | null;
  unreadTotal: number;
  mentionTotal: number;
};

export type AccountsSnapshot = {
  accounts: DesktopAccount[];
  activeAccountId: string | null;
  adding: boolean;
};

export type AuthMode = {
  add?: boolean;
};

export type RealtimeEnvelope = {
  accountId: string;
  event: unknown;
};

export type NavigatePayload = {
  accountId: string;
  workspaceId?: string;
  channelId: string;
};

export interface RelayDesktop {
  api(request: ApiRequest): Promise<ApiResponse>;
  signInEmail(email: string, password: string, options?: AuthMode): Promise<AuthResult>;
  signUpEmail(name: string, email: string, password: string, options?: AuthMode): Promise<AuthResult>;
  requestAuth(options?: { provider?: string; add?: boolean }): Promise<void>;
  signOut(accountId?: string): Promise<void>;
  getUser(): Promise<{ id: string; email?: string; name?: string } | null>;
  listAccounts(): Promise<AccountsSnapshot>;
  switchAccount(accountId: string): Promise<void>;
  startAddAccount(): Promise<void>;
  cancelAddAccount(): Promise<void>;
  completeAuth(): Promise<AuthResult & { duplicate?: boolean }>;
  removeAccount(accountId: string): Promise<void>;
  onAccountsChanged(callback: (snapshot: AccountsSnapshot) => void): () => void;
  onAuthenticated(callback: () => void): () => void;
  onAuthError(callback: (message: string) => void): () => void;
  connectRealtime(
    onEvent: (envelope: RealtimeEnvelope) => void,
    onOpen: (accountId?: string) => void,
  ): () => void;
  sendRealtime(event: unknown): Promise<void>;
  setBadge(count: number): Promise<void>;
  setActiveChannel(channelId: string | null): Promise<void>;
  onNavigate(callback: (payload: NavigatePayload) => void): () => void;
  onInvite(callback: (token: string) => void): () => void;
  pendingInvites(): Promise<string[]>;
  prepareMedia(): Promise<MediaAccess>;
  showEmojiPanel(): Promise<void>;
  getUpdateState(): Promise<UpdateState>;
  checkForUpdates(): Promise<UpdateState>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdateState(callback: (state: UpdateState) => void): () => void;
}
