// src/app/api/ai/models/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Initialize Supabase client using the service role for backend operations
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } } // Recommended for server-side
  );

  // Get the authorization token from the request header
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split('Bearer ')[1];

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
  }

  // Verify the user's token
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
  }

  try {
    // Get the user's AI settings from their profile using the admin client
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('ai_settings')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json({ error: 'Failed to retrieve user profile' }, { status: 500 });
    }

    // Safely parse ai_settings and extract the apiKey
    let apiKey;
    try {
      const settings = profile?.ai_settings;
      if (typeof settings === 'string') {
        const parsedSettings = JSON.parse(settings);
        apiKey = parsedSettings?.apiKey;
      } else {
        apiKey = settings?.apiKey;
      }
    } catch (parseError) {
      console.error('Error parsing ai_settings:', parseError);
      return NextResponse.json({ error: 'Failed to parse AI settings' }, { status: 500 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not found in AI settings' }, { status: 400 }); // Use 400 Bad Request
    }

    // Fetch models from OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('OpenRouter API error:', errorData);
      return NextResponse.json(
        { error: errorData.error || `Error ${response.status}: Failed to fetch models from OpenRouter` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching models:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}