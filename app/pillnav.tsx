'use client';
import Link from 'next/link';

export default function PillNavBar() {
  return (
    <nav
      className="
        fixed bottom-4 left-1/2 -translate-x-1/2
        flex items-center gap-4 
        px-6 py-2
        rounded-full
        bg-black/30     /* semi-transparent black background */
        text-gray-200    /* softer text color */
        transition-colors
      "
      style={{
        boxShadow: '0 0px 10px rgb(220 220 220 / 30%)', // Add box shadow
      }}
    >
      <Link href="/" className="hover:text-white transition flex items-center gap-1">
        <span>🏠</span> Home
      </Link>
      <Link href="/map" className="hover:text-white transition flex items-center gap-1">
        <span>🗺️</span> Map
      </Link>
      <Link href="/boomerang" className="hover:text-white transition flex items-center gap-1">
        <span>🪃</span> Boomerang
      </Link>
    </nav>
  );
}
