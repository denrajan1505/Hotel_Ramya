import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Hotel } from 'lucide-react';
import { NAV_ITEMS } from './navConfig';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ open, onNavigate }) {
  const { can } = useAuth();
  const items = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-gradient-to-b from-primary-700 via-primary-800 to-primary-950 text-white transition-transform duration-200 lg:static lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 text-primary-950 shadow">
          <Hotel size={22} />
        </div>
        <div>
          <p className="text-sm font-bold tracking-wide">Hotel Ramyas</p>
          <p className="text-[11px] uppercase tracking-widest text-primary-200">Credit Control</p>
        </div>
      </div>

      <nav className="app-scrollbar flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-white/15 text-white shadow-inner' : 'text-primary-100/80 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <Icon size={17} />
                <span className="truncate">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-5 py-4 text-[11px] text-primary-200/70">
        © {new Date().getFullYear()} Hotel Ramyas
      </div>
    </aside>
  );
}
