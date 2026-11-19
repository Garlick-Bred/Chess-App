import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, localDay, type Me } from './api';
import { setSoundEnabled } from './sound';
import Header from './components/Header';
import GarlickBulb from './components/GarlickBulb';
import AuthPage from './pages/Auth';
import HomePage from './pages/Home';
import DrillsPage from './pages/Drills';
import PlayPage from './pages/Play';
import StatsPage from './pages/Stats';
import AchievementsPage from './pages/Achievements';
import LeaderboardPage from './pages/Leaderboard';
import SettingsPage from './pages/Settings';

interface AppCtx {
  me: Me;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => useContext(Ctx)!;

export interface Route {
  page: string;
  arg?: string;
  query: URLSearchParams;
}

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [page, arg] = path.split('/');
  return { page: page || 'home', arg, query: new URLSearchParams(qs ?? '') };
}

export function go(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
}

const RECENT_ACCOUNTS = 'ge_accounts';
export function rememberAccount(me: Me) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_ACCOUNTS) ?? '[]') as { username: string; displayName: string; avatar: string }[];
    const next = [{ username: me.user.username, displayName: me.user.displayName, avatar: me.user.avatar }, ...list.filter((a) => a.username !== me.user.username)].slice(0, 8);
    localStorage.setItem(RECENT_ACCOUNTS, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
}
export function recentAccounts(): { username: string; displayName: string; avatar: string }[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_ACCOUNTS) ?? '[]');
  } catch {
    return [];
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'loading' | 'in' | 'out'>('loading');

  useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0); // new page starts at the top (matters on phones)
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const m = await api.get<Me>(`/api/me?day=${localDay()}`);
      setMe(m);
      setSoundEnabled(m.user.settings.sound);
      rememberAccount(m);
      setState('in');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState('out');
      else setState((s) => (s === 'loading' ? 'out' : s));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    setMe(null);
    setState('out');
    go('/');
  }, []);

  if (state === 'loading')
    return (
      <div className="splash">
        <GarlickBulb filled={5} size={80} celebrate={false} />
      </div>
    );
  if (state === 'out' || !me) return <AuthPage onDone={refresh} />;

  let page;
  switch (route.page) {
    case 'drills':
      page = <DrillsPage open={route.arg} />;
      break;
    case 'play':
      page = <PlayPage drillId={route.arg ?? 'random'} levelParam={route.query.get('level')} />;
      break;
    case 'stats':
      page = <StatsPage />;
      break;
    case 'badges':
      page = <AchievementsPage />;
      break;
    case 'family':
      page = <LeaderboardPage />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    default:
      page = <HomePage />;
  }

  return (
    <Ctx.Provider value={{ me, refresh, logout }}>
      <div className={`app page-${route.page}`}>
        <Header route={route} />
        <main>{page}</main>
      </div>
    </Ctx.Provider>
  );
}
