import { BatteryCharging } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 flex h-16 items-center border-b bg-card px-4 md:px-6 z-10">
      <nav className="flex items-center gap-5 text-lg font-medium">
        <a
          href="/"
          className="flex items-center gap-2 text-lg font-semibold md:text-base"
        >
          <BatteryCharging className="h-6 w-6 text-primary" />
          <span className="font-headline text-primary-foreground">ChargeTrack</span>
        </a>
      </nav>
    </header>
  );
}
