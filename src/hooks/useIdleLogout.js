import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

const IDLE_LIMIT_MS = 8 * 60 * 60 * 1000; // 8 hours
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'];

export function useIdleLogout(isAuthenticated, onIdle) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const reset = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        toast('You have been logged out due to inactivity.');
        onIdle();
      }, IDLE_LIMIT_MS);
    };

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, reset));
    reset();

    return () => {
      clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, reset));
    };
  }, [isAuthenticated, onIdle]);
}
