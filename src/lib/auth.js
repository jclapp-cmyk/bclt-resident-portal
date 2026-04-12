import { supabase } from './supabase';

export async function signInWithMagicLink(email) {
  // C4 fix: Don't check email existence — just call signInWithOtp directly.
  // Supabase shows a generic message regardless, so no information is leaked.
  const redirectTo = window.location.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  // Always show a generic message to the caller
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function fetchProfile(userId, userEmail) {
  // RPC links the profile (swaps placeholder UUID → real auth.uid) and returns enriched data
  const { data, error } = await supabase.rpc('link_profile_on_login', {
    user_email: userEmail,
  });

  if (!error && data) {
    return {
      role: data.role,
      email: data.email,
      displayName: data.display_name,
      residentId: data.resident_id,
      residentSlug: data.resident_slug || null,
      residentName: data.resident_name || null,
      unit: data.unit_number || null,
      propertySlug: data.property_slug || null,
      propertyName: data.property_name || null,
    };
  }

  console.warn('RPC link_profile_on_login failed:', error?.message);

  // Fallback: direct query (works if profile was already linked by trigger or invite_user RPC)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, residents(name, slug, unit_number, properties(slug, name))')
    .eq('id', userId)
    .maybeSingle();

  if (profile) return mapProfileRow(profile);

  console.warn('fetchProfile: no profile found for', userEmail);
  return null;
}

function mapProfileRow(row) {
  const resident = row.residents;
  const property = resident?.properties;
  return {
    role: row.role,
    email: row.email,
    displayName: row.display_name || row.email?.split('@')[0],
    residentId: row.resident_id,
    residentSlug: resident?.slug || null,
    residentName: resident?.name || null,
    unit: resident?.unit_number || null,
    propertySlug: property?.slug || null,
    propertyName: property?.name || null,
  };
}

export async function updateUserProfile(profileId, changes) {
  const { error } = await supabase.from('user_profiles').update(changes).eq('id', profileId);
  if (error) throw error;
}

export async function deleteUserProfile(profileId) {
  // Prefer the SECURITY DEFINER RPC that also removes the auth.users entry
  const { data, error: rpcErr } = await supabase.rpc('delete_user_complete', {
    profile_id: profileId,
  });

  if (!rpcErr && data?.success) return;

  // If the RPC returned a business-logic error (e.g. not admin), throw it
  if (!rpcErr && data && !data.success) {
    throw new Error(data.error || 'delete_user_complete failed');
  }

  // Fallback: RPC doesn't exist yet (SQL not applied) — delete profile row only
  console.warn('delete_user_complete RPC unavailable, falling back to direct delete:', rpcErr?.message);
  const { error } = await supabase.from('user_profiles').delete().eq('id', profileId);
  if (error) throw error;
}

export async function fetchUserProfiles() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*, residents(name, slug)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function inviteUser(email, role, residentId, displayName) {
  let warning = null;

  // C1 fix: Call signInWithOtp first (creates auth.users entry), then RPC.
  // No sleep — if RPC fails because auth.users doesn't exist yet, fall back
  // to placeholder UUID (trigger and login RPC will handle linking later).
  const redirectTo = window.location.origin;
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });

  // C2 fix: If OTP fails, still create the profile but capture the warning
  // so the caller can show it to the user.
  if (otpErr) {
    warning = `Invite email could not be sent: ${otpErr.message}. The user profile was still created — they can request a login link manually.`;
  }

  // Create profile via SECURITY DEFINER RPC — it looks up the real auth.users ID
  const { data, error: rpcErr } = await supabase.rpc('invite_user', {
    invite_email: email,
    invite_role: role,
    invite_resident_id: residentId || null,
    invite_display_name: displayName || email.split('@')[0],
  });

  if (rpcErr) {
    // Fallback: insert with placeholder UUID (will be linked on first login)
    console.warn('invite_user RPC failed, using fallback:', rpcErr.message);
    const placeholderId = crypto.randomUUID();
    const { error: insertErr } = await supabase.from('user_profiles').insert({
      id: placeholderId,
      email,
      role,
      resident_id: residentId || null,
      display_name: displayName || email.split('@')[0],
    });
    if (insertErr) throw insertErr;
  }

  return { warning };
}
