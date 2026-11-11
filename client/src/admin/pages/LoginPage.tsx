import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from '@/lib/zod';
import logo from '@/assets/logo-mark.png';
import { ApiError } from '@/lib/api';
import { useAdminAuth } from '../auth';
import { Alert, Btn, Field, Input } from '../ui';

const schema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });
type Values = z.infer<typeof schema>;

export default function LoginPage() {
  const { status, login } = useAdminAuth();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });
  if (status === 'authed') return <Navigate to="/admin" replace />;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try { await login(v.email, v.password); nav('/admin', { replace: true }); }
    catch (e) { setError(e instanceof ApiError ? (e.status === 423 ? 'Too many failed attempts. Please wait 15 minutes and try again.' : e.status === 429 ? 'Too many attempts. Please try again later.' : e.status === 401 ? 'Incorrect email or password.' : e.message) : 'Something went wrong.'); }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4">
      <form onSubmit={onSubmit} noValidate className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-soft">
        <div className="flex items-center gap-3"><img src={logo} alt="" className="h-10 w-auto" /><h1 className="text-2xl font-bold">Admin sign in</h1></div>
        {error && <Alert>{error}</Alert>}
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="username" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        <Btn type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</Btn>
      </form>
    </main>
  );
}
