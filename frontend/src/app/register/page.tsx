/**
 * Registration page.
 */

import type { Metadata } from 'next';
import { AuthForm } from '../../components/layout/AuthForm';

export const metadata: Metadata = {
  title: 'Create an account',
};

/**
 * Renders the registration page.
 *
 * @returns The page element.
 */
export default function RegisterPage(): React.JSX.Element {
  return <AuthForm mode="register" />;
}
