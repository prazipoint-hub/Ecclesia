import axios from 'axios';

type ApiErrorBody = { error?: string; code?: string };

export const getApiErrorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    if (body?.error) return body.error;
    if (!error.response) return 'Unable to reach the server. Check your connection and try again.';
    return fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

export const getApiErrorCode = (error: unknown): string | undefined =>
  axios.isAxiosError(error) ? (error.response?.data as ApiErrorBody | undefined)?.code : undefined;
