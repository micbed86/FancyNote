// src/lib/sftp-service.js
import SftpClient from 'ssh2-sftp-client';
import path from 'path'; // Use path for reliable path joining

// Basic configuration from environment variables
const sftpConfig = {
  host: process.env.SFTP_HOST,
  port: parseInt(process.env.SFTP_PORT || '22', 10),
  username: process.env.SFTP_USERNAME,
  privateKey: process.env.SFTP_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Replace literal \n with actual newlines
  passphrase: process.env.SFTP_PASSPHRASE, // Optional
  // Add retry mechanism for robustness
  retries: 2, // Number of times to retry connecting
  retry_factor: 2, // Factor by which to multiply delay between retries
  retry_minTimeout: 2000 // Minimum timeout between retries (in ms)
};

// Validate essential config
if (!sftpConfig.host || !sftpConfig.username || !sftpConfig.privateKey) {
  console.error("SFTP Service Error: Missing required environment variables (SFTP_HOST, SFTP_USERNAME, SFTP_PRIVATE_KEY)");
  // Optionally throw an error or handle this more gracefully depending on startup requirements
}

/**
 * Creates a new SFTP client instance and connects.
 * Remember to call disconnect() when done.
 * @returns {Promise<SftpClient>} Connected SFTP client instance
 * @throws {Error} If connection fails
 */
async function connect() {
  const client = new SftpClient();
  try {
    await client.connect(sftpConfig);
    console.log('SFTP connected successfully.');
    return client;
  } catch (err) {
    console.error('SFTP connection error:', err);
    // Ensure client is closed if connection partially succeeded then failed
    if (!client.ended) {
        try { await client.end(); } catch (endErr) { /* ignore cleanup error */ }
    }
    throw new Error(`SFTP connection failed: ${err.message}`);
  }
}

/**
 * Disconnects the SFTP client if it's connected.
 * @param {SftpClient} client - The client instance to disconnect.
 */
async function disconnect(client) {
  if (client && !client.ended) {
    try {
      await client.end();
      console.log('SFTP disconnected.');
    } catch (err) {
      console.error('SFTP disconnection error:', err);
      // Don't typically throw here, as it might mask the original error
    }
  }
}

/**
 * Ensures a directory exists on the SFTP server, creating it recursively if necessary.
 * @param {SftpClient} client - Connected SFTP client instance.
 * @param {string} remoteDirPath - The absolute path of the directory to ensure.
 * @throws {Error} If directory check/creation fails.
 */
async function ensureDirExists(client, remoteDirPath) {
  try {
    const exists = await client.exists(remoteDirPath);
    if (!exists) {
      console.log(`SFTP: Directory ${remoteDirPath} does not exist. Creating...`);
      // The `true` flag enables recursive creation (like mkdir -p)
      await client.mkdir(remoteDirPath, true);
      console.log(`SFTP: Directory ${remoteDirPath} created.`);
    } else if (exists !== 'd') {
        // Path exists but is not a directory
        throw new Error(`SFTP path ${remoteDirPath} exists but is not a directory.`);
    }
  } catch (err) {
    console.error(`SFTP ensureDirExists error for ${remoteDirPath}:`, err);
    throw new Error(`Failed to ensure SFTP directory ${remoteDirPath}: ${err.message}`);
  }
}

/**
 * Uploads data to a remote file path.
 * @param {SftpClient} client - Connected SFTP client instance.
 * @param {Buffer|ReadableStream|string} input - Data source (Buffer, Stream, or local file path).
 * @param {string} remoteFilePath - The absolute path on the SFTP server to write to.
 * @throws {Error} If upload fails.
 */
async function uploadFile(client, input, remoteFilePath) {
  try {
    // Ensure the directory exists before uploading
    const remoteDir = path.dirname(remoteFilePath); // Use path.dirname
    await ensureDirExists(client, remoteDir);

    console.log(`SFTP: Uploading to ${remoteFilePath}...`);
    await client.put(input, remoteFilePath);
    console.log(`SFTP: Successfully uploaded to ${remoteFilePath}`);
  } catch (err) {
    console.error(`SFTP upload error for ${remoteFilePath}:`, err);
    throw new Error(`SFTP upload failed for ${remoteFilePath}: ${err.message}`);
  }
}

/**
 * Downloads a file from a remote path.
 * @param {SftpClient} client - Connected SFTP client instance.
 * @param {string} remoteFilePath - The absolute path on the SFTP server to read from.
 * @param {string|WritableStream|null} [destination=null] - Local path, stream, or null to return a Buffer.
 * @returns {Promise<Buffer|undefined>} Buffer if destination is null, otherwise undefined.
 * @throws {Error} If download fails.
 */
async function downloadFile(client, remoteFilePath, destination = null) {
  try {
    console.log(`SFTP: Downloading from ${remoteFilePath}...`);
    const result = await client.get(remoteFilePath, destination);
    console.log(`SFTP: Successfully downloaded from ${remoteFilePath}`);
    return result; // Returns buffer if destination is null/undefined
  } catch (err) {
    console.error(`SFTP download error for ${remoteFilePath}:`, err);
    // Handle file not found specifically? err.code === 'ENOENT'
    if (err.code === 'ENOENT') {
        throw new Error(`SFTP file not found: ${remoteFilePath}`);
    }
    throw new Error(`SFTP download failed for ${remoteFilePath}: ${err.message}`);
  }
}

export const sftpService = {
  connect,
  disconnect,
  ensureDirExists,
  uploadFile,
  downloadFile,
};