import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useWorkspace } from "../lib/workspace";
import { ChatView } from "../ui/ChatView";
import { HeaderBtn } from "../ui/Header";
import { PageHeader, ScreenCanvas } from "../ui/SlackChrome";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Thread">;

export function ThreadScreen({ navigation, route }: Props) {
  const { channelById } = useWorkspace();
  const channel = channelById(route.params.channelId);
  if (!channel) return null;
  return (
    <ScreenCanvas>
      <PageHeader
        title="Thread"
        subtitle={channel.isDm ? channel.dmName ?? channel.name : `#${channel.name}`}
        left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />}
      />
      <ChatView
        channel={channel}
        parentId={route.params.parentId}
        onOpenThread={() => undefined}
        onOpenProfile={(userId) => navigation.navigate("Profile", { userId })}
      />
    </ScreenCanvas>
  );
}
