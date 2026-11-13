import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { API_URL, USE_SAMPLE_DATA } from '../lib/config';
import { PREVIEW_KEY, PREVIEW_ROLES } from '../mocks/backend';
import { errorMessage, statusOf } from '../lib/errors';
import { useAppDispatch, useAppSelector } from '../store';
import { googleSignedIn, signedOut, staffSignedIn } from '../store/session';
import {
  useConfirmAuthenticatorMutation,
  useSetupAuthenticatorMutation,
  useStartSessionMutation,
} from '../store/api';
import { Button, Card, CodeInput, ErrorNote, Field, InfoNote, Select, Spinner } from '../components/ui';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8">
        <p className="mb-6 text-sm font-semibold tracking-wide text-accent">DEZEN ADMIN</p>
        {children}
      </Card>
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
    <Shell>
      <h1 className="mb-2 text-xl font-semibold">Staff sign-in</h1>
      <p className="mb-6 text-sm text-muted">
        Sign in with the Google account your access was given to. You will then enter a code from your authenticator app.
      </p>
      {USE_SAMPLE_DATA && (
        <div className="mb-4 space-y-3">
          <InfoNote>Sample data mode. Any 6-digit code works; 000000 shows the wrong-code message.</InfoNote>
          <Field label="Preview as">
            <Select value={preview} onChange={(e) => choose(e.target.value)}>
              {Object.entries(PREVIEW_ROLES).map(([k, r]) => (
                <option key={k} value={k}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <a
        href={href}
        className="flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-ink hover:bg-accent-hover"
      >
        {USE_SAMPLE_DATA ? 'Continue' : 'Continue with Google'}
      </a>
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

  if (token) return <Shell><Spinner /></Shell>;
  return (
    <Shell>
      <ErrorNote>{failure ?? 'Google sign-in did not complete.'}</ErrorNote>
      <Button className="mt-4 w-full" onClick={() => navigate('/sign-in', { replace: true })}>
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

  return (
    <Shell>
      {stage === 'setup' && setupState.data ? (
        <>
          <h1 className="mb-2 text-xl font-semibold">Set up your authenticator</h1>
          <p className="mb-4 text-sm text-muted">
            Scan this with Google Authenticator, 1Password or a similar app, then enter the code it shows.
          </p>
          <div className="mb-4 flex justify-center rounded-lg bg-white p-4">
            <QRCodeSVG value={setupState.data.otpauthUrl} size={176} />
          </div>
          <p className="mb-4 break-all text-center font-mono text-xs text-muted">{setupState.data.secret}</p>
        </>
      ) : (
        <>
          <h1 className="mb-2 text-xl font-semibold">Enter your code</h1>
          {stage === 'next-code' ? (
            <div className="mb-4">
              <InfoNote>Your authenticator is set up. Wait for the next code in the app, then enter it to sign in.</InfoNote>
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted">Open your authenticator app and enter the 6-digit code for Dezen Admin.</p>
          )}
        </>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Code">
          <CodeInput value={code} onChange={setCode} autoFocus />
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={code.length !== 6}
          busy={session.isLoading || confirmState.isLoading || setupState.isLoading}
        >
          {stage === 'setup' ? 'Turn on authenticator' : 'Sign in'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => dispatch(signedOut())}>
          Use a different Google account
        </Button>
      </form>
    </Shell>
  );
}
