import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const s = (p: P) => ({
  width: p.size ?? 18,
  height: p.size ?? 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const HomeIcon = (p: P) => (
  <svg {...s(p)}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
  </svg>
);
export const DmIcon = (p: P) => (
  <svg {...s(p)}>
    <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" />
  </svg>
);
export const BellIcon = (p: P) => (
  <svg {...s(p)}>
    <path d="M6 9a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
    <path d="M10 21h4" />
  </svg>
);
export const FileIcon = (p: P) => (
  <svg {...s(p)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);
export const LaterIcon = (p: P) => (
  <svg {...s(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
export const MoreIcon = (p: P) => (
  <svg {...s(p)}>
    <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);
export const Chevron = (p: P) => (
  <svg {...s({ size: 14, ...p })}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const ChevronDown = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...s(p)}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4-4" />
  </svg>
);
export const Pencil = (p: P) => (
  <svg {...s(p)}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m15 5 4 4" />
  </svg>
);
export const Hash = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />
  </svg>
);
export const Lock = (p: P) => (
  <svg {...s({ size: 14, ...p })}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const Headphones = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="M4 13a8 8 0 0 1 16 0" />
    <rect x="3" y="13" width="5" height="7" rx="1.5" />
    <rect x="16" y="13" width="5" height="7" rx="1.5" />
  </svg>
);
export const Phone = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="M4 13a8 8 0 0 1 16 0" />
    <rect x="3" y="13" width="5" height="7" rx="1.5" />
    <rect x="16" y="13" width="5" height="7" rx="1.5" />
  </svg>
);
export const Users = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 19a6 6 0 0 1 12 0" />
    <circle cx="17" cy="9" r="2.2" />
    <path d="M17 19a4.5 4.5 0 0 0-2-3.6" />
  </svg>
);
export const Info = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);
export const Back = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="M15 6 9 12l6 6" />
  </svg>
);
export const Forward = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
export const Help = (p: P) => (
  <svg {...s({ size: 18, ...p })}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 4.3 1.7C13 11.5 12 12 12 13.5" />
    <path d="M12 17h.01" />
  </svg>
);
export const Plus = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Emoji = (p: P) => (
  <svg {...s({ size: 18, ...p })}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <path d="M9 10h.01M15 10h.01" />
  </svg>
);
export const Mention = (p: P) => (
  <svg {...s({ size: 18, ...p })}>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3 6.7" />
  </svg>
);
export const Send = (p: P) => (
  <svg {...s({ size: 16, ...p })} fill="currentColor" stroke="none">
    <path d="M3 11.5 21 3l-6.5 18-3.2-6.3L3 11.5z" />
  </svg>
);
export const Mic = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4" />
  </svg>
);
export const MicOff = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M4 4l16 16" />
  </svg>
);
export const Video = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <rect x="3" y="7" width="12" height="10" rx="2" />
    <path d="m15 10 6-3v10l-6-3z" />
  </svg>
);
export const Screen = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
export const Leave = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3" />
    <path d="M10 12h11M17 8l4 4-4 4" />
  </svg>
);
export const Close = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const ThreadIcon = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="M5 6h10M5 12h7M5 18h5" />
    <path d="M16 14v7l3-3" />
  </svg>
);
export const Bookmark = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <path d="M7 4h10v16l-5-3-5 3z" />
  </svg>
);
export const Share = (p: P) => (
  <svg {...s({ size: 16, ...p })}>
    <circle cx="6" cy="12" r="2.2" />
    <circle cx="17" cy="6" r="2.2" />
    <circle cx="17" cy="18" r="2.2" />
    <path d="m8 11 7-4M8 13l7 4" />
  </svg>
);
export const Star = (p: P) => (
  <svg {...s({ size: 14, ...p })}>
    <path d="m12 3 2.4 6.8H22l-5.6 4.2 2.2 6.8L12 17.4 7.4 20.8l2.2-6.8L4 9.8h7.6z" />
  </svg>
);
export const Bold = (p: P) => (
  <svg {...s({ size: 14, ...p })}>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
);
export const Italic = (p: P) => (
  <svg {...s({ size: 14, ...p })}>
    <path d="M12 5h6M6 19h6M14.5 5 9.5 19" />
 </svg>
);
export const Strike = (p: P) => (
  <svg {...s({ size: 14, ...p })}>
    <path d="M6 12h12M8 7h8a3 3 0 0 1 0 6M8 17h7a3 3 0 0 0 0-6" />
  </svg>
);
export const Link = (p: P) => (
  <svg {...s({ size: 14, ...p })}>
    <path d="M10 13a5 5 0 0 0 7.5.5l1.5-1.5a5 5 0 0 0-7-7L11 6" />
    <path d="M14 11a5 5 0 0 0-7.5-.5L5 12a5 5 0 0 0 7 7l1-1" />
  </svg>
);
export const List = (p: P) => (
  <svg {...s({ size: 14, ...p })}>
    <path d="M9 7h11M9 12h11M9 17h11M5 7h.01M5 12h.01M5 17h.01" />
  </svg>
);
export const Code = (p: P) => (
  <svg {...s({ size: 14, ...p })}>
    <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
  </svg>
);
export const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.1 7.3l6.2 5.2C38.3 37.3 44 32 44 24c0-1.3-.1-2.5-.4-3.5z" />
  </svg>
);
