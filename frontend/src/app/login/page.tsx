/**
 * Sign-in page.
 */

import type { Metadata } from 'next';
import { AuthForm } from '../../components/layout/AuthForm';

export const metadata: Metadata = {
  title: 'Sign in',
};

/**
 * Renders the sign-in page.
 *
 * @returns The page element.
 */
export default function LoginPage(): React.JSX.Element {
  return <AuthForm mode="login" />;
}
