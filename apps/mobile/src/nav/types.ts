export type RootStackParamList = {
  Tabs: undefined;
  Channel: { channelId: string };
  Thread: { channelId: string; parentId: string };
  Profile: { userId: string };
  WorkspaceSettings: undefined;
  Invites: undefined;
  NewChannel: undefined;
  NewDm: undefined;
  Search: undefined;
  Later: undefined;
  Files: undefined;
  Threads: undefined;
  EditProfile: undefined;
};

export type TabParamList = {
  Home: undefined;
  DMs: undefined;
  Activity: undefined;
  You: undefined;
};
