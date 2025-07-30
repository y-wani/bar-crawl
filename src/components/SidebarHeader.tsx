import React from 'react';
import type { User } from '../context/types'; // Assuming User type is exported from here
import '../styles/Home.css';

interface SidebarHeaderProps {
  user: User | null;
  onSignOut: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ user, onSignOut }) => {
  return (
    <div className="sidebar-header">
      <h1 className="sidebar-title">Campus Crawl Planner</h1>
      {user && (
        <div className="user-info">
          <span>Welcome, {user.displayName || user.email}!</span>
          <button onClick={onSignOut} className="btn-signout">Sign Out</button>
        </div>
      )}
    </div>
  );
};