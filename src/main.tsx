import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './index.css';
import { registerServiceWorker } from './lib/device';
import { store, useAppSelector, useCan } from './store';
import type { Capability, Service } from './store/types';
import { Layout } from './components/Layout';
import { PageHeader } from './components/ui';
import { AuthCallback, SignIn, Verify } from './pages/SignIn';
import { Home, Search } from './pages/Home';
import { Vendors } from './pages/food/Vendors';
import { FoodOrders } from './pages/food/Orders';
import { FoodOrderDetail } from './pages/food/OrderDetail';
import { FoodDisputes } from './pages/food/Disputes';
import { Riders } from './pages/express/Riders';
import { BookingDetail, Bookings } from './pages/express/Bookings';
import { Withdrawals } from './pages/express/Withdrawals';
import { Providers } from './pages/express/Providers';
import { ShopOrderDetail, ShopOrders } from './pages/shopping/Orders';
import { ShopDisputes } from './pages/shopping/Disputes';
import { Products, Sellers } from './pages/shopping/Products';
import { People, PersonDetail } from './pages/People';
import { Payments, Reconciliation, Webhooks } from './pages/money/Money';
import { Settings } from './pages/Settings';
import { Staff } from './pages/Staff';
import { Activity } from './pages/Activity';
import { Approvals } from './pages/Approvals';

function NotHere({ text }: { text: string }) {
  return (
    <>
      <PageHeader title="Not available" description={text} />
      <Link to="/" className="text-sm text-info hover:underline">
        Go to Home
      </Link>
    </>
  );
}

/** A page the person's access does not cover shows this instead of an empty screen. */
function Gate({ need, children }: { need: [Capability, Service]; children: ReactNode }) {
  const can = useCan();
  return can(...need) ? children : <NotHere text="Your access does not cover this page. An owner can change it on the Staff page." />;
}

/** Approvals are for anyone who can move money, on any service. */
function MoneyGate({ children }: { children: ReactNode }) {
  const caps = useAppSelector((s) => s.session.access?.capabilities ?? []);
  return caps.includes('move_money') ? children : <NotHere text="Approvals are for staff who can send refunds and payouts." />;
}

const page = (path: string, need: [Capability, Service], element: ReactNode) => (
  <Route key={path} path={path} element={<Gate need={need}>{element}</Gate>} />
);

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/auth/google" element={<AuthCallback />} />
          <Route path="/verify" element={<Verify />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="approvals" element={<MoneyGate><Approvals /></MoneyGate>} />
            {page('food/orders', ['support', 'food'], <FoodOrders />)}
            {page('food/orders/:id', ['support', 'food'], <FoodOrderDetail />)}
            {page('food/disputes', ['support', 'food'], <FoodDisputes />)}
            {page('food/vendors', ['support', 'food'], <Vendors />)}
            {page('express/bookings', ['support', 'express'], <Bookings />)}
            {page('express/bookings/:id', ['support', 'express'], <BookingDetail />)}
            {page('express/withdrawals', ['support', 'express'], <Withdrawals />)}
            {page('express/riders', ['support', 'express'], <Riders />)}
            {page('express/providers', ['support', 'express'], <Providers />)}
            {page('shopping/orders', ['support', 'shopping'], <ShopOrders />)}
            {page('shopping/orders/:id', ['support', 'shopping'], <ShopOrderDetail />)}
            {page('shopping/disputes', ['support', 'shopping'], <ShopDisputes />)}
            {page('shopping/products', ['support', 'shopping'], <Products />)}
            {page('shopping/sellers', ['support', 'shopping'], <Sellers />)}
            {page('money/payments', ['support', 'platform'], <Payments />)}
            {page('money/notices', ['support', 'platform'], <Webhooks />)}
            {page('money/balance-check', ['move_money', 'platform'], <Reconciliation />)}
            {page('people', ['support', 'platform'], <People />)}
            {page('people/:id', ['support', 'platform'], <PersonDetail />)}
            {page('settings', ['support', 'platform'], <Settings />)}
            {page('staff', ['staff_admin', 'platform'], <Staff />)}
            {page('activity', ['staff_admin', 'platform'], <Activity />)}
            <Route path="*" element={<NotHere text="There is no page at this address." />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
