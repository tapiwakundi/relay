export type RootStackParamList = {
  Tabs: undefined;
  Channel: { channelId: string };
  Huddle: { channelId: string };
  Thread: { channelId: string; parentId: string };
  Profile: { userId: string };
  WorkspaceSettings: undefined;
  Invites: undefined;
  NewChannel: undefined;
  NewDm: undefined;
  Search: undefined;
  ChannelDetails: { channelId: string };
  Later: undefined;
  Files: undefined;
  Threads: undefined;
  EditProfile: undefined;
  You: undefined;
  AddWorkspace: undefined;
};

export type TabParamList = {
  Home: undefined;
  DMs: undefined;
  Activity: undefined;
};
