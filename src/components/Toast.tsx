import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import './Toast.css';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastConfig {
  message: string;
  type?: ToastType;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (config: ToastConfig) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside a ToastProvider');
  }
  return ctx;
}

function ToastMessage({ message, type }: { message: string; type: ToastType }) {
  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const timeoutRef = useRef<number | undefined>();

  const showToast = useCallback((config: ToastConfig) => {
    const { message, type = 'info', durationMs = 3000 } = config;
    window.clearTimeout(timeoutRef.current);
    setToast({ message, type });
    timeoutRef.current = window.setTimeout(() => setToast(null), durationMs);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && <ToastMessage message={toast.message} type={toast.type} />}
    </ToastContext.Provider>
  );
}
