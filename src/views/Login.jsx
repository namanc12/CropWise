import React, { useState, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "firebase/auth";
import { auth } from '../api/firebaseConfig';
import styles from './Login.module.css';
import { LogIn, UserPlus } from 'lucide-react';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // State for confirm password
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false); // State to toggle between Login and Sign Up

  const handleAuthAction = useCallback(async (e) => {
    e.preventDefault();
    setError('');

    // Basic validation for sign up
    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (isSignUp && password.length < 6) {
        setError('Password should be at least 6 characters.');
        return;
    }


    setLoading(true);

    try {
      const persistenceMode = rememberMe
        ? browserLocalPersistence
        : browserSessionPersistence;
      await setPersistence(auth, persistenceMode);

      if (isSignUp) {
        // Sign Up logic
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        // Login logic
        await signInWithEmailAndPassword(auth, email, password);
      }

    } catch (err) {
      console.error("Authentication error:", err.code, err.message);
      let friendlyError = `Failed to ${isSignUp ? 'sign up' : 'log in'}. Please try again later.`;

      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          friendlyError = 'Invalid email or password.';
          break;
        case 'auth/invalid-email':
          friendlyError = 'Please enter a valid email address.';
          break;
        case 'auth/too-many-requests':
            friendlyError = 'Access temporarily disabled due to too many attempts. Please try again later or reset your password.';
            break;
        case 'auth/network-request-failed':
            friendlyError = 'Network error. Please check your connection.';
            break;
        // Sign Up Specific Errors
        case 'auth/email-already-in-use':
          friendlyError = 'This email address is already registered. Please log in or use a different email.';
          break;
        case 'auth/weak-password':
          friendlyError = 'Password is too weak. Please choose a stronger password (at least 6 characters).';
          break;
      }
      setError(friendlyError);
    } finally {
      setLoading(false);
    }
  }, [email, password, confirmPassword, rememberMe, isSignUp]); 

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
  };

  return (
    <div className={styles.loginWrapper}>
      <div className={styles.loginContainer}>
        <div className={styles.header}>
            <img
              src="/cropwiselogo.png"
              alt="CropWise Logo"
              className={styles.loginLogo}
            />
            <h2>{isSignUp ? 'Create Account' : 'Welcome to CropWise'}</h2>
        </div>

        <form onSubmit={handleAuthAction} className={styles.loginForm}>
          <div className={styles.formGroup}>
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
              placeholder="you@example.com"
              className={styles.inputField}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignUp ? "new-password" : "current-password"} 
              disabled={loading}
              placeholder="••••••••"
              className={styles.inputField}
            />
          </div>

          {isSignUp && (
            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password" 
                disabled={loading}
                placeholder="••••••••"
                className={styles.inputField}
              />
            </div>
          )}

          {!isSignUp && (
            <div className={styles.formOptions}>
                <label className={styles.checkboxLabel} htmlFor="rememberMe">
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                  />
                  <span className={styles.checkboxCustom}></span>
                  <span>Keep me signed in</span>
                </label>
            </div>
          )}

          {error && <p className={styles.errorMessage}>{error}</p>}

          <button
              type="submit"
              className={`${styles.button} ${styles.loginButton}`}
              disabled={loading}
            >
            {isSignUp ? <UserPlus size={18} /> : <LogIn size={18} />}
            {loading ? (isSignUp ? 'Signing Up...' : 'Logging in...') : (isSignUp ? 'Sign Up' : 'Log In')}
          </button>
        </form>

        <div className={styles.toggleMode}>
          <button type="button" onClick={toggleMode} className={styles.toggleButton} disabled={loading}>
            {isSignUp ? 'Already have an account? Log In' : 'Need an account? Sign Up'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default Login;
