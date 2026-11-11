import { type ClassValue, clsx } from 'clsx';

/** Lightweight class merger for pack-station-web (clsx only — no tailwind-merge dep). */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
