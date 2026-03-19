import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Megaphone, Users, Mail, LogOut } from 'lucide-react';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/emails', label: 'Emails', icon: Mail },
] as const;

export default function Layout() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem('huntly_api_key');
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="h-8 w-8 rounded-lg bg-cyan-500 flex items-center justify-center text-gray-950 font-bold text-sm">
            H
          </div>
          <span className="text-lg font-semibold tracking-tight">Huntly</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-800 p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
