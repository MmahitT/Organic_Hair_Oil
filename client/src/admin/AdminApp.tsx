import { Boxes, ClipboardList, Gift, Globe, LayoutDashboard, LeafyGreen, LogOut, Mail, MessageSquareText, Package, ReceiptText, Users, UsersRound, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import logo from '@/assets/logo-mark.png';
import { cn } from '@/lib/cn';
import { adminFetch, useAdminAuth } from './auth';
import { Btn } from './ui';
import CouponsPage from './pages/CouponsPage';
import { CustomerDetailPage, CustomersPage } from './pages/CustomersPage';
import DashboardPage from './pages/DashboardPage';
import IngredientsPage from './pages/IngredientsPage';
import InventoryPage from './pages/InventoryPage';
import LoginPage from './pages/LoginPage';
import MessagesPage from './pages/MessagesPage';
import OrderDetailPage from './pages/OrderDetailPage';
import OrdersPage from './pages/OrdersPage';
import PaymentsPage from './pages/PaymentsPage';
import ProductEditorPage from './pages/ProductEditorPage';
import ProductsPage from './pages/ProductsPage';
import ReviewsPage from './pages/ReviewsPage';
import { AuditPage, StaffPage } from './pages/TeamPages';
import WebsitePage from './pages/WebsitePage';

function Guard() {
  const { status, restore, account } = useAdminAuth();
  const loc = useLocation();
  useEffect(() => { if (status === 'unknown') void restore(); }, [status, restore]);
  if (status === 'unknown') return <p role="status" className="p-8 text-center text-charcoal-soft">Loading…</p>;
  if (status === 'anon') return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />;
  return <Shell role={account!.role} name={account!.name} />;
}

type Att = { newOrders: number; cancelRequests: number; returnRequests: number; manualPayments: number; pendingReviews: number; newMessages: number };
interface Item { to: string; label: string; Icon: LucideIcon; who: 'all' | 'manage' | 'super' }
/** Who sees what. The server enforces the same rules; hiding a link is only for convenience. */
const ITEMS: Item[] = [
  { to: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard, who: 'manage' },
  { to: '/admin/orders', label: 'Orders', Icon: ReceiptText, who: 'all' },
  { to: '/admin/payments', label: 'Payments', Icon: Wallet, who: 'manage' },
  { to: '/admin/customers', label: 'Customers', Icon: Users, who: 'manage' },
  { to: '/admin/products', label: 'Products', Icon: Package, who: 'manage' },
  { to: '/admin/inventory', label: 'Inventory', Icon: Boxes, who: 'all' },
  { to: '/admin/reviews', label: 'Reviews', Icon: MessageSquareText, who: 'all' },
  { to: '/admin/messages', label: 'Messages', Icon: Mail, who: 'manage' },
  { to: '/admin/coupons', label: 'Coupons', Icon: Gift, who: 'manage' },
  { to: '/admin/ingredients', label: 'Ingredients', Icon: LeafyGreen, who: 'manage' },
  { to: '/admin/website', label: 'Website', Icon: Globe, who: 'manage' },
  { to: '/admin/team', label: 'Team', Icon: UsersRound, who: 'super' },
  { to: '/admin/activity', label: 'Activity log', Icon: ClipboardList, who: 'super' },
];

function Shell({ role, name }: { role: string; name: string }) {
  const logout = useAdminAuth((s) => s.logout);
  const canManage = role === 'admin' || role === 'superadmin';
  // Small red numbers in the menu: how much is waiting for the owner. Refreshed every minute and on each page change.
  const loc = useLocation();
  const [att, setAtt] = useState<Att | null>(null);
  useEffect(() => {
    let live = true;
    const pull = () => adminFetch<Att>('/admin/orders/summary').then((r) => { if (live) setAtt(r.data); }).catch(() => undefined);
    void pull();
    const id = window.setInterval(() => void pull(), 60_000);
    return () => { live = false; window.clearInterval(id); };
  }, [loc.pathname]);
  const badge: Record<string, number> = {
    '/admin/orders': att ? att.newOrders + att.cancelRequests + att.returnRequests : 0,
    '/admin/payments': att?.manualPayments ?? 0, '/admin/reviews': att?.pendingReviews ?? 0, '/admin/messages': att?.newMessages ?? 0,
  };
  const nav = ITEMS.filter((i) => i.who === 'all' || (i.who === 'manage' && canManage) || (i.who === 'super' && role === 'superadmin'));
  return (
    <div className="min-h-screen bg-cream-dark/60 lg:flex">
      <aside className="bg-forest text-cream lg:min-h-screen lg:w-60 lg:shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:block lg:py-5">
          <a href="/" className="flex items-center gap-2"><img src={logo} alt="" className="h-8 w-auto brightness-0 invert" /><span className="font-heading text-lg font-bold">Admin</span></a>
          <p className="hidden pt-3 text-xs text-sage-light lg:block">{name} · {role}</p>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:block lg:space-y-1 lg:pb-0">
          {nav.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cn('flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium', isActive ? 'bg-forest-600 text-white' : 'text-sage-light hover:bg-forest-600')}>
              <Icon aria-hidden className="h-4 w-4" />{label}{(badge[to] ?? 0) > 0 && <span aria-label={`${badge[to]} waiting`} className="ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-xs font-bold text-white">{badge[to]}</span>}
            </NavLink>
          ))}
          <button type="button" onClick={() => void logout()} className="flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-sage-light hover:bg-forest-600 lg:mt-6 lg:w-full"><LogOut aria-hidden className="h-4 w-4" />Sign out</button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><Outlet /></main>
    </div>
  );
}

