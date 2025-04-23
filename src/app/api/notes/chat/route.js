import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js'; // Import standard client
// Removed streamText and openaiAdapter imports
import OpenAI from 'openai'; // Import standard OpenAI package
// Removed @supabase/ssr and cookies imports

// Define the models and fallbacks
const primaryModel = 'google/gemini-2.0-flash-exp:free';
const fallbackModels = [
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-4-maverick:free',
  'deepseek/deepseek-v3-base:free',
  'google/gemma-3-27b-it:free',
];

// Map language codes to full names
const languageNames = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  pl: 'Polish',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  // Add more languages as needed
};

// Function to fetch note content from Supabase
async function getNoteContent(supabaseClient, userId, noteIds) {
  let query = supabaseClient
    .from('notes')
    .select('id, title, text') // Select title and full text
    .eq('user_id', userId);

  if (noteIds && noteIds.length > 0) {
    query = query.in('id', noteIds); // Filter by selected IDs
  }
  // If noteIds is empty or null, fetch all notes for the user

  const { data: notes, error } = await query;

  if (error) {
    console.error('Error fetching note content:', error);
    throw new Error('Failed to fetch note content.');
  }
  return notes || [];
}

// Function to construct the system prompt
function constructSystemPrompt(notes, language) {
  const langName = languageNames[language] || 'English';
  let notesContent = '';

  if (notes.length === 0) {
    notesContent = '<no notes provided>';
  } else {
    notesContent = notes
      .map(note => `<${note.title || 'Untitled Note'}>\n${note.text || 'No content.'}\n</${note.title || 'Untitled Note'}>`)
      .join('\n\n');
  }

  return `You are a helpful assistant named Bob, speaking ${langName}. Your task is to help the user by diligently answering in ${langName} to the user's questions, and formatting them as markdown text. Your answers MUST be based **solely and exclusively** on the content of the **<notes>** provided below:

<notes>
${notesContent}
</notes>`;
}

export async function POST(req) {
  try {
    // Language is fetched server-side now, remove from request body destructuring
    const { messages, selectedNoteIds } = await req.json();

    // --- Authentication via Header Token (like /api/notes/process) ---
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split('Bearer ')[1];

    if (!token) {
      console.log('Chat API: No auth token provided');
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    // Create a temporary client with anon key just for token validation
    const supabaseAuth = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

    if (userError || !user) {
      console.error('Chat API: Token validation error:', userError);
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    const userId = user.id;
    console.log(`Chat API: Authenticated user ${userId} via token.`);
    // --- End Authentication ---

    // --- Service Role Client for DB Operations ---
    // Use Service Role Key to fetch profile and notes, bypassing RLS after user is authenticated
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY, // Ensure this is set in your .env.local
      { auth: { persistSession: false } }
    );
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error("Chat API: SUPABASE_SERVICE_ROLE_KEY environment variable is missing!");
        // Return error as this is critical for DB access
        return NextResponse.json({ error: 'Server configuration error (Service Key Missing)' }, { status: 500 });
    }
    // --- End Service Role Client Setup ---
    // 2. Fetch User Profile Settings (using the ADMIN client)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('ai_settings') // Select the JSONB column
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching user profile for AI settings:', profileError);
      return NextResponse.json({ error: 'Failed to fetch user profile settings.' }, { status: 500 });
    }

    if (!profile || !profile.ai_settings) {
      return NextResponse.json({ error: 'AI settings not configured for this user.' }, { status: 400 });
    }

    const userAiSettings = profile.ai_settings;
    const userApiKey = userAiSettings.apiKey;
    const userLanguage = userAiSettings.language || 'en'; // Default to 'en' if not set

    if (!userApiKey) {
      console.error('User has not configured their OpenRouter API Key in settings.');
      return NextResponse.json({ error: 'OpenRouter API Key not configured in user settings.' }, { status: 400 });
    }
    // Note: We could also use userAiSettings.model here if needed, but the primary/fallback logic handles model selection for the call.

    // 3. Fetch Note Content (using the ADMIN client)
    const notesData = await getNoteContent(supabaseAdmin, userId, selectedNoteIds);

    // 4. Construct System Prompt
    const systemPrompt = constructSystemPrompt(notesData, userLanguage); // Use language from profile

    // 5. Prepare messages for the AI model
    const preparedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages, // Append user messages
    ];

    // 6. Initialize OpenRouter provider (OpenAI compatible)
    const openrouter = new OpenAI({
        apiKey: userApiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        // Optional: Set headers if needed by OpenRouter or your setup
        // headers: {
        //   "HTTP-Referer": "<YOUR_SITE_URL>",
        //   "X-Title": "<YOUR_SITE_NAME>",
        // },
    });

    // 7. Call OpenRouter API (Non-Streaming)
    // TODO: Implement fallback logic if needed (try primary, then fallbacks on error)
    console.log(`Attempting non-streaming chat completion with primary model: ${primaryModel}`);
    try {
      const completion = await openrouter.chat.completions.create({
        model: primaryModel,
        messages: preparedMessages,
        stream: false, // Explicitly set stream to false
      });

      // Extract the content from the first choice's message
      const responseContent = completion.choices?.[0]?.message?.content;

      if (!responseContent) {
        console.error('No content found in OpenRouter response:', completion);
        return NextResponse.json({ error: 'No content received from AI model.' }, { status: 500 });
      }

      // 8. Return the full response content as JSON
      console.log("Received full response from model.");
      return NextResponse.json({ response: responseContent });

    } catch (apiError) {
      // Handle potential errors from the API call itself
      console.error(`Error calling OpenRouter model ${primaryModel}:`, apiError);
      // TODO: Implement fallback model logic here if desired
      return NextResponse.json({ error: `Failed to get response from AI model ${primaryModel}. Error: ${apiError.message}` }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in /api/notes/chat:', error);
    return NextResponse.json({ error: error.message || 'An internal server error occurred' }, { status: 500 });
  }
}

// Removed streaming-specific fallback notes. Fallback for non-streaming would involve catching errors above.