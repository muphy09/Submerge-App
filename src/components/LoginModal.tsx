import { useState } from 'react';
import './LoginModal.css';

type LoginPayload = {
  userName: string;
  franchiseCode: string;
};

interface LoginModalProps {
  onSubmit: (payload: LoginPayload) => Promise<void>;
  existingName?: string;
}

const LoginModal = ({ onSubmit, existingName }: LoginModalProps) => {
  const [userName, setUserName] = useState(existingName || '');
  const [franchiseCode, setFranchiseCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!userName.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!franchiseCode.trim()) {
      setError('Please enter a franchise code.');
      return;
    }

    try {
      setLoading(true);
      await onSubmit({ userName: userName.trim(), franchiseCode: franchiseCode.trim() });
    } catch (err: any) {
      setError(err?.message || 'Unable to log in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-modal-backdrop">
      <div className="login-modal">
        <h2>Welcome</h2>
        <p className="login-subtitle">Enter your name and franchise code to continue.</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            Your Name
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Jane Doe"
            />
          </label>
          <label className="login-label">
            Franchise Code
            <input
              type="text"
              value={franchiseCode}
              onChange={(e) => setFranchiseCode(e.target.value)}
              placeholder="1111 or 2222"
            />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
