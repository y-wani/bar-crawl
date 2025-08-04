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
      <h1 className="sidebar-title">Campus Crawl Planner</h1>
      {user && (
        <div className="user-info">
          <div className="user-welcome">
            <span>Welcome, {user.displayName || user.email}!</span>
            <button 
              onClick={handleSavedCrawlsClick}
              className="btn-saved-crawls"
              title="View your saved crawls"
            >
              <FiFolder size={16} />
              Saved Crawls
            </button>
          </div>
          <button onClick={onSignOut} className="btn-signout">Sign Out</button>
        </div>
      )}
    </div>
  );
};