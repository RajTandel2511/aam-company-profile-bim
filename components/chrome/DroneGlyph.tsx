/** A quadcopter seen from above: four rotors on an X frame. Decorative (the control carries the name). */
export function DroneGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className={className}>
      <path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" />
      <circle cx="6" cy="6" r="3.2" />
      <circle cx="18" cy="6" r="3.2" />
      <circle cx="6" cy="18" r="3.2" />
      <circle cx="18" cy="18" r="3.2" />
      <rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
