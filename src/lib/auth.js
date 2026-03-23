import { supabase } from './supabase';

export async function signInWithMagicLink(email) {
  // Check if email exists in user_profiles before sending magic link
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .single();

  if (!profile) {
    throw new Error("No account found for this email address. Contact your property manager.");
  }

  const redirectTo = window.location.origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
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
  // First try to find profile by user ID
  let { data, error } = await supabase
    .from('user_profiles')
    .select('*, residents(slug, name, property_id, unit_id, phone, email, units(number), properties(slug, name))')
    .eq('id', userId)
    .single();

  // If not found by ID, try by email (for first-time login — link the profile)
  if (error || !data) {
    const { data: byEmail } = await supabase
      .from('user_profiles')
      .select('*, residents(slug, name, property_id, unit_id, phone, email, units(number), properties(slug, name))')
      .eq('email', userEmail)
      .single();

    if (byEmail) {
      // Link the profile to this auth user
      await supabase.from('user_profiles').update({ id: userId }).eq('email', userEmail);
      data = { ...byEmail, id: userId };
    } else {
      return null; // No profile exists for this user
    }
  }

  const r = data.residents;
  return {
    role: data.role,
    email: data.email,
    displayName: data.display_name,
    residentId: data.resident_id,
    residentSlug: r?.slug || null,
    residentName: r?.name || null,
    unit: r?.units?.number || null,
    propertySlug: r?.properties?.slug || null,
    propertyName: r?.properties?.name || null,
  };
}

export async function updateUserProfile(profileId, changes) {
  const { error } = await supabase.from('user_profiles').update(changes).eq('id', profileId);
  if (error) throw error;
}

export async function deleteUserProfile(profileId) {
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
  // Insert profile row with placeholder UUID — will be linked on first sign-in via fetchProfile
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
