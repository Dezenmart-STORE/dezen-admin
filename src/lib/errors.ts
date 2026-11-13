import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { SerializedError } from '@reduxjs/toolkit';

/** The message to show for a failed request; the backend sends { message }. */
export const errorMessage = (error: FetchBaseQueryError | SerializedError | undefined): string => {
  if (!error) return '';
  if ('status' in error) {
    if (error.status === 'FETCH_ERROR') return 'Could not reach the server. Check your connection and try again.';
    const data = error.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (error.status === 403) return 'Your access does not cover this.';
    return 'Something went wrong. Try again.';
  }
  return error.message ?? 'Something went wrong. Try again.';
};

export const statusOf = (error: unknown): number | string | undefined =>
  error && typeof error === 'object' && 'status' in error ? (error as { status: number | string }).status : undefined;

/** null when a mutation worked, otherwise the message to show in its dialog. */
export const failureOf = (res: { error?: FetchBaseQueryError | SerializedError }) => (res.error ? errorMessage(res.error) : null);
