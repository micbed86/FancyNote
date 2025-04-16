import { createClient } from '@supabase/supabase-js';


export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);


/**
 * Updates the practice data for a specific CLU within the 'practice' JSONB column of a project.
 * Assumes the 'practice' column exists and is of type JSONB, storing an object keyed by clu_id.
 *
 * @param {string} projectId - The UUID of the project to update.
 * @param {string} cluId - The ID of the CLU whose practice data is being updated.
 * @param {object} newCluPracticeData - The new practice data object for the specific CLU.
 *   Schema: { practice_id, audio_id, clu_id, clu_title, created_at, duration, transcription, assessment, self_eval, pass_status }
 * @returns {Promise<{ data: object | null, error: Error | null }>} - The result from Supabase update.
 */
export async function updatePracticeData(projectId, cluId, newCluPracticeData) {
  if (!projectId || !cluId || !newCluPracticeData) {
    console.error('updatePracticeData: Missing projectId, cluId, or newCluPracticeData');
    return { data: null, error: new Error('Missing required arguments for updating practice data') };
  }

  console.log(`Updating practice data for CLU ${cluId} in project ${projectId}`);

  try {
    // 1. Fetch the current 'practice' data for the project
    const { data: projectData, error: fetchError } = await supabase
      .from('projects')
      .select('practice')
      .eq('id', projectId)
      .single();

    if (fetchError) {
      console.error('Supabase error fetching current practice data:', fetchError);
      throw fetchError;
    }

    // 2. Merge the new data
    const currentPracticeJson = projectData?.practice || {}; // Default to empty object if null
    const updatedPracticeJson = {
      ...currentPracticeJson,
      [cluId]: newCluPracticeData // Add or overwrite the data for the specific cluId
    };

    // 3. Update the 'practice' column with the merged JSON
    const { data: updateData, error: updateError } = await supabase
      .from('projects')
      .update({ practice: updatedPracticeJson }) // Update with the merged object
      .eq('id', projectId)
      .select('id, practice') // Select updated data for confirmation
      .single();

    if (updateError) {
      console.error('Supabase error updating practice data:', updateError);
      throw updateError;
    }

    console.log('Supabase practice data updated successfully for project:', projectId, 'Updated data:', updateData);
    return { data: updateData, error: null };
  } catch (error) {
    // Catch potential network errors or others not caught by Supabase client
    console.error('Caught exception updating practice data:', error);
    return { data: null, error: error instanceof Error ? error : new Error('An unknown error occurred during Supabase update') };
  }
}
