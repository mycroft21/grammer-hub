import Link from "next/link";

const items = [["/", "에디터"], ["/profiles", "프로필"], ["/style", "내 어투"], ["/dictionary", "사전"], ["/runs", "기록"]] as const;

export function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-3 py-1.5 text-[13px] whitespace-nowrap">
        <Link href="/" className="mr-3 flex items-center gap-1.5 font-semibold">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-[11px] font-bold text-white">교</span>Grammar Hub
        </Link>
        {items.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-md px-2.5 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">{label}</Link>
        ))}
      </nav>
    </header>
  );
}
