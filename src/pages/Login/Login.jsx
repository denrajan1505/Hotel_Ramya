import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import logo from '../../assets/logo.png';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  if (user) {
    navigate(location.state?.from || '/dashboard', { replace: true });
    return null;
  }

  const onSubmit = async ({ username, password }) => {
    setSubmitting(true);
    try {
      await login(username, password);
      toast.success('Welcome back!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.message?.includes('invalid-credential') || err.code === 'auth/invalid-credential' ? 'Invalid username or password.' : err.message || 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary-900 via-primary-800 to-primary-950 p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-gold-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-primary-400/20 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logo} alt="Ramyas Hotels" className="h-28 w-28 object-contain drop-shadow-lg" />
          <h1 className="mt-2 text-2xl font-bold text-white">Hotel Ramyas</h1>
          <p className="text-sm text-primary-200">Credit Control Management System</p>
        </div>

        <div className="glass-card !bg-white/95 p-7 dark:!bg-primary-900/90">
          <h2 className="mb-1 text-lg font-semibold text-slate-800 dark:text-slate-100">Sign in</h2>
          <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Use the username and password provided by your Administrator.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                autoFocus
                className="input"
                placeholder="e.g. admin"
                {...register('username', { required: 'Username is required' })}
              />
              {errors.username && <p className="mt-1 text-xs text-danger-500">{errors.username.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  {...register('password', { required: 'Password is required' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-danger-500">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              <LogIn size={16} /> {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-primary-300">
          No public registration — accounts are created by your Administrator.
        </p>
      </div>
    </div>
  );
}
