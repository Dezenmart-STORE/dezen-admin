import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import session, { persist } from './session';
import { api } from './api';

export const store = configureStore({
  reducer: { session, [api.reducerPath]: api.reducer },
  middleware: (getDefault) => getDefault().concat(api.middleware),
  // Batch on a timer, not on animation frames: frames stop in a background tab, which would
  // leave the page showing spinners until someone clicks.
  enhancers: (getDefault) => getDefault({ autoBatch: { type: 'tick' } }),
});

store.subscribe(() => persist(store.getState().session));

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** True if the signed-in staff member has the capability on the service. */
export const useCan = () => {
  const access = useAppSelector((s) => s.session.access);
  return (capability: string, service: string) =>
    !!access &&
    access.capabilities.includes(capability) &&
    (access.services.includes('*') || access.services.includes(service));
};
