import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import * as Notifications from "expo-notifications";
import type { PushNotificationData } from "@relay/shared";
import { useAccounts } from "../lib/account-manager";
import { answerHuddle, declineHuddle, ensureCallNotifications, huddleWasDeclined } from "../lib/huddle-call";
import { silenceHuddleRing } from "../lib/huddle-ring";
import { claimNotification, openHuddleScreen, pushFields, setPendingNav } from "../lib/pending-nav";
import { addRealtimeListener } from "../lib/realtime-hub";
import { useWorkspace } from "../lib/workspace";
import { colors } from "./theme";

type Incoming = {
  huddleId: string;
  channelId: string;
  accountId: string;
  workspaceId: string;
  callerName: string;
};

export function IncomingHuddle() {
  const { activeAccountId, switchAccount } = useAccounts();
  const { me, workspace, selectWorkspace } = useWorkspace();
  const [incoming, setIncoming] = useState<Incoming | null>(null);

  useEffect(() => {
    void ensureCallNotifications().catch((err) => console.warn("[huddle] call notifications", err));
  }, []);

  useEffect(() => {
    if (!incoming) return;
    Vibration.vibrate([0, 600, 400, 600], true);
    return () => Vibration.cancel();
  }, [incoming]);

  useEffect(() => {
    return addRealtimeListener((ev, accountId) => {
      if (accountId !== activeAccountId || ev.type !== "huddle.updated") return;
      if (!ev.huddle?.active) {
        setIncoming((cur) => (cur?.channelId === ev.channelId ? null : cur));
        return;
      }
      if (ev.huddle.participants.some((p) => p.userId === me.id)) {
        silenceHuddleRing(ev.huddle.id);
        setIncoming((cur) => (cur?.huddleId === ev.huddle?.id ? null : cur));
        return;
      }
      if (huddleWasDeclined(ev.huddle.id)) {
        setIncoming((cur) => (cur?.huddleId === ev.huddle?.id ? null : cur));
        return;
      }
      const caller =
        ev.huddle.participants.find((p) => p.userId === ev.huddle?.startedBy) ?? ev.huddle.participants[0];
      if (!caller || caller.userId === me.id) return;
      const workspaceId = ev.workspaceId ?? workspace.id;
      setIncoming((cur) =>
        cur?.huddleId === ev.huddle?.id
          ? cur
          : {
              huddleId: ev.huddle!.id,
              channelId: ev.channelId,
              accountId,
              workspaceId,
              callerName: caller.name,
            },
      );
    });
  }, [activeAccountId, me.id, workspace.id]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Partial<PushNotificationData>;
      if (data.kind !== "huddle" || !data.huddleId || !data.channelId || !data.accountId || !data.workspaceId) return;
      if (data.accountId !== activeAccountId) return;
      if (huddleWasDeclined(data.huddleId)) return;
      setIncoming((cur) =>
        cur?.huddleId === data.huddleId
          ? cur
          : {
              huddleId: data.huddleId!,
              channelId: data.channelId!,
              accountId: data.accountId!,
              workspaceId: data.workspaceId!,
              callerName: data.callerName || "Someone",
            },
      );
    });
    return () => received.remove();
  }, [activeAccountId]);

  async function accept() {
    if (!incoming) return;
    const next = incoming;
    setIncoming(null);
    if (next.accountId !== activeAccountId || next.workspaceId !== workspace.id) {
      setPendingNav({
        kind: "huddle",
        accountId: next.accountId,
        workspaceId: next.workspaceId,
        channelId: next.channelId,
        huddleId: next.huddleId,
        callerName: next.callerName,
      });
      if (next.accountId !== activeAccountId) await switchAccount(next.accountId);
      else await selectWorkspace(next.workspaceId);
      return;
    }
    openHuddleScreen(next.channelId);
    void answerHuddle(next.channelId);
  }

  function decline() {
    if (incoming) declineHuddle(incoming.huddleId);
    setIncoming(null);
  }

  return (
    <Modal visible={Boolean(incoming)} animationType="fade" transparent statusBarTranslucent onRequestClose={decline}>
      <View style={styles.scrim}>
        <Text style={styles.kicker}>Incoming huddle</Text>
        <Text style={styles.name}>{incoming?.callerName}</Text>
        <Text style={styles.sub}>is calling</Text>
        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.decline]} onPress={decline} accessibilityRole="button" accessibilityLabel="Decline">
            <Text style={styles.btnTxt}>Decline</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.accept]} onPress={() => void accept()} accessibilityRole="button" accessibilityLabel="Accept">
            <Text style={styles.btnTxt}>Accept</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function handleHuddleNotificationResponse(response: Notifications.NotificationResponse) {
  if (!claimNotification(response.notification.request.identifier)) return null;
  const data = pushFields(response.notification.request.content.data);
  if (data.kind === "huddle" && response.actionIdentifier === "decline") {
    declineHuddle(data.huddleId);
    return "declined" as const;
  }
  return data.kind === "huddle" ? ("answer" as const) : ("open" as const);
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "#0B2E5A",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  kicker: { color: "rgba(255,255,255,0.72)", fontSize: 15, fontWeight: "700", letterSpacing: 0.4 },
  name: { color: "#fff", fontSize: 36, fontWeight: "800", marginTop: 16, textAlign: "center" },
  sub: { color: "rgba(255,255,255,0.8)", fontSize: 18, marginTop: 6 },
  actions: { flexDirection: "row", gap: 16, marginTop: 48 },
  btn: { minWidth: 128, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  decline: { backgroundColor: colors.pink },
  accept: { backgroundColor: colors.green },
  btnTxt: { color: "#fff", fontSize: 17, fontWeight: "800" },
});
