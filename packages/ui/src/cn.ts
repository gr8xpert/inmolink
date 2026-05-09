import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class-name composer used by every shadcn-style component. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
