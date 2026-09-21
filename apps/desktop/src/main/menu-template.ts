export const CHECK_FOR_UPDATES_ID = "check-for-updates";

export type MenuTemplateItem = {
  id?: string;
  label?: string;
  role?: string;
  type?: "separator";
  submenu?: MenuTemplateItem[];
};

const checkForUpdatesItem: MenuTemplateItem = {
  id: CHECK_FOR_UPDATES_ID,
  label: "Check for Updates…",
};

export function applicationMenuTemplate(platform: NodeJS.Platform, appName: string): MenuTemplateItem[] {
  if (platform === "darwin") {
    return [
      {
        label: appName,
        submenu: [
          { role: "about" },
          { type: "separator" },
          checkForUpdatesItem,
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "fileMenu" },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
      { role: "help" },
    ];
  }

  return [
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [checkForUpdatesItem],
    },
  ];
}
