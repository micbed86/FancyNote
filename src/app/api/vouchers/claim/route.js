import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase'; // Import your existing client
import { createClient } from '@supabase/supabase-js'; // Still need this for admin client

// Function to create a Supabase Admin client (using service role key)
const createSupabaseAdminClient = () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Supabase URL or Service Role Key is missing in environment variables.');
        throw new Error('Supabase URL or Service Role Key is missing in environment variables.');
    }
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
};

export async function POST(request) {
  let supabaseAdminClient;
  
  try {
    supabaseAdminClient = createSupabaseAdminClient();
  } catch (error) {
    console.error('Failed to create Supabase admin client:', error);
    return NextResponse.json({ error: 'Server configuration error. Please contact support.' }, { status: 500 });
  }

  try {
    // 1. Get User from JWT Token in Authorization Header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized: Missing or invalid token.' }, { status: 401 });
    }
    const jwt = authHeader.split(' ')[1];

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      console.error('Authentication error:', userError);
      const status = userError?.status === 401 ? 401 : 500;
      return NextResponse.json({ error: userError?.message || 'Unauthorized' }, { status });
    }
    const userId = user.id;

    // 2. Get Voucher Code from Request Body
    let voucherCode;
    try {
      const body = await request.json();
      voucherCode = body.voucherCode?.trim();
      if (!voucherCode) {
        return NextResponse.json({ error: 'Voucher code is required.' }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    // 3. Validate Voucher Code
    const { data: voucher, error: voucherError } = await supabaseAdminClient
      .from('voucher_codes')
      .select('code, project_tier, is_active')
      .eq('code', voucherCode)
      .single();

    if (voucherError || !voucher) {
      console.error('Voucher lookup error:', voucherError);
      return NextResponse.json({ error: 'Invalid voucher code.' }, { status: 404 });
    }
    if (!voucher.is_active) {
      return NextResponse.json({ error: 'Voucher code is no longer active.' }, { status: 410 });
    }

    // 4. Check if Voucher Already Used
    const { data: usedVoucher, error: usedVoucherError } = await supabaseAdminClient
      .from('used_voucher_codes')
      .select('code')
      .eq('code', voucherCode)
      .maybeSingle();

    if (usedVoucherError) {
        console.error('Used voucher check error:', usedVoucherError);
        return NextResponse.json({ error: 'Failed to validate voucher status.' }, { status: 500 });
    }
    if (usedVoucher) {
      return NextResponse.json({ error: 'Voucher code has already been used.' }, { status: 409 });
    }

    // --- Perform Updates (RPC Recommended) ---
    // 5. Mark Voucher as Used
    const { error: insertError } = await supabaseAdminClient
      .from('used_voucher_codes')
      .insert({ user_id: userId, code: voucherCode });

    if (insertError) {
        if (insertError.code === '23505') { // Postgres unique violation code
             return NextResponse.json({ error: 'Voucher code has already been used.' }, { status: 409 });
        }
        console.error('Error marking voucher as used:', insertError);
        return NextResponse.json({ error: 'Failed to claim voucher.' }, { status: 500 });
    }

    // 6. Increment User's Project Credits
    const { data: profile, error: profileError } = await supabaseAdminClient
        .from('profiles')
        .select('project_credits')
        .eq('id', userId)
        .single();

    if (profileError || !profile) {
        console.error('Error fetching profile for credit update:', profileError);
        // Consider rollback if not using RPC
        return NextResponse.json({ error: 'Failed to update credits (profile not found).' }, { status: 500 });
    }
    const newCredits = (profile.project_credits || 0) + voucher.project_tier;
    const { error: updateError } = await supabaseAdminClient
        .from('profiles')
        .update({ project_credits: newCredits })
        .eq('id', userId);

    if (updateError) {
        console.error('Error incrementing project credits:', updateError);
        // Consider rollback if not using RPC
        return NextResponse.json({ error: 'Failed to update project credits.' }, { status: 500 });
    }
    // --- End Updates ---

    // 7. Return Success Response
    return NextResponse.json({
        message: `Successfully claimed voucher! ${voucher.project_tier} project credits added.`,
        newCredits: newCredits
    }, { status: 200 });

  } catch (error) {
    console.error('Unexpected error in POST /api/vouchers/claim:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}