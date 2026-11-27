import type { SVGProps } from "react";

// One set, drawn on a 20px grid with a 1.5px round stroke.
const paths = {
  discover: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <path d="m12.9 7.1-1.6 4.2-4.2 1.6 1.6-4.2z" />
    </>
  ),
  explore: (
    <>
      <path d="M10 2.75 16.25 6.25v7.5L10 17.25l-6.25-3.5v-7.5z" />
      <path d="M3.75 6.25 10 9.75l6.25-3.5M10 9.75v7.5" />
    </>
  ),
  participate: (
    <>
      <rect x="3.75" y="9.25" width="12.5" height="7" rx="1.5" />
      <path d="M6.75 9.25v-4.5a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1v4.5M8.5 6.6l1.1 1.1 1.9-2.1" />
    </>
  ),
  swap: <path d="M4 6.75h12m-3-3 3 3-3 3M16 13.25H4m3-3-3 3 3 3" />,
  build: <path d="m6.75 5.75-3.5 4.25 3.5 4.25m6.5-8.5 3.5 4.25-3.5 4.25M11.25 4l-2.5 12" />,
  wallet: (
    <>
      <path d="M3.75 6.75h12.5v8a1.5 1.5 0 0 1-1.5 1.5h-9.5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M3.75 6.75V5.5A1.75 1.75 0 0 1 5.5 3.75h7.25v3" />
      <circle cx="13" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  api: (
    <>
      <rect x="2.75" y="4" width="14.5" height="12" rx="2" />
      <path d="m6 8.25 2.25 1.9L6 12m4.25.25h3.5" />
    </>
  ),
  copy: (
    <>
      <rect x="7" y="7" width="9.25" height="9.25" rx="1.75" />
      <path d="M13 7V5.5a1.75 1.75 0 0 0-1.75-1.75H5.5A1.75 1.75 0 0 0 3.75 5.5v5.75A1.75 1.75 0 0 0 5.5 13H7" />
    </>
  ),
  check: <path d="m4.5 10.5 3.5 3.5 7.5-8" />,
  close: <path d="m5 5 10 10M5 15 15 5" />,
  menu: <path d="M3.5 5.75h13M3.5 10h13M3.5 14.25h13" />,
  search: (
    <>
      <circle cx="9" cy="9" r="5.25" />
      <path d="m13 13 3.5 3.5" />
    </>
  ),
  github: (
    <path
      fill="currentColor"
      stroke="none"
      d="M10 1.75a8.25 8.25 0 0 0-2.6 16.08c.41.07.56-.18.56-.4v-1.4c-2.3.5-2.78-1.1-2.78-1.1-.38-.96-.92-1.21-.92-1.21-.75-.51.06-.5.06-.5.83.06 1.27.85 1.27.85.73 1.26 1.93.9 2.4.69.07-.54.29-.9.52-1.1-1.83-.21-3.76-.92-3.76-4.08 0-.9.32-1.64.85-2.22-.09-.2-.37-1.04.08-2.18 0 0 .7-.22 2.27.85a7.9 7.9 0 0 1 4.14 0c1.57-1.07 2.27-.85 2.27-.85.45 1.14.17 1.98.08 2.18.53.58.85 1.32.85 2.22 0 3.17-1.93 3.86-3.77 4.07.3.26.56.76.56 1.53v2.27c0 .22.15.48.57.4A8.25 8.25 0 0 0 10 1.75z"
    />
  ),
  send: <path d="M5.5 14.5 14.5 5.5M7.5 5.5h7v7" />,
  grid: (
    <path d="M3.75 3.75h5v5h-5zM11.25 3.75h5v5h-5zM3.75 11.25h5v5h-5zM11.25 11.25h5v5h-5z" />
  ),
  file: (
    <>
      <path d="M5.75 2.75h5.5l3 3v11.5h-8.5z" />
      <path d="M11.25 2.75v3h3M8 11.25l1.5 1.5 2.75-3" />
    </>
  ),
  token: (
    <>
      <circle cx="10" cy="10" r="7.25" />
      <circle cx="10" cy="10" r="3.25" />
    </>
  ),
  user: (
    <>
      <circle cx="10" cy="7" r="3.25" />
      <path d="M3.75 16.5a6.25 6.25 0 0 1 12.5 0" />
    </>
  ),
  treasury: (
    <path d="M3.25 7.75 10 3.5l6.75 4.25zM5.25 10.25v4M10 10.25v4M14.75 10.25v4M3.75 16.5h12.5" />
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  ...props
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
