/**
 * Authentication endpoints.
 */

import { apiRequest } from '../api-client';
import type { AuthResponse, User } from '../types';

/**
 * Registers a new account.
 *
 * @param email       Email address.
 * @param password    Plaintext password (hashed server-side).
 * @param displayName Optional friendly name.
 * @returns Access token and the created user.
 */
export function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: { email, password, ...(displayName ? { displayName } : {}) },
    // Any existing token is irrelevant when creating a new account.
    token: null,
  });
}

/**
 * Signs in with existing credentials.
 *
 * @param email    Email address.
 * @param password Plaintext password.
 * @returns Access token and the user.
 */
export function login(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    token: null,
  });
}

/**
 * Fetches the profile belonging to the stored token.
 *
 * Used on app start to restore a session — and to detect a token that has since
 * expired or been revoked.
 *
 * @returns The authenticated user.
 */
export function getCurrentUser(): Promise<User> {
  return apiRequest<User>('/auth/me');
}
