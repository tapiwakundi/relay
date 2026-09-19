import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWorkspace } from "../lib/workspace";
import { ChatView } from "../ui/ChatView";
import { Glass } from "../ui/Glass";
import { HeaderBtn, ScreenHeader } from "../ui/Header";
import { radii } from "../ui/theme";
import type { RootStackParamList } from "../nav/types";

type Props = NativeStackScreenProps<RootStackParamList, "Thread">;

export function ThreadScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { channelById } = useWorkspace();
  const channel = channelById(route.params.channelId);
  if (!channel) return null;
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <Glass style={{ marginHorizontal: 12, marginBottom: 8, borderRadius: radii.lg }}>
        <ScreenHeader
          title="Thread"
          subtitle={channel.isDm ? channel.dmName ?? channel.name : `#${channel.name}`}
          left={<HeaderBtn label="‹" onPress={() => navigation.goBack()} />}
        />
      </Glass>
      <ChatView
        channel={channel}
        parentId={route.params.parentId}
        onOpenThread={() => undefined}
        onOpenProfile={(userId) => navigation.navigate("Profile", { userId })}
      />
    </View>
  );
}
