import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  authChannels,
  relayChannels,
  type ApiRequest,
  type ApiResponse,
  type AuthResult,
  type MediaAccess,
  type RelayDesktop,
  type UpdateState,
} from "../shared/ipc";

function subscribe<T>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}

const relayDesktop = {
  api: (request: ApiRequest) => ipcRenderer.invoke(relayChannels.api, request) as Promise<ApiResponse>,
  signInEmail: (email: string, password: string) =>
    ipcRenderer.invoke(relayChannels.signInEmail, email, password) as Promise<AuthResult>,
  signUpEmail: (name: string, email: string, password: string) =>
    ipcRenderer.invoke(relayChannels.signUpEmail, name, email, password) as Promise<AuthResult>,
  requestAuth: (options?: { provider?: string }) => ipcRenderer.invoke(authChannels.requestAuth, options) as Promise<void>,
  signOut: () => ipcRenderer.invoke(authChannels.signOut) as Promise<void>,
  getUser: () => ipcRenderer.invoke(authChannels.getUser) as Promise<{ id: string; email?: string; name?: string } | null>,
  onAuthenticated: (callback: () => void) => subscribe(authChannels.authenticated, () => callback()),
  onAuthError: (callback: (message: string) => void) =>
    subscribe(authChannels.authError, (error: { message?: string }) => callback(error?.message || "Sign-in failed")),
  connectRealtime: (onEvent: (event: unknown) => void, onOpen: () => void) => {
    const stopEvent = subscribe(relayChannels.realtimeEvent, onEvent);
    const stopOpen = subscribe(relayChannels.realtimeOpenEvent, () => onOpen());
    void ipcRenderer.invoke(relayChannels.realtimeOpen);
    return () => {
      stopEvent();
      stopOpen();
      void ipcRenderer.invoke(relayChannels.realtimeClose);
    };
  },
  sendRealtime: (event: unknown) => ipcRenderer.invoke(relayChannels.realtimeSend, event) as Promise<void>,
  setBadge: (count: number) => ipcRenderer.invoke(relayChannels.setBadge, count) as Promise<void>,
  setActiveChannel: (channelId: string | null) =>
    ipcRenderer.invoke(relayChannels.setActiveChannel, channelId) as Promise<void>,
  onNavigate: (callback: (channelId: string) => void) => subscribe(relayChannels.navigate, callback),
  onInvite: (callback: (token: string) => void) => subscribe(relayChannels.invite, callback),
  pendingInvites: () => ipcRenderer.invoke(relayChannels.pendingInvites) as Promise<string[]>,
  prepareMedia: () => ipcRenderer.invoke(relayChannels.prepareMedia) as Promise<MediaAccess>,
  showEmojiPanel: () => ipcRenderer.invoke(relayChannels.showEmojiPanel) as Promise<void>,
  getUpdateState: () => ipcRenderer.invoke(relayChannels.getUpdateState) as Promise<UpdateState>,
  checkForUpdates: () => ipcRenderer.invoke(relayChannels.checkForUpdates) as Promise<UpdateState>,
  downloadUpdate: () => ipcRenderer.invoke(relayChannels.downloadUpdate) as Promise<void>,
  installUpdate: () => ipcRenderer.invoke(relayChannels.installUpdate) as Promise<void>,
  onUpdateState: (callback: (state: UpdateState) => void) => subscribe(relayChannels.updateState, callback),
};

contextBridge.exposeInMainWorld("relayDesktop", relayDesktop satisfies RelayDesktop);
