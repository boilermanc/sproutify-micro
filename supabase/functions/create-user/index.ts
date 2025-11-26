import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error('Server configuration error: Missing environment variables')
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Unauthorized')
    }

    // Create authenticated client for the requester
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    })

    // Verify the requester is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Verify the requester has permission (Owner or Editor role)
    const { data: requesterProfile, error: profileError } = await supabaseClient
      .from('profile')
      .select('role, farm_uuid')
      .eq('id', user.id)
      .single()

    if (profileError || !requesterProfile) {
      throw new Error('Profile not found')
    }

    if (requesterProfile.role !== 'Owner' && requesterProfile.role !== 'Editor') {
      throw new Error('Insufficient permissions. Only Owners and Editors can create users.')
    }

    let requestBody
    try {
      requestBody = await req.json()
    } catch (_jsonError) {
      throw new Error('Invalid JSON in request body')
    }

    const { email, password, name, role, farmUuid } = requestBody ?? {}

    // Validate input
    if (!email || !password || !name || !role || !farmUuid) {
      throw new Error('Missing required fields: email, password, name, role, farmUuid')
    }

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim()

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      throw new Error('Invalid email format')
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long')
    }

    if (trimmedName.length < 2) {
      throw new Error('Name must be at least 2 characters long')
    }

    if (!['Owner', 'Editor', 'Viewer'].includes(role)) {
      throw new Error('Invalid role. Must be Owner, Editor, or Viewer')
    }

    // Verify farm exists and requester belongs to it
    if (requesterProfile.farm_uuid !== farmUuid) {
      throw new Error('Cannot create user for different farm')
    }

    // Split name into firstname and lastname for response convenience
    const nameParts = trimmedName.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    const cleanupProfileByEmail = async () => {
      const { data, error } = await supabaseAdmin
        .from('profile')
        .delete()
        .eq('email', trimmedEmail)
        .select('id')
      if (error) {
        console.error('Failed to cleanup existing profile records:', error)
        throw new Error('Unable to verify email availability. Please try again.')
      }
      if (data?.length) {
        console.log(`[create-user] Removed ${data.length} leftover profile record(s) for ${trimmedEmail}`)
      }
    }

    // Create user in Supabase Auth
    const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true, // Auto-confirm email
    })

    if (signUpError) {
      if (signUpError.message?.includes('already registered')) {
        throw new Error('An account with this email already exists')
      }
      if (signUpError.message?.toLowerCase().includes('password')) {
        throw new Error('Password does not meet requirements')
      }
      throw new Error(signUpError.message || 'Failed to create user')
    }

    if (!newUser.user) {
      throw new Error('Failed to create user')
    }

    await cleanupProfileByEmail()

    // Create profile record (attempt name column, fallback to firstname/lastname)
    type ProfileVariant = 'name' | 'firstLast'
    const insertProfile = async (variant: ProfileVariant) => {
      const payload: Record<string, any> = {
        id: newUser.user.id,
        email: trimmedEmail,
        farm_uuid: farmUuid,
        role,
        is_active: true,
      }

      if (variant === 'name') {
        payload.name = trimmedName
      } else {
        payload.firstname = firstName
        payload.lastname = lastName
      }

      return supabaseAdmin.from('profile').insert(payload).select().single()
    }

    let { data: profile, error: profileCreateError } = await insertProfile('name')

    if (profileCreateError?.message?.includes(`'name'`)) {
      console.warn('[create-user] profile.name column missing, retrying with firstname/lastname')
      const retry = await insertProfile('firstLast')
      profile = retry.data
      profileCreateError = retry.error
    }

    if (profileCreateError) {
      // If profile creation fails, try to clean up the auth user
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      } catch (cleanupError) {
        console.error('Failed to cleanup auth user:', cleanupError)
      }

      if (profileCreateError.code === '23505') {
        throw new Error('An account with this email already exists')
      }
      if (profileCreateError.code === '23503') {
        throw new Error('Invalid farm reference')
      }
      throw new Error(profileCreateError.message || 'Failed to create user profile')
    }

    const fallbackName = `${profile.firstname ?? ''} ${profile.lastname ?? ''}`.trim() || trimmedName
    const resolvedName = profile.name ?? fallbackName

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: profile.id,
          email: profile.email,
          firstname: profile.firstname ?? firstName,
          lastname: profile.lastname ?? lastName,
          name: resolvedName,
          role: profile.role,
          isActive: profile.is_active,
          createdAt: profile.created_at,
        },
        message: 'User created successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('[create-user] Failed with error:', error?.message ?? error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create user' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

