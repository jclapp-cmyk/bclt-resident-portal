import { supabase } from './supabase';

export async function signInWithMagicLink(email) {
  // Check if email exists using secure server-side function (no table data exposed)
  const { data: exists, error: checkErr } = await supabase.rpc('check_email_exists', { lookup_email: email });

  if (checkErr || !exists) {
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
  // Send magic link first — this creates the auth.users entry in Supabase
  const redirectTo = window.location.origin;
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (otpErr) console.warn('Invite email failed:', otpErr.message);

  // Small delay to let auth.users entry be created
  await new Promise(r => setTimeout(r, 500));

  // Create profile via SECURITY DEFINER RPC — it looks up the real auth.users ID
  const { data, error: rpcErr } = await supabase.rpc('invite_user', {
    invite_email: email,
    invite_role: role,
    invite_resident_id: residentId || null,
    invite_display_name: displayName || email.split('@')[0],
  });

  if (rpcErr) {
    // Fallback: insert with placeholder (will be linked on first login)
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
}
