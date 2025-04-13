'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname
import { supabase } from '@/lib/supabase';
import { HomeIcon, ProjectIcon, AccountIcon, LogoutIcon, BellIcon, SearchIcon, MenuIcon, CloseIcon } from '@/lib/icons'; // Add MenuIcon, CloseIcon
import '../dashboard.css';
import Image from 'next/image';
import Link from 'next/link';

export default function DashboardLayout({ children, pageTitle = 'Dashboard' }) {
  const router = useRouter();
  const pathname = usePathname(); // Get current path
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false); // State for mobile menu
  const [userInitial, setUserInitial] = useState('U');
  
  useEffect(() => {
    const fetchUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();
          
        if (profile) {
          if (profile.first_name) {
            setUserInitial(profile.first_name.charAt(0).toUpperCase());
          }
        }
      }
    };
    fetchUserProfile();

    // Close mobile menu on route change
    setMobileMenuOpen(false);
  }, [pathname]); // Add pathname dependency

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(!isSidebarCollapsed);
  };

  // Toggle mobile menu
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className={`dashboard-container ${isMobileMenuOpen ? 'mobile-menu-active' : ''}`}>
      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={toggleMobileMenu}></div>
      )}

      {/* Sidebar */}
      <div className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
        <div className="sidebar-header">
            {/* Add close button for mobile */}
            <button className="mobile-close-btn" onClick={toggleMobileMenu}>
              <CloseIcon />
            </button>
            <Image src="/logo_white.svg" alt="Logo" className="logo-img" width={100} height={100} />
            <h2 className="sidebar-logo">FancyNote</h2>
        </div>
        <nav className="sidebar-nav">
          <ul>
            <li>
              <Link href="/notes" className={pageTitle === 'Notes' ? 'active' : ''}>
                <ProjectIcon /> {/* Keep ProjectIcon, it's generic */}
                <span className="nav-text">Notes</span>
              </Link>
            </li>
            <li>
              <a href="/account" className={pageTitle === 'Account' ? 'active' : ''}>
                <AccountIcon />
                <span className="nav-text">Account</span>
              </a>
            </li>
            <li className="logout-item">
              <button onClick={handleLogout} className="logout-button">
                <LogoutIcon />
                <span className="nav-text">Logout</span>
              </button>
            </li>

          </ul>
        </nav> 
        <div style={{ marginBottom: '50px', display: 'flex', justifyContent: 'flex-end' }}>        
        <button className="sidebar-toggle" onClick={toggleSidebar}>
            {isSidebarCollapsed ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-panel-left-open-icon lucide-panel-left-open">
                <rect width="18" height="18" x="3" y="3" rx="2"/>
                <path d="M9 3v18"/>
                <path d="m14 9 3 3-3 3"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-panel-left-close-icon lucide-panel-left-close">
                <rect width="18" height="18" x="3" y="3" rx="2"/>
                <path d="M9 3v18"/>
                <path d="m16 15-3-3 3-3"/>
              </svg>
            )}
        </button>
        </div>
      </div>

      {/* Main content area */}
      <div className={`main-content ${isSidebarCollapsed ? 'expanded' : ''}`}>
        {/* Top bar */}
        <div className="topbar">
          <div className="topbar-left">
            {/* Hamburger Menu Button for Mobile */}
            <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
              <MenuIcon />
            </button>
            <h1 className="page-title">{pageTitle}</h1>
            {pageTitle === 'Notes' && ( // Update condition
              <div className="search-container">
                <SearchIcon className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search notes..." // Update placeholder
                  onChange={(e) => {
                    // We'll pass this search term to the children components
                    if (typeof window !== 'undefined') {
                      const event = new CustomEvent('noteSearch', { detail: e.target.value }); // Update event name
                      window.dispatchEvent(event);
                    }
                  }}
                />
              </div>
            )}
          </div>
          <div className="topbar-right">
            <div className="notification-icon">
              <BellIcon />
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="content-area">
          {children}
        </div>
      </div>
    </div>
  );
}
