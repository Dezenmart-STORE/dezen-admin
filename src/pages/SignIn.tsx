import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { API_URL, USE_SAMPLE_DATA } from '../lib/config';
import { errorMessage, statusOf } from '../lib/errors';
import { PREVIEW_KEY, PREVIEW_ROLES } from '../mocks/backend';
import { useAppDispatch, useAppSelector } from '../store';
import { googleSignedIn, signedOut, staffSignedIn } from '../store/session';
import { useConfirmAuthenticatorMutation, useSetupAuthenticatorMutation, useStartSessionMutation } from '../store/api';
import { Mark, Orbit } from '../components/brand';
import { Button, CodeInput, ErrorNote, Field, InfoNote, Select } from '../components/ui';

/** The doorway: the mark arrives into the centre, one clear action below it. */
function Shell({ children, arrive }: { children: ReactNode; arrive?: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-[24rem]">
        <div className="mb-10 flex flex-col items-center gap-6 text-center">
          <Mark size={88} arrive={arrive} />
          <p className="font-display text-[13px] tracking-[0.22em]">
            Dezen<span className="text-ink-3"> admin</span>
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

/** Step 1: Google, through the backend (the same sign-in as the other Dezen apps). */
export function SignIn() {
  const { staffToken, googleToken } = useAppSelector((s) => s.session);
  const [preview, setPreview] = useState(() => {
    try {
      return sessionStorage.getItem(PREVIEW_KEY) ?? 'owner';
    } catch {
      return 'owner';
    }
  });
  if (staffToken) return <Navigate to="/" replace />;
  if (googleToken) return <Navigate to="/verify" replace />;
  // With sample data there is no Google step: go straight to the code step.
  const href = USE_SAMPLE_DATA ? '/auth/google?token=sample' : `${API_URL}/auth/google?origin=${encodeURIComponent(window.location.origin)}`;
  const choose = (v: string) => {
    setPreview(v);
    try {
      sessionStorage.setItem(PREVIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <Shell arrive>
      <h1 className="text-center text-[22px] font-semibold">Welcome back</h1>
      <p className="mx-auto mt-2 max-w-[30ch] text-center text-[14.5px] text-ink-2">
        Sign in with the Google account your access was given to, then enter the code from your authenticator.
      </p>
      <div className="mt-8 space-y-4">
        {USE_SAMPLE_DATA && (
          <Field label="Preview as">
            <Select value={preview} onChange={(e) => choose(e.target.value)}>
              {Object.entries(PREVIEW_ROLES).map(([k, r]) => (
                <option key={k} value={k}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <a
          href={href}
          className="flex h-12 w-full items-center justify-center rounded-leaf-sm bg-primary text-[15px] font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          {USE_SAMPLE_DATA ? 'Continue' : 'Continue with Google'}
        </a>
      </div>
    </Shell>
  );
}

/** The backend sends Google sign-ins back to /auth/google?token=… */
export function AuthCallback() {
  const [params] = useSearchParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = params.get('token');
  const failure = params.get('message') || (params.get('error') ? 'Google sign-in did not complete.' : null);

  useEffect(() => {
    if (token) {
      dispatch(googleSignedIn(token));
      navigate('/verify', { replace: true });
    }
  }, [token, dispatch, navigate]);

  if (token)
    return (
      <Shell>
        <div className="flex justify-center">
          <Orbit />
        </div>
      </Shell>
    );
  return (
    <Shell>
      <ErrorNote>{failure ?? 'Google sign-in did not complete.'}</ErrorNote>
      <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => navigate('/sign-in', { replace: true })}>
        Try again
      </Button>
    </Shell>
  );
}

/**
 * Step 2: the authenticator. First time: scan the QR code and enter the first code.
 * Every time after: enter the current code to get an 8-hour staff session.
 */
export function Verify() {
  const { googleToken, staffToken } = useAppSelector((s) => s.session);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'code' | 'setup' | 'next-code'>('code');
  const [error, setError] = useState('');
  const [startSession, session] = useStartSessionMutation();
  const [setup, setupState] = useSetupAuthenticatorMutation();
  const [confirm, confirmState] = useConfirmAuthenticatorMutation();

  if (staffToken) return <Navigate to="/" replace />;
  if (!googleToken) return <Navigate to="/sign-in" replace />;

  const begin = async () => {
    const res = await setup();
    if ('error' in res) setError(errorMessage(res.error));
    else {
      setError('');
      setStage('setup');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setError('');
    if (stage === 'setup') {
      const res = await confirm({ code });
      setCode('');
      if ('error' in res) return setError(errorMessage(res.error));
      // A code works once; the next one starts the session.
      setStage('next-code');
      return;
    }
    const res = await startSession({ code });
    setCode('');
    if ('error' in res) {
      if (statusOf(res.error) === 409 && /set up/i.test(errorMessage(res.error))) return begin();
      return setError(errorMessage(res.error));
    }
    dispatch(staffSignedIn({ token: res.data.token, access: { email: res.data.email, capabilities: res.data.capabilities, services: res.data.services } }));
    navigate('/', { replace: true });
  };

  const setupData = stage === 'setup' ? setupState.data : undefined;

  return (
    <Shell>
      {setupData ? (
        <>
          <h1 className="text-center text-[22px] font-semibold">Set up your authenticator</h1>
          <p className="mx-auto mt-2 max-w-[32ch] text-center text-[14.5px] text-ink-2">
            Scan this with Google Authenticator, 1Password or a similar app, then enter the code it shows.
          </p>
          <div className="mx-auto mt-6 w-fit rounded-leaf bg-white p-4">
            <QRCodeSVG value={setupData.otpauthUrl} size={168} />
          </div>
          <p className="mt-3 break-all text-center font-mono text-[11.5px] text-ink-3">{setupData.secret}</p>
        </>
      ) : (
        <>
          <h1 className="text-center text-[22px] font-semibold">Enter your code</h1>
          {stage === 'next-code' ? (
            <div className="mt-4">
              <InfoNote>Your authenticator is set up. Wait for the next code in the app, then enter it to sign in.</InfoNote>
            </div>
          ) : (
            <p className="mx-auto mt-2 max-w-[30ch] text-center text-[14.5px] text-ink-2">The 6-digit code for Dezen Admin in your authenticator app.</p>
          )}
        </>
      )}
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label htmlFor="code" className="sr-only">
          Code
        </label>
        <CodeInput id="code" value={code} onChange={setCode} autoFocus />
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={code.length !== 6} busy={session.isLoading || confirmState.isLoading || setupState.isLoading}>
          {stage === 'setup' ? 'Turn on authenticator' : 'Sign in'}
        </Button>
        <button type="button" onClick={() => dispatch(signedOut())} className="block w-full cursor-pointer py-2 text-center text-[13px] text-ink-3 hover:text-ink">
          Use a different Google account
        </button>
      </form>
    </Shell>
  );
}
