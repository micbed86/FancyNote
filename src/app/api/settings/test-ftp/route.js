import { NextResponse } from 'next/server';
import { Client } from 'basic-ftp';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ftpConfig = await request.json();
  const client = new Client();
  // client.ftp.verbose = true; // Enable verbose logging for debugging

  try {
    // Validate required fields
    if (!ftpConfig.host || !ftpConfig.user || !ftpConfig.password) {
      return NextResponse.json({ error: 'Missing required FTP credentials (host, user, password)' }, { status: 400 });
    }

    console.log(`Attempting FTP connection to ${ftpConfig.host}:${ftpConfig.port || 21} for user ${ftpConfig.user}`);

    await client.access({
      host: ftpConfig.host,
      user: ftpConfig.user,
      password: ftpConfig.password,
      port: ftpConfig.port || 21, // Default FTP port is 21
      secure: false // Explicitly set to false for plain FTP
    });

    console.log('FTP connection successful.');

    // Optional: Try listing directory content as a further check
    const targetPath = ftpConfig.remote_path || '/';
    console.log(`Attempting to list directory: ${targetPath}`);
    try {
      const list = await client.list(targetPath);
      console.log(`Successfully listed directory ${targetPath}. Found ${list.length} items.`);
      // We don't need to return the list, just confirm it worked.
    } catch (listError) {
      console.error(`FTP directory listing error for path ${targetPath}:`, listError);
      // Don't fail the whole test for a list error if connection worked,
      // but maybe return a warning or specific status? For now, log it.
      // Consider returning a specific message if listing fails but connection is ok.
    }

    return NextResponse.json({ message: 'FTP connection successful.' });

  } catch (error) {
    console.error('FTP connection test failed:', error);
    // Provide a more specific error message if possible
    let errorMessage = 'FTP connection failed.';
    if (error.code === 'ENOTFOUND') {
        errorMessage = 'FTP connection failed: Hostname not found.';
    } else if (error.code === 530) { // Common code for login incorrect
        errorMessage = 'FTP connection failed: Invalid username or password.';
    } else if (error instanceof Error) {
        errorMessage = `FTP connection failed: ${error.message}`;
    }
    return NextResponse.json({ error: errorMessage, details: error.code || error.message }, { status: 500 });

  } finally {
    // Ensure the client connection is closed regardless of success or failure
    if (client.closed === false) {
      console.log('Closing FTP connection.');
      await client.close();
    }
  }
}