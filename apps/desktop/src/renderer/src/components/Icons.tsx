import type { IconBaseProps, IconType } from "react-icons";
import { FcGoogle } from "react-icons/fc";
import {
  LuAtSign,
  LuBell,
  LuBold,
  LuBookmark,
  LuCaseSensitive,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuCircleHelp,
  LuClock,
  LuCode,
  LuEllipsis,
  LuFile,
  LuHash,
  LuHeadphones,
  LuHouse,
  LuInfo,
  LuItalic,
  LuLink,
  LuList,
  LuLock,
  LuLogOut,
  LuMessageSquare,
  LuMessageSquareReply,
  LuMic,
  LuMicOff,
  LuMonitor,
  LuPencil,
  LuPhone,
  LuPlus,
  LuSearch,
  LuSend,
  LuSettings,
  LuShare2,
  LuSmile,
  LuStar,
  LuStrikethrough,
  LuUserPlus,
  LuUsers,
  LuVideo,
  LuX,
} from "react-icons/lu";

function withDefaults(Icon: IconType, defaultSize: number) {
  return function RelayIcon({
    size = defaultSize,
    strokeWidth = 1.8,
    ...props
  }: IconBaseProps) {
    return <Icon {...props} size={size} strokeWidth={strokeWidth} />;
  };
}

export const HomeIcon = withDefaults(LuHouse, 18);
export const DmIcon = withDefaults(LuMessageSquare, 18);
export const BellIcon = withDefaults(LuBell, 18);
export const FileIcon = withDefaults(LuFile, 18);
export const LaterIcon = withDefaults(LuClock, 18);
export const MoreIcon = withDefaults(LuEllipsis, 18);
export const Chevron = withDefaults(LuChevronDown, 14);
export const ChevronDown = withDefaults(LuChevronDown, 16);
export const SearchIcon = withDefaults(LuSearch, 18);
export const Settings = withDefaults(LuSettings, 18);
export const Pencil = withDefaults(LuPencil, 18);
export const Hash = withDefaults(LuHash, 16);
export const Lock = withDefaults(LuLock, 14);
export const Headphones = withDefaults(LuHeadphones, 16);
export const Phone = withDefaults(LuPhone, 16);
export const Users = withDefaults(LuUsers, 16);
export const UserPlus = withDefaults(LuUserPlus, 18);
export const Info = withDefaults(LuInfo, 16);
export const Back = withDefaults(LuChevronLeft, 16);
export const Forward = withDefaults(LuChevronRight, 16);
export const Help = withDefaults(LuCircleHelp, 18);
export const Plus = withDefaults(LuPlus, 16);
export const Emoji = withDefaults(LuSmile, 18);
export const Mention = withDefaults(LuAtSign, 18);
export const Send = withDefaults(LuSend, 16);
export const Mic = withDefaults(LuMic, 16);
export const MicOff = withDefaults(LuMicOff, 16);
export const Video = withDefaults(LuVideo, 16);
export const Screen = withDefaults(LuMonitor, 16);
export const Leave = withDefaults(LuLogOut, 16);
export const Close = withDefaults(LuX, 16);
export const ThreadIcon = withDefaults(LuMessageSquareReply, 16);
export const Bookmark = withDefaults(LuBookmark, 16);
export const Share = withDefaults(LuShare2, 16);
export const Star = withDefaults(LuStar, 14);
export const Bold = withDefaults(LuBold, 14);
export const FormatText = withDefaults(LuCaseSensitive, 18);
export const Italic = withDefaults(LuItalic, 14);
export const Strike = withDefaults(LuStrikethrough, 14);
export const Link = withDefaults(LuLink, 14);
export const List = withDefaults(LuList, 14);
export const Code = withDefaults(LuCode, 14);
export const GoogleG = withDefaults(FcGoogle, 18);
