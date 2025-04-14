# Server-Side Note Processing Implementation

This document outlines the implementation of the server-side processing mechanism for the `Process Note` button on the Create Note page.

## Overview

The implementation consists of several components:

1. **Asynchronous Processing API Endpoint**: A new endpoint that handles long-running tasks without blocking the user interface
2. **Notification System**: A system to notify users when their notes have been processed
3. **Database Schema Updates**: New tables and columns to support notifications and processing status

## Implementation Details

### 1. API Endpoints

- **`/api/notes/process`**: The existing endpoint that saves the note and its attachments
- **`/api/notes/process-async`**: The new endpoint that handles:
  - Transcribing audio recordings using qroq API with whisper turbo
  - Processing transcriptions with an LLM via openrouter API
  - Updating the note with processed content
  - Creating notifications for the user

### 2. Notification System

- **Notifications Component**: A UI component that displays notifications in the topbar
- **Notification Badge**: Shows the number of unread notifications
- **Notification Database Table**: Stores user notifications with read/unread status

### 3. Database Schema

A new `notifications` table with the following structure:

```sql
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
```

Additional columns for the `notes` table:

```sql
ALTER TABLE public.notes ADD COLUMN processing_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE public.notes ADD COLUMN processed_at TIMESTAMPTZ;
ALTER TABLE public.notes ADD COLUMN processing_error TEXT;
ALTER TABLE public.notes ADD COLUMN transcripts TEXT;
```

## How It Works

1. User clicks the `Process Note` button on the Create Note page
2. The note and its attachments are saved using the existing `/api/notes/process` endpoint
3. The new `/api/notes/process-async` endpoint is called to start background processing
4. The user is redirected to the note page immediately
5. In the background, the server:
   - Transcribes audio recordings using qroq API
   - Processes transcriptions with an LLM via openrouter API
   - Updates the note with the processed content
   - Creates a notification for the user
6. When processing is complete, a notification appears in the topbar
7. The user can click the notification to view the processed note

## Configuration

The LLM configuration is fetched from the user's profile in the `ai_settings` column, which should contain:

- `apiKey`: The openrouter API key
- `model`: The LLM model to use
- `systemPrompt`: The system prompt for the LLM
- `qroqApiKey`: The qroq API key for transcription

## Installation

1. Run the SQL script in `scripts/create-notifications-table.sql` to create the necessary database schema
2. Ensure the required environment variables are set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SFTP_BASE_PATH`
   - `GROQ_API_KEY`


## Next Steps

- Implement a more robust background job system for production use
- Add progress indicators for the processing status
- Implement retry mechanisms for failed processing attempts
- Add support for more LLM models and configurations