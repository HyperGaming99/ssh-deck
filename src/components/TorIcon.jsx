import { cn } from '@/lib/utils';

export function TorIcon({ className = 'size-5' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={cn('shrink-0 select-none', className)}
    >
      <circle cx="12" cy="12" r="10" fill="#7d4698" />
      <path
        d="M12 5a7 7 0 0 0-7 7 7 7 0 0 0 7 7"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 7.5a4.5 4.5 0 0 0-4.5 4.5 4.5 4.5 0 0 0 4.5 4.5"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 10a2 2 0 0 0-2 2 2 2 0 0 0 2 2"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="0.9" fill="#ffffff" />
    </svg>
  );
}

export default TorIcon;
