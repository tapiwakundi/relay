import { Alert, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Huddle } from "@relay/shared";
import { api } from "./auth";
import { applyWsEvent, getActiveWorkspaceId } from "./query";

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

const declined = new Set<string>();
let room: RoomLike | null = null;
let stopAudio: (() => Promise<void>) | null = null;
let micMuted = false;

export function declineHuddle(huddleId?: string) {
  if (huddleId) declined.add(huddleId);
}

export function huddleWasDeclined(huddleId: string) {
  return declined.has(huddleId);
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
  rememberHuddle(channelId, res.huddle);
  if (res.livekit?.url && res.livekit.token) await connectHuddleAudio(res.livekit);
  return res;
}

export async function leaveHuddleCall(channelId: string) {
  const res = await api<{ huddle: Huddle | null }>(`/api/channels/${channelId}/huddle/leave`, { method: "POST" });
  micMuted = false;
  rememberHuddle(channelId, res.huddle);
  await disconnectHuddleAudio();
}

export async function setHuddleMicMuted(channelId: string, muted: boolean) {
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
    const outputs = await lk.AudioSession.getAudioOutputs();
    const speaker = outputs.find((output) => output === "force_speaker" || output === "speaker");
    if (speaker) await lk.AudioSession.selectAudioOutput(speaker);
    if (room) await room.disconnect().catch(() => undefined);
    const next = new Room();
    next.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.setVolume(1);
    });
    await next.connect(creds.url, creds.token);
    await next.startAudio().catch(() => undefined);
    await next.localParticipant.setMicrophoneEnabled(!micMuted);
    room = next;
    return true;
  } catch (err) {
    console.warn("[huddle] microphone unavailable", err);
    return false;
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
