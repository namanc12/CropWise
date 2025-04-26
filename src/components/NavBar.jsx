import React, { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from "firebase/auth";
import { auth } from '../api/firebaseConfig';
import styles from './NavBar.module.css';
import { LogOut } from 'lucide-react'; 

function NavBar({ user }) { // Accept user prop if needed elsewhere, though not used here

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  }, []);

  return (
    <nav className={styles.navbar}>
      <div className={styles.navContent}>
        <Link to="/landing" className={styles.brandLink}>
          <div className={styles.brand}>
            <img
              src="/cropwiselogo.png"
              alt="CropWise Logo"
              className={styles.brandLogo} // Use a new class for styling
            />
            <span className={styles.brandName}>CropWise</span>
          </div>
        </Link>
        <button
          onClick={handleLogout}
          className={styles.logoutButton}
          title="Logout"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}

export default NavBar;
