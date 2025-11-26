import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    })
  }

  try {
    // Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Server configuration error: Missing environment variables')
    }

    // Use service role key for admin operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    let requestBody;
    try {
      requestBody = await req.json()
    } catch (parseError) {
      throw new Error('Invalid JSON in request body')
    }

    const { email, password, name, farmName } = requestBody

    // Validate input presence
    if (!email || !password || !name || !farmName) {
      const missingFields: string[] = []
      if (!email) missingFields.push('email')
      if (!password) missingFields.push('password')
      if (!name) missingFields.push('name')
      if (!farmName) missingFields.push('farmName')
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`)
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      throw new Error('Invalid email format')
    }

    // Validate password strength
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long')
    }

    // Validate string lengths
    if (name.trim().length < 2) {
      throw new Error('Name must be at least 2 characters long')
    }

    if (farmName.trim().length < 2) {
      throw new Error('Farm name must be at least 2 characters long')
    }

    if (email.length > 255) {
      throw new Error('Email address is too long')
    }

    if (name.length > 255) {
      throw new Error('Name is too long (maximum 255 characters)')
    }

    if (farmName.length > 100) {
      throw new Error('Farm name is too long (maximum 100 characters)')
    }

    console.log('[signup] Incoming request')

    // Trim whitespace
    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim()
    const trimmedFarmName = farmName.trim()
    console.log('[signup] Sanitized input', { email: trimmedEmail, farmName: trimmedFarmName })
    
    // Split name into firstname and lastname for response convenience
    const nameParts = trimmedName.split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    const cleanupProfileByEmail = async () => {
      const { data, error } = await supabaseAdmin
        .from('profile')
        .delete()
        .ilike('email', trimmedEmail)
        .select('id')
      if (error) {
        console.error('Failed to cleanup existing profile records:', error)
        throw new Error('Unable to verify email availability. Please try again.')
      }
      if (data?.length) {
        console.log(`[signup] Removed ${data.length} leftover profile record(s) for ${trimmedEmail}`)
      }
    }

    // Create user in Supabase Auth
    const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email: trimmedEmail,
      password,
      email_confirm: true, // Auto-confirm email
    })

    if (signUpError) {
      console.error('Auth user creation error:', signUpError)
      // Provide more specific error messages
      if (signUpError.message?.includes('already registered')) {
        throw new Error('An account with this email already exists')
      }
      if (signUpError.message?.includes('password')) {
        throw new Error('Password does not meet requirements')
      }
      throw new Error(signUpError.message || 'Failed to create user account')
    }

    if (!newUser || !newUser.user) {
      throw new Error('Failed to create user account')
    }

    if (!newUser.user.id) {
      throw new Error('User created but missing user ID')
    }

    await cleanupProfileByEmail()

    // Calculate trial dates
    const trialStartDate = new Date()
    const trialEndDate = new Date()
    trialEndDate.setDate(trialEndDate.getDate() + 7) // 7-day trial

    console.log('[signup] Attempting farm insert with column farmname')

    const { data: farm, error: farmError } = await supabaseAdmin
      .from('farms')
      .insert({
        farmname: trimmedFarmName,
        subscription_status: 'trial',
        trial_start_date: trialStartDate.toISOString(),
        trial_end_date: trialEndDate.toISOString(),
      })
      .select()
      .single()

    if (farmError) {
      console.error('Farm creation error:', farmError)
      console.error('Farm error details:', JSON.stringify(farmError, null, 2))
      // If farm creation fails, try to clean up the auth user
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      } catch (cleanupError) {
        console.error('Failed to cleanup auth user:', cleanupError)
      }
      
      // Provide more specific error messages
      if (farmError.code === '23505') { // Unique constraint violation
        throw new Error('Farm name is already taken. Please choose a different name.')
      }
      if (farmError.code === '23514') { // Check constraint violation
        throw new Error('Invalid subscription status')
      }
      throw new Error(farmError.message || 'Failed to create farm')
    }

    if (!farm || !farm.farm_uuid) {
      // If farm creation fails silently, clean up auth user
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      } catch (cleanupError) {
        console.error('Failed to cleanup auth user:', cleanupError)
      }
      throw new Error('Farm created but missing farm UUID')
    }

    const { data: profile, error: profileCreateError } = await supabaseAdmin
      .from('profile')
      .insert({
        id: newUser.user.id,
        email: trimmedEmail,
        farm_uuid: farm.farm_uuid,
        firstname: firstName,
        lastname: lastName,
        role: 'Owner',
        is_active: true,
      })
      .select('id, email, farm_uuid, role, firstname, lastname')
      .single()

    if (profileCreateError) {
      console.error('Profile creation error:', profileCreateError)
      // If profile creation fails, clean up farm and auth user
      try {
        await supabaseAdmin.from('farms').delete().eq('farm_uuid', farm.farm_uuid)
      } catch (farmCleanupError) {
        console.error('Failed to cleanup farm:', farmCleanupError)
      }
      try {
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      } catch (authCleanupError) {
        console.error('Failed to cleanup auth user:', authCleanupError)
      }
      
      // Provide more specific error messages
      if (profileCreateError.code === '23505') { // Unique constraint violation
        throw new Error('An account with this email already exists')
      }
      if (profileCreateError.code === '23503') { // Foreign key violation
        throw new Error('Invalid farm reference')
      }
      if (profileCreateError.code === '23514') { // Check constraint violation
        throw new Error('Invalid role specified')
      }
      throw new Error(profileCreateError.message || 'Failed to create user profile')
    }

    if (!profile || !profile.id) {
      // If profile creation fails silently, clean up
      try {
        await supabaseAdmin.from('farms').delete().eq('farm_uuid', farm.farm_uuid)
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      } catch (cleanupError) {
        console.error('Failed to cleanup:', cleanupError)
      }
      throw new Error('Profile created but missing profile data')
    }

    const resolvedFarmName = farm.farmname ?? trimmedFarmName
    const resolvedProfileName =
      `${profile.firstname ?? ''} ${profile.lastname ?? ''}`.trim() || trimmedName

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: profile.id,
          email: profile.email,
          firstname: profile.firstname ?? firstName,
          lastname: profile.lastname ?? lastName,
          name: resolvedProfileName,
          farmUuid: profile.farm_uuid,
          farmName: resolvedFarmName,
          role: profile.role,
        },
        trial: {
          startDate: farm.trial_start_date,
          endDate: farm.trial_end_date,
        },
        message: 'Account created successfully. Your 7-day free trial has started!' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('[signup] Failed with error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create account' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})

