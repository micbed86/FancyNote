import { Suspense } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import CreateNoteForm from './CreateNoteForm'; // Import the new client component
import './create-note.css'; // Keep styles import if needed at page level

export default function CreateNotePage() {
  // This page component is now much simpler.
  // It sets up the layout and uses Suspense to handle the client component.
  return (
    <DashboardLayout pageTitle="Create New Note">
      {/* Wrap the client component in Suspense */}
      {/* The fallback will be shown while the client component loads */}
      <Suspense fallback={
        <div className="loading-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <p>Loading Note Creator...</p>
        </div>
      }>
        <CreateNoteForm />
      </Suspense>
    </DashboardLayout>
  );
}