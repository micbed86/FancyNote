import { NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const settingsToSave = await request.json();

    // Basic validation
    if (!settingsToSave.host || !settingsToSave.user) {
      return NextResponse.json({ error: 'Missing required FTP fields (host, user)' }, { status: 400 });
    }
    if (settingsToSave.port && isNaN(parseInt(settingsToSave.port, 10))) {
        return NextResponse.json({ error: 'Invalid port number' }, { status: 400 });
    }

    // Ensure password is not included in the saved data
    const { password, ...safeSettings } = settingsToSave;

    // Ensure port is an integer, default if necessary
    safeSettings.port = parseInt(safeSettings.port, 10) || 21;
    // Ensure use_passive is a boolean
    safeSettings.use_passive = typeof safeSettings.use_passive === 'boolean' ? safeSettings.use_passive : true;


    console.log(`Updating ftp_settings for user ${userId}:`, safeSettings);

    const { error } = await supabase
      .from('profiles')
      .update({
        ftp_settings: safeSettings,
        updated_at: new Date().toISOString()
       })
      .eq('id', userId);

    if (error) {
      console.error('Supabase update error:', error);
      throw new Error(error.message || 'Failed to update settings in database.');
    }

    return NextResponse.json({ message: 'FTP settings saved successfully!' });

  } catch (error) {
    console.error('Error saving FTP settings:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}