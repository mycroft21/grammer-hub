import Link from "next/link";

const items = [["/", "에디터"], ["/profiles", "프로필"], ["/style", "내 어투"], ["/dictionary", "사전"], ["/runs", "실행 기록"]] as const;

export function Nav() {
  return (
    <header className="border-b bg-white">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2 text-sm">
        <span className="font-semibold">Grammar Hub</span>
        {items.map(([href, label]) => <Link key={href} href={href} className="text-neutral-600 hover:text-neutral-900">{label}</Link>)}
      </nav>
    </header>
  );
}
