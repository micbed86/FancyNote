// src/app/api/notes/attachment/[...path]/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import path, { posix as posixPath } from 'path';
import { sftpService } from '@/lib/sftp-service';
import mime from 'mime-types'; // Need to install this library: npm install mime-types

export const dynamic = 'force-dynamic';

// Helper to get MIME type
function getMimeType(filePath) {
    return mime.lookup(filePath) || 'application/octet-stream'; // Default if unknown
}

export async function GET(request, { params }) {
  // Initialize Supabase auth client
  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // --- Token Authentication ---
  // We need the token from the query string for GET requests (e.g., image src)
  // Alternatively, handle auth differently for direct resource access
  const token = request.nextUrl.searchParams.get('token');

  // const authHeader = request.headers.get('Authorization'); // Less common for direct GET
  // const token = authHeader?.split('Bearer ')[1];

  if (!token) {
    return new NextResponse('Unauthorized: Missing token', { status: 401 });
  }
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    return new NextResponse('Unauthorized: Invalid token', { status: 401 });
  }
  const userId = user.id;
  // --- End Token Authentication ---

  let sftpClient;

  try {
    // 1. Extract and reconstruct the requested relative path
    const pathSegments = params.path; // e.g., ['USER_ID', 'images', 'filename.jpg']
    if (!pathSegments || pathSegments.length === 0) {
      return new NextResponse('Bad Request: Missing file path', { status: 400 });
    }
    const requestedRelativePath = posixPath.join(...pathSegments);

    // 2. Security Check: Ensure the path starts with the authenticated user's ID
    if (!requestedRelativePath.startsWith(userId + '/')) {
      console.warn(`Access Denied: User ${userId} attempted to access path ${requestedRelativePath}`);
      return new NextResponse('Forbidden: Access denied', { status: 403 });
    }

    // 3. Construct Full SFTP Path
    const sftpBasePath = process.env.SFTP_BASE_PATH;
    if (!sftpBasePath) {
      throw new Error('SFTP_BASE_PATH environment variable is not set.');
    }
    const fullSftpPath = posixPath.join(sftpBasePath, requestedRelativePath);

    console.log(`User ${userId} requesting SFTP file: ${fullSftpPath}`);

    // 4. Connect and Download File Stream
    sftpClient = await sftpService.connect();

    // Check if file exists first (optional but good practice)
    const fileStat = await sftpClient.stat(fullSftpPath);
    if (!fileStat || fileStat.isDirectory) {
        await sftpService.disconnect(sftpClient);
        return new NextResponse('Not Found: File does not exist or is a directory', { status: 404 });
    }

    // Get file as a readable stream
    const readableStream = await sftpClient.createReadStream(fullSftpPath);

    // 5. Determine Content-Type
    const contentType = getMimeType(fullSftpPath);

    // 6. Stream the response back to the client
    // Use Node.js ReadableStream directly with NextResponse
    const response = new NextResponse(readableStream);
    response.headers.set('Content-Type', contentType);
    response.headers.set('Content-Length', fileStat.size.toString());
    // Optional: Add Content-Disposition for downloads (useful for non-image/audio files)
    // if (!contentType.startsWith('image/') && !contentType.startsWith('audio/')) {
    //    response.headers.set('Content-Disposition', `attachment; filename="${path.basename(fullSftpPath)}"`);
    // }


    // Note: We don't explicitly disconnect SFTP here because the stream needs to finish.
    // Handling stream errors and ensuring disconnection might require more complex stream piping.
    // For simplicity now, rely on potential timeouts or manual cleanup if issues arise.
    // Consider using a library like `stream/promises` pipeline for better error handling if needed.

    return response;

  } catch (error) {
    console.error(`Error serving attachment ${params.path?.join('/')}:`, error);
    if (sftpClient) {
      await sftpService.disconnect(sftpClient);
    }
    if (error.message?.includes('No such file')) { // Check specific error from ssh2-sftp-client
        return new NextResponse('Not Found', { status: 404 });
    }
    return new NextResponse('Internal Server Error', { status: 500 });
  }
  // Note: No finally block for disconnect here due to streaming response.
}