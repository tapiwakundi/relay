import { Alert, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Huddle } from "@relay/shared";
import { api } from "./auth";
import { silenceHuddleRing, huddleRingSilenced } from "./huddle-ring";
import { applyWsEvent, getActiveWorkspaceId, queryClient, type Bootstrap } from "./query";

type LivekitCreds = { url: string | null; token: string | null };

type JoinResult = {
  huddle: Huddle | null;
  livekit: LivekitCreds;
  missed?: boolean;
};

type RemoteAudio = { kind: string; setVolume: (volume: number) => void };

type RoomLike = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  startAudio: () => Promise<void>;
  on: (event: string, listener: (track: RemoteAudio) => void) => void;
  localParticipant: { setMicrophoneEnabled: (enabled: boolean) => Promise<unknown> };
};

let room: RoomLike | null = null;
let stopAudio: (() => Promise<void>) | null = null;
let micMuted = false;

export function declineHuddle(huddleId?: string) {
  silenceHuddleRing(huddleId);
}

export function huddleWasDeclined(huddleId: string) {
  return huddleRingSilenced(huddleId);
}

function joinedHuddleId(channelId: string) {
  const matches = queryClient.getQueriesData<Bootstrap>({ queryKey: ["bootstrap"] });
  for (const [, boot] of matches) {
    const huddle = boot?.channels.find((channel) => channel.id === channelId)?.huddle;
    if (huddle?.id) return huddle.id;
  }
  return null;
}

async function dismissHuddleNotification(huddleId: string | null) {
  if (!huddleId) return;
  const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  await Promise.all(
    shown
      .filter((item) => (item.request.content.data as { huddleId?: string } | undefined)?.huddleId === huddleId)
      .map((item) => Notifications.dismissNotificationAsync(item.request.identifier).catch(() => undefined)),
  );
}

function rememberHuddle(channelId: string, huddle: Huddle | null) {
  applyWsEvent(
    { type: "huddle.updated", channelId, huddle, workspaceId: getActiveWorkspaceId() ?? undefined },
    "",
  );
}

export async function ensureCallNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("calls", {
      name: "Huddles",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 700, 400, 700],
      lightColor: "#1A5FB4",
      sound: "default",
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }
  await Notifications.setNotificationCategoryAsync("huddle", [
    {
      identifier: "accept",
      buttonTitle: "Accept",
      options: { opensAppToForeground: true },
    },
    {
      identifier: "decline",
      buttonTitle: "Decline",
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ]);
}

export async function joinHuddleCall(channelId: string, opts?: { create?: boolean }) {
  const res = await api<JoinResult>(`/api/channels/${channelId}/huddle/join`, {
    method: "POST",
    body: JSON.stringify({ create: opts?.create !== false }),
  });
  silenceHuddleRing(res.huddle?.id);
  rememberHuddle(channelId, res.huddle);
  void dismissHuddleNotification(res.huddle?.id ?? null);
  if (res.livekit?.url && res.livekit.token) {
    const audio = await connectHuddleAudio(res.livekit);
    if (audio === "denied") {
      tellMicrophoneBlocked();
      micMuted = true;
      await api<{ huddle: Huddle | null }>(`/api/channels/${channelId}/huddle/mute`, {
        method: "POST",
        body: JSON.stringify({ muted: true }),
      })
        .then((muted) => rememberHuddle(channelId, muted.huddle))
        .catch(() => undefined);
    }
  }
  return res;
}

export async function leaveHuddleCall(channelId: string) {
  const leavingId = joinedHuddleId(channelId);
  silenceHuddleRing(leavingId);
  const res = await api<{ huddle: Huddle | null }>(`/api/channels/${channelId}/huddle/leave`, { method: "POST" });
  silenceHuddleRing(res.huddle?.id ?? leavingId);
  micMuted = false;
  rememberHuddle(channelId, res.huddle);
  await dismissHuddleNotification(leavingId);
  await disconnectHuddleAudio();
}

export class MicrophoneBlockedError extends Error {
  constructor() {
    super("Microphone access is off.");
    this.name = "MicrophoneBlockedError";
  }
}

export function isMicrophoneBlocked(err: unknown) {
  return err instanceof MicrophoneBlockedError;
}

