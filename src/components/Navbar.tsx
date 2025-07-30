import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { ThemeToggle } from './ThemeToggle';
import '../styles/Navbar.css';

export const Navbar: React.FC = () => {
  const { user } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          🍻 BarBuddy
        </Link>
        <div className="navbar-links">
          <Link to="/my-routes" className="navbar-link">My Routes</Link>
          <Link to="/about" className="navbar-link">About</Link>
          <Link to="/contact" className="navbar-link">Contact</Link>
        </div>
        <div className="navbar-actions">
          <ThemeToggle />
          {user ? (
            <Link to="/account" className="btn">Account</Link>
          ) : (
            <>
              <Link to="/signin" className="btn btn-secondary">Sign In</Link>
              <Link to="/signup" className="btn">Sign Up</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};
