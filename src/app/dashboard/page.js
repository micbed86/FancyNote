'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import ProfileVerification from '../components/ProfileVerification';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
      }
    };
    checkUser();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth');
  };

  return (
    <>
      <ProfileVerification />
      <DashboardLayout pageTitle="Dashboard">
        <div className="dashboard-content">
          <div className='empty-board'>
            <h1>no statistics yet</h1>
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}