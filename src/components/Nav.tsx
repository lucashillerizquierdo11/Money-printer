import Link from "next/link";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/streak", label: "Streak Builder" },
  { href: "/boosts", label: "Boost Finder" },
  { href: "/overview", label: "Tournament Overview" },
  { href: "/groups", label: "Groups" },
  { href: "/sources", label: "Data Sources" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  return (
    <header className="border-b border-pitch-700 bg-pitch-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <span className="font-semibold tracking-tight text-white">
            World Cup Streak Value Finder
          </span>
          <span className="rounded bg-emerald-800/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-200">
            MVP
          </span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-3 py-1.5 text-zinc-300 hover:bg-pitch-700 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
