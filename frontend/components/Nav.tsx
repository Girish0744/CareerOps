'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, LayoutGrid, Zap } from 'lucide-react';

const links = [
  { href: '/',             label: 'Job Discovery', icon: <Search className="w-3.5 h-3.5" /> },
  { href: '/applications', label: 'Applications',  icon: <LayoutGrid className="w-3.5 h-3.5" /> },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center shadow-sm group-hover:bg-slate-700 transition-colors">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900 text-sm tracking-tight">Career-Ops</span>
        </Link>

        {/* Links */}
        <nav className="flex items-center gap-1">
          {links.map(link => {
            const active = link.href === '/'
              ? pathname === '/'
              : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150
                  ${active
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
              >
                {link.icon}
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
