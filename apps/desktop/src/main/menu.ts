import { Menu, app, type MenuItemConstructorOptions } from "electron";
import { applicationMenuTemplate, CHECK_FOR_UPDATES_ID, type MenuTemplateItem } from "./menu-template";

function mapItem(item: MenuTemplateItem, onCheckForUpdates: () => void): MenuItemConstructorOptions {
  if (item.id === CHECK_FOR_UPDATES_ID) {
    return {
      id: item.id,
      label: item.label,
      click: onCheckForUpdates,
    };
  }
  return {
    id: item.id,
    label: item.label,
    role: item.role as MenuItemConstructorOptions["role"],
    type: item.type,
    submenu: item.submenu?.map((child) => mapItem(child, onCheckForUpdates)),
  };
}

export function installApplicationMenu(onCheckForUpdates: () => void) {
  if (app.name === "Electron") app.setName("Relay");
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(applicationMenuTemplate(process.platform, app.name).map((item) => mapItem(item, onCheckForUpdates))),
  );
}
