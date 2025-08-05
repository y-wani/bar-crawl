import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiFolder } from 'react-icons/fi';
import type { User } from '../context/types'; // Assuming User type is exported from here
import '../styles/Home.css';

interface SidebarHeaderProps {
  user: User | null;
  onSignOut: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ user, onSignOut }) => {
  const navigate = useNavigate();

  const handleSavedCrawlsClick = () => {
    navigate('/saved-crawls');
  };

  return (
    <div className="sidebar-header">
      <div className="header-top">
        <h1 className="sidebar-title">BarHop</h1>
        {user && (
          <button onClick={onSignOut} className="btn-signout">Sign Out</button>
        )}
      </div>
      {user && (
        <div className="user-info">
          <span className="user-welcome">Welcome, {user.displayName || user.email}!</span>
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