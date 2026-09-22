import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiFolder } from 'react-icons/fi';
import type { User } from '../context/types'; // Assuming User type is exported from here
import { useAuth } from '../context/useAuth';
import '../styles/Home.css';

interface SidebarHeaderProps {
  user: User | null;
  onSignOut: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ user, onSignOut }) => {
  const navigate = useNavigate();
  // A guest is a truthy `user`, so `{user && …}` alone would show them a
  // Sign Out button and a Saved Crawls link for an account they don't have.
  const { isGuest } = useAuth();
  const hasAccount = !!user && !isGuest;

  const handleSavedCrawlsClick = () => {
    navigate('/saved-crawls');
  };

  return (
    <div className="sidebar-header">
      <div className="header-top">
        <h1 className="sidebar-title">BarHop</h1>
        {hasAccount ? (
          <button onClick={onSignOut} className="btn-signout">Sign Out</button>
        ) : (
          <button onClick={() => navigate('/signup')} className="btn-signout">
            Sign up free
          </button>
        )}
      </div>
      {hasAccount && (
        <div className="user-info">
          <span className="user-welcome">
            Welcome, {user.displayName || user.email?.split("@")[0] || "crawler"}!
          </span>
          <button
            onClick={handleSavedCrawlsClick}
            className="btn-saved-crawls"
            title="View your saved crawls"
          >
            <FiFolder size={14} />
            Saved Crawls
          </button>
        </div>
      )}
    </div>
  );
};
