import type { Metadata } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Founder Control Room',
  description: "Juss Founder OS + Se'kret Bip + partner lane — one command surface."
};

export default function ControlRoomLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
