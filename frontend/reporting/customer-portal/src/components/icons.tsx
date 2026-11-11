// Lightweight inline-SVG icon components for the customer portal.
// The pages previously referenced icon names (Search, Box, Upload, ...)
// that were never imported and had no backing dependency, which crashed
// the page on render with `ReferenceError: X is not defined`. These
// components remove that dependency on an external icon library.
import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

export const Search: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1110.5 3a7.5 7.5 0 010 14.65z"
    />
  </svg>
);

export const Box: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 10l-7-4-7 4v6a2 2 0 001 1.7l7 4a2 2 0 002.6 0l7-4a2 2 0 001-1.7V10z"
    />
  </svg>
);

export const Upload: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5m-5-5v10"
    />
  </svg>
);

export const Plus: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4v16m8-8H4"
    />
  </svg>
);

export const FileText: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6M9 4h6a2 2 0 012 2v4H5V6a2 2 0 012-2h2z"
    />
  </svg>
);

export const RotateCcw: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h5M4 4l5 5M4 4l5-5m11 11v-5h-5m0 0v5m0 0l-5-5m5 5l5-5"
    />
  </svg>
);

export const ArrowLeft: React.FC<IconProps> = (props) => (
  <svg
    {...props}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 19l-7-7 7-7"
    />
  </svg>
);

export const Mail: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 01-2 2H7a2 2 0 01-2-2z" />
  </svg>
);

export const Bell: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17v2a3 3 0 11-6 0V9a3 3 0 116 0v8zm0 0h.01M9 9a3 3 0 116 0" />
  </svg>
);

export const KeyRound: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15.5A3.5 3.5 0 118.5 12a3.5 3.5 0 013.5 3.5zM12 15.5V8a3.5 3.5 0 10-3.5 3.5h3.5z" />
  </svg>
);

export const Lock: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17a2 2 0 100-4 2 2 0 000 4zm6-7h-1V5a5 5 0 00-10 0v5H6a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2v-7a2 2 0 00-2-2zm-8-5a3 3 0 016 0v5H8V5z" />
  </svg>
);

export const Phone: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5.25C3 4.55 3.5 4 4.25 4h5.59l1.41 1.41A1 1 0 0011.83 5.5H15a1 1 0 011 1v5a1 1 0 01-1 1h-1.17a1 1 0 00-.74.34L9.05 15.66A1 1 0 018 16.25V18a1 1 0 01-1 1m-2 3.75V16a1 1 0 011-1h1.5m9.5-7.5h-1.5" />
  </svg>
);

export const User: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

export const Building2: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v10h14V10m-2 0v-2a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0h.01" />
  </svg>
);

export const Trash2: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M9 6V4a3 3 0 013-3h.5a.5.5 0 01.5.5V4m0 0v2m-.5 0H9m0 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
  </svg>
);

export const LayoutDashboard: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="2"></rect>
    <path d="M3 8h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <path d="M9 12h6v6H9z"></path>
  </svg>
);

export const Package: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2L4 5v6l8 3 8-3V5l-8-3z"></path>
    <path d="M4 11l8 3 8-3m-8 3v6"></path>
  </svg>
);

export const Inbox: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2"></rect>
    <path d="M8 10h8m-4 4h.01M9 10l1 4"></path>
    <path d="M21 13.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6.5"></path>
  </svg>
);

export const Globe: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M2 12h20M12 2a10 10 0 0 1 7.07 17.07M12 2a10 10 0 0 0-7.07 17.07"></path>
  </svg>
);

export const Receipt: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 2v20l4-2 4 2 4-2 4 2V2L4 2z"></path>
    <path d="M8 7h8m-2 4h-4"></path>
  </svg>
);

export const LogOut: React.FC<IconProps> = (props) => (
  <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"></path>
    <path d="M13 7l6 5-6 5"></path>
    <path d="M13 7v10"></path>
  </svg>
);
