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
} as const;

export type FormPart =
  | { field: string; name: string; type: string; data: Uint8Array }
  | { field: string; text: string };

export type ApiRequest = {
  path: string;
  method?: string;
  body?: string;
  form?: FormPart[];
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

export interface RelayDesktop {
  api(request: ApiRequest): Promise<ApiResponse>;
  signInEmail(email: string, password: string): Promise<AuthResult>;
  signUpEmail(name: string, email: string, password: string): Promise<AuthResult>;
  requestAuth(options?: { provider?: string }): Promise<void>;
  signOut(): Promise<void>;
  getUser(): Promise<{ id: string; email?: string; name?: string } | null>;
  onAuthenticated(callback: () => void): () => void;
  onAuthError(callback: (message: string) => void): () => void;
  connectRealtime(onEvent: (event: unknown) => void, onOpen: () => void): () => void;
  sendRealtime(event: unknown): Promise<void>;
  setBadge(count: number): Promise<void>;
  setActiveChannel(channelId: string | null): Promise<void>;
  onNavigate(callback: (channelId: string) => void): () => void;
  onInvite(callback: (token: string) => void): () => void;
  pendingInvites(): Promise<string[]>;
  prepareMedia(): Promise<MediaAccess>;
}
