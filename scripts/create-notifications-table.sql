-- Create notifications table for FancyNote
-- This script should be run against your Supabase database

-- Create the notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Add RLS policies for the notifications table
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to view only their own notifications
CREATE POLICY "Users can view their own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy to allow users to update only their own notifications (e.g., mark as read)
CREATE POLICY "Users can update their own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON public.notifications(read);

-- Add processing_status and processed_at columns to notes table
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS transcripts TEXT;

-- Grant permissions to authenticated users
GRANT SELECT, UPDATE ON public.notifications TO authenticated;

-- Comment on table and columns
COMMENT ON TABLE public.notifications IS 'User notifications for various events like note processing completion';
COMMENT ON COLUMN public.notifications.type IS 'Type of notification (e.g., note_processed, note_processing_error)';
COMMENT ON COLUMN public.notifications.content IS 'JSON content of the notification with details specific to the notification type';
COMMENT ON COLUMN public.notifications.read IS 'Whether the notification has been read by the user';