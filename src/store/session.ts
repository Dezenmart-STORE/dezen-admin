import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * Two tokens, kept for this browser tab only (sessionStorage):
 *  googleToken — the normal Dezenmart sign-in, used only to reach the authenticator step;
 *  staffToken  — the 8-hour staff token every admin request uses.
 */
export interface Access {
  email?: string;
  capabilities: string[];
  services: string[];
}

interface SessionState {
  googleToken: string | null;
  staffToken: string | null;
  access: Access | null;
}

const KEY = 'dezen-admin-session';

const load = (): SessionState => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as SessionState;
  } catch {
    /* storage unavailable */
  }
  return { googleToken: null, staffToken: null, access: null };
};

export const persist = (state: SessionState) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
};

const session = createSlice({
  name: 'session',
  initialState: load,
  reducers: {
    googleSignedIn(state, action: PayloadAction<string>) {
      state.googleToken = action.payload;
      state.staffToken = null;
      state.access = null;
    },
    staffSignedIn(state, action: PayloadAction<{ token: string; access: Access }>) {
      state.staffToken = action.payload.token;
      state.access = action.payload.access;
    },
    accessLoaded(state, action: PayloadAction<Access>) {
      state.access = action.payload;
    },
    signedOut() {
      return { googleToken: null, staffToken: null, access: null };
    },
  },
});

export const { googleSignedIn, staffSignedIn, accessLoaded, signedOut } = session.actions;
export default session.reducer;
