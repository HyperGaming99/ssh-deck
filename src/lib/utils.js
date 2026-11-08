import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs) => twMerge(clsx(inputs));

export const matches = (q, ...vals) => vals.join(' ').toLowerCase().includes((q || '').toLowerCase());

export const isMobile = () => !!window.api?.mobile;
