import type { SVGProps } from "react";

const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  leads: "M4 3h16v18H4z M8 17h8 M9 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M7 15c0-4 10-4 10 0",
  logout: "M9 4H4v16h5 M13 8l4 4-4 4 M8 12h13",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M5 5l14 14 M19 5L5 19",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  back: "M20 12H4 M10 6l-6 6 6 6",
  search: "M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M15 15l6 6",
  mail: "M3 5h18v14H3z M3 5l9 7 9-7",
  phone: "M5 3l4 1 1 5-3 2c2 3 3 4 6 6l2-3 5 1 1 4c-7 5-20-8-16-16z",
  user: "M8 6a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M4 21v-3c0-7 16-7 16 0v3",
  lock: "M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  shield: "M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6",
  clock: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M12 6v6l4 2",
  bolt: "M13 2L4 14h7l-1 8 10-13h-7z",
  check: "M4 12l5 5L20 6",
  chevron: "M6 9l6 6 6-6",
  copy: "M8 8h12v13H8z M16 8V3H3v13h5",
  trash: "M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  note: "M4 3h16v15H9l-5 4z M8 8h8 M12 5v6",
  globe: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20 M2 12h20 M12 2c-6 5-6 15 0 20 M12 2c6 5 6 15 0 20",
  building: "M5 21V3h14v18 M3 21h18 M9 7h1 M14 7h1 M9 11h1 M14 11h1 M10 21v-6h4v6",
  file: "M5 2h9l5 5v15H5z M14 2v6h5 M9 12h6 M9 16h6",
  code: "M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16",
  cloud: "M6 18h12a4 4 0 0 0 0-8a6 6 0 0 0-12-1a4.5 4.5 0 0 0 0 9",
} as const;
export default function AdminIcon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