// Owners and admins start on the dashboard; staff start on orders (what they work with).
function Home() {
  const role = useAdminAuth((s) => s.account?.role);
  return <Navigate to={role === 'staff' ? '/admin/orders' : '/admin/dashboard'} replace />;
}
function RoleOnly({ allow, children }: { allow: 'manage' | 'super'; children: React.ReactNode }) {
  const role = useAdminAuth((s) => s.account?.role);
  const ok = allow === 'super' ? role === 'superadmin' : role === 'admin' || role === 'superadmin';
  return ok ? <>{children}</> : <Navigate to={role === 'staff' ? '/admin/orders' : '/admin/dashboard'} replace />;
}

/** Pages for owners/admins only (staff are sent back to Orders). Defined once, outside AdminApp, so routes keep their state. */
const M = ({ children }: { children: React.ReactNode }) => <RoleOnly allow="manage">{children}</RoleOnly>;

export default function AdminApp() {
  return (
    <>
      <Helmet><title>Admin — Beauty Organic Hair Oil</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route element={<Guard />}>
          <Route index element={<Home />} />
          <Route path="dashboard" element={<M><DashboardPage /></M>} />
          <Route path="products" element={<M><ProductsPage /></M>} />
          <Route path="products/new" element={<M><ProductEditorPage /></M>} />
          <Route path="products/:id" element={<M><ProductEditorPage /></M>} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="payments" element={<M><PaymentsPage /></M>} />
          <Route path="customers" element={<M><CustomersPage /></M>} />
          <Route path="customers/:phone" element={<M><CustomerDetailPage /></M>} />
          <Route path="messages" element={<M><MessagesPage /></M>} />
          <Route path="coupons" element={<M><CouponsPage /></M>} />
          <Route path="website" element={<M><WebsitePage /></M>} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="ingredients" element={<M><IngredientsPage /></M>} />
          <Route path="team" element={<RoleOnly allow="super"><StaffPage /></RoleOnly>} />
          <Route path="activity" element={<RoleOnly allow="super"><AuditPage /></RoleOnly>} />
          <Route path="*" element={<div className="p-8"><Btn onClick={() => history.back()}>Page not found — go back</Btn></div>} />
        </Route>
      </Routes>
    </>
  );
}
