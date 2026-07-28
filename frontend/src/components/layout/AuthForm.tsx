'use client';

/**
 * Shared sign-in / sign-up form.
 *
 * The two screens differ only in their copy and which action they call, so one
 * parameterised component serves both — keeping validation, error handling and
 * redirect behaviour identical across them.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Alert } from '../ui/Feedback';
import { Card } from '../ui/Card';
import { useAuth } from '../../providers/AuthProvider';
import { useToast } from '../../providers/ToastProvider';
import { toErrorMessage } from '../../lib/api-client';
import { validateEmail, validatePassword } from '../../lib/validators';

export interface AuthFormProps {
  /** Which flow this form drives. */
  mode: 'login' | 'register';
}

/**
 * Renders the credentials form for either auth flow.
 *
 * @param props.mode Whether to sign in or register.
 * @returns The form element.
 */
export function AuthForm({ mode }: AuthFormProps): React.JSX.Element {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const { showSuccess } = useToast();

  const isRegister = mode === 'register';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * Validates the fields and performs the auth request.
   *
   * @param event The submit event.
   */
  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitError(null);

    const emailCheck = validateEmail(email);
    // Sign-in only requires a non-empty password: the length policy applies to
    // new passwords, and enforcing it at login would lock out anyone whose
    // password predates a policy change.
    const passwordCheck = isRegister
      ? validatePassword(password)
      : password.length > 0
        ? { valid: true as const }
        : { valid: false as const, reason: 'Password is required' };

    if (!emailCheck.valid || !passwordCheck.valid) {
      setFieldErrors({
        email: emailCheck.valid ? undefined : emailCheck.reason,
        password: passwordCheck.valid ? undefined : passwordCheck.reason,
      });
      return;
    }

    setFieldErrors({});
    setPending(true);

    try {
      if (isRegister) {
        await signUp(email, password, displayName.trim() || undefined);
        showSuccess('Account created — welcome!');
      } else {
        await signIn(email, password);
        showSuccess('Signed in');
      }
      router.push('/dashboard');
    } catch (error) {
      setSubmitError(toErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-content">
          {isRegister ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {isRegister
            ? 'Keep track of your links and see how they perform.'
            : 'Sign in to manage your links.'}
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Email"
            type="email"
            // Helps password managers and mobile keyboards do the right thing.
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            required
          />

          {isRegister && (
            <Input
              label="Display name (optional)"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          )}

          <Input
            label="Password"
            type="password"
            // `new-password` tells a password manager to offer to generate one.
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            hint={isRegister ? 'At least 8 characters' : undefined}
            required
          />

          {submitError && <Alert variant="error">{submitError}</Alert>}

          <Button type="submit" size="lg" loading={pending} fullWidth>
            {isRegister ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      </Card>

      <p className="mt-5 text-center text-sm text-muted">
        {isRegister ? 'Already have an account? ' : 'Don’t have an account? '}
        <Link
          href={isRegister ? '/login' : '/register'}
          className="text-brand-hover hover:underline"
        >
          {isRegister ? 'Sign in' : 'Sign up'}
        </Link>
      </p>
    </div>
  );
}
