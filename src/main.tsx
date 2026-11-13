import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './index.css';
import { store, useCan } from './store';
import { Layout } from './components/Layout';
import { AuthCallback, SignIn, Verify } from './pages/SignIn';
import { Home } from './pages/Home';
import { Food } from './pages/Food';
import { Express } from './pages/Express';
import { Staff } from './pages/Staff';
import { Activity } from './pages/Activity';
import { Users } from './pages/Users';
import { PageHeader } from './components/ui';

/** A page the person's access does not cover shows this instead of an empty screen. */
function Gate({ need, children }: { need: [string, string]; children: React.ReactNode }) {
  const can = useCan();
  return can(...need) ? children : <NotHere text="Your access does not cover this page." />;
}

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
            <Route path="food" element={<Gate need={['support', 'food']}><Food /></Gate>} />
            <Route path="express" element={<Gate need={['support', 'express']}><Express /></Gate>} />
            <Route path="users" element={<Gate need={['read_pii', 'platform']}><Users /></Gate>} />
            <Route path="staff" element={<Gate need={['staff_admin', 'platform']}><Staff /></Gate>} />
            <Route path="activity" element={<Gate need={['staff_admin', 'platform']}><Activity /></Gate>} />
            <Route path="*" element={<NotHere text="There is no page at this address." />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
