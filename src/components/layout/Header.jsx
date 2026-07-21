import { useEffect, useRef, useState } from 'react';
import { Menu, Bell, Moon, Sun, ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { subscribeNotifications, markNotificationRead } from '../../services/notificationService';
import { formatDateTime } from '../../utils/formatters';
import { initials } from '../../utils/formatters';

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeNotifications(user.uid, setNotifications);
  }, [user?.uid]);

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-primary-950/80">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-white/10">
          <Menu size={20} />
        </button>
        <div className="hidden md:block">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{today}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          title="Toggle dark mode"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
            className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-100 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-primary-900">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Notifications</p>
              <div className="app-scrollbar max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-slate-400">No notifications</p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => markNotificationRead(n.id)}
                      className={`block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5 ${!n.read ? 'bg-primary-50/70 dark:bg-primary-500/10' : ''}`}
                    >
                      <p className="font-medium text-slate-700 dark:text-slate-200">{n.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative" ref={profileRef}>
          <button onClick={() => setProfileOpen((o) => !o)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-white/10">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-xs font-bold text-white">
              {initials(user?.displayName || user?.username)}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-700 dark:text-slate-200">{user?.displayName || user?.username}</p>
              <p className="text-[11px] leading-tight text-slate-400">{user?.role}</p>
            </div>
            <ChevronDown size={14} className="text-slate-400" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-100 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-primary-900">
              <div className="px-3 py-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{user?.displayName}</p>
                <p className="text-xs text-slate-400">{user?.email}</p>
              </div>
              <button
                onClick={() => navigate('/settings')}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
              >
                <UserIcon size={15} /> Profile & Settings
              </button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10"
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