function tellMicrophoneBlocked() {
  Alert.alert("Microphone is off", "Relay needs the microphone so you can talk in huddles.", [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => void Linking.openSettings() },
  ]);
}

async function requestMicrophone() {
  const { permissions } = (await import("@livekit/react-native-webrtc")) as {
    permissions: { request: (desc: { name: string }) => Promise<boolean> };
  };
  const granted = await permissions.request({ name: "microphone" });
  return granted === true || (granted as unknown) === 1;
}

export async function setHuddleMicMuted(channelId: string, muted: boolean) {
  if (!muted) {
    const granted = await requestMicrophone().catch(() => false);
    if (!granted) {
      tellMicrophoneBlocked();
      throw new MicrophoneBlockedError();
    }
  }
  const previous = micMuted;
  micMuted = muted;
  await room?.localParticipant.setMicrophoneEnabled(!muted).catch(() => undefined);
  try {
    const res = await api<{ huddle: Huddle | null }>(`/api/channels/${channelId}/huddle/mute`, {
      method: "POST",
      body: JSON.stringify({ muted }),
    });
    rememberHuddle(channelId, res.huddle);
  } catch (err) {
    micMuted = previous;
    await room?.localParticipant.setMicrophoneEnabled(!previous).catch(() => undefined);
    throw err;
  }
}

export async function answerHuddle(channelId: string) {
  try {
    const res = await joinHuddleCall(channelId, { create: false });
    if (res.missed || !res.huddle) {
      Alert.alert("Call ended", "That huddle is no longer live.");
    }
    return res;
  } catch (err) {
    Alert.alert("Couldn't join the huddle", err instanceof Error ? err.message : "Try again.");
    return null;
  }
}

async function connectHuddleAudio(creds: LivekitCreds) {
  if (!creds.url || !creds.token) return false;
  try {
    const lk = (await import("@livekit/react-native")) as {
      AndroidAudioTypePresets: { communication: object };
      AudioSession: {
        configureAudio: (config: {
          ios?: { defaultOutput?: "speaker" | "earpiece" };
          android?: { audioTypeOptions: object };
        }) => Promise<void>;
        startAudioSession: () => Promise<void>;
        stopAudioSession: () => Promise<void>;
        setDefaultRemoteAudioTrackVolume: (volume: number) => Promise<void>;
        getAudioOutputs: () => Promise<string[]>;
        selectAudioOutput: (deviceId: string) => Promise<void>;
      };
    };
    const { Room, RoomEvent, Track } = (await import("livekit-client")) as {
      Room: new () => RoomLike;
      RoomEvent: { TrackSubscribed: string };
      Track: { Kind: { Audio: string } };
    };
    await lk.AudioSession.configureAudio({
      ios: { defaultOutput: "speaker" },
      android: { audioTypeOptions: lk.AndroidAudioTypePresets.communication },
    });
    await lk.AudioSession.startAudioSession();
    await lk.AudioSession.setDefaultRemoteAudioTrackVolume(1);
    stopAudio = () => lk.AudioSession.stopAudioSession();
    const micGranted = await requestMicrophone().catch(() => false);
    if (!micGranted) micMuted = true;
    const outputs = await lk.AudioSession.getAudioOutputs();
    if (room) await room.disconnect().catch(() => undefined);
    const next = new Room();
    next.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.setVolume(1);
    });
    await next.connect(creds.url, creds.token);
    await next.startAudio().catch(() => undefined);
    if (micGranted && !micMuted) await next.localParticipant.setMicrophoneEnabled(true);
    const speaker = outputs.find((output) => output === "force_speaker" || output === "speaker");
    if (speaker) await lk.AudioSession.selectAudioOutput(speaker).catch(() => undefined);
    room = next;
    return micGranted ? "ok" : "denied";
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[huddle] microphone unavailable", err);
    Alert.alert("Couldn't start huddle audio", detail);
    return "failed";
  }
}

async function disconnectHuddleAudio() {
  const current = room;
  room = null;
  if (current) await current.disconnect().catch(() => undefined);
  const stop = stopAudio;
  stopAudio = null;
  if (stop) await stop().catch(() => undefined);
}
