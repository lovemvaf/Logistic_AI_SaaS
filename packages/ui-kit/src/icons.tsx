import type { SVGProps } from 'react';

/** Shared 24px line icons used by the common sidebar. */
function Icon({ children, className = 'h-5 w-5', ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export const NavIcons = {
  dashboard: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  ),
  orders: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="m3 8.5 9 5.5 9-5.5" />
      <path d="M12 21v-7" />
    </Icon>
  ),
  inventory: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M4 7h16v13H4z" />
      <path d="M4 7l2-4h12l2 4" />
      <path d="M9 12h6" />
    </Icon>
  ),
  warehouse: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M7 21v-6h10v6" />
      <path d="M7 11h10" />
    </Icon>
  ),
  logistics: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </Icon>
  ),
  wms: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16.5 9 5 9-5" />
    </Icon>
  ),
  ai: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </Icon>
  ),
  finance: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M3 7h18v12H3z" />
      <path d="M3 7l3-4h12l3 4" />
      <path d="M16 13h2" />
    </Icon>
  ),
  settings: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4h-.2a1.7 1.7 0 0 0-1.6 1Z" />
    </Icon>
  ),
  pack: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M4 7h16v13H4z" />
      <path d="M8 7V4h8v3" />
      <path d="M4 12h16" />
    </Icon>
  ),
  logs: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="0.8" />
      <circle cx="3.5" cy="12" r="0.8" />
      <circle cx="3.5" cy="18" r="0.8" />
    </Icon>
  ),
  tenants: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5a3 3 0 0 1 0 6" />
      <path d="M18 20a6 6 0 0 0-3-5.2" />
    </Icon>
  ),
  billing: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </Icon>
  ),
  audit: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  ),
  returns: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  ),
  globe: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </Icon>
  ),
  receipt: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </Icon>
  ),
  house: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v11h14V10" />
    </Icon>
  ),
  menu: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  ),
  close: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  ),
  chevronLeft: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  ),
  chevronRight: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  ),
  bell: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3A6 6 0 0 0 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </Icon>
  ),
  logout: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  ),
  barcode: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <path d="M4 5v14M7 5v14M10 5v14M13 5v14M17 5v14M20 5v14" />
    </Icon>
  ),
  search: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </Icon>
  ),
  check: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </Icon>
  ),
  alert: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </Icon>
  ),
  clock: (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  ),
};
