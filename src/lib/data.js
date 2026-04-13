import { supabase } from './supabase';

// ── PROPERTIES ──

export async function fetchProperties() {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('name');
  if (error) throw error;
  return data.map(p => ({
    id: p.slug,
    _uuid: p.id,
    name: p.name,
    address: [p.street, p.city, p.state, p.zip].filter(Boolean).join(', ') || p.address || '',
    street: p.street || p.address || '',
    city: p.city || '',
    state: p.state || 'CA',
    zip: p.zip || '',
    type: p.type,
    yearBuilt: p.year_built,
    lastRenovation: p.last_renovation,
    totalUnits: p.total_units,
    unitBreakdown: p.unit_breakdown,
    totalSF: p.total_sf,
    commonAreaSF: p.common_area_sf,
    lotSize: p.lot_size,
    adaUnits: p.ada_units,
    manager: p.manager,
    managerPhone: p.manager_phone,
    managerEmail: p.manager_email,
    officeHours: p.office_hours,
    documents: p.documents || [],
  }));
}

export async function insertProperty(prop) {
  const slug = prop.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + '-' + Math.random().toString(36).slice(2, 6);
  const { data, error } = await supabase.from('properties').insert({
    slug,
    name: prop.name,
    address: [prop.street, prop.city, prop.state, prop.zip].filter(Boolean).join(', ') || prop.address || '',
    street: prop.street || '',
    city: prop.city || '',
    state: prop.state || 'CA',
    zip: prop.zip || '',
    type: prop.type || '',
    year_built: prop.yearBuilt || null,
    total_units: prop.totalUnits || 0,
    unit_breakdown: prop.unitBreakdown || {},
    total_sf: prop.totalSF || 0,
    common_area_sf: prop.commonAreaSF || 0,
    lot_size: prop.lotSize || '',
    ada_units: prop.adaUnits || 0,
    manager: prop.manager || '',
    manager_phone: prop.managerPhone || '',
    manager_email: prop.managerEmail || '',
    office_hours: prop.officeHours || '',
    documents: [],
  }).select().single();
  if (error) throw error;
  return { id: data.slug, _uuid: data.id, ...prop, documents: [] };
}

export async function insertUnit(unit, propertyUuid) {
  const row = {
    property_id: propertyUuid,
    number: unit.number,
    bedrooms: unit.bedrooms || 1,
    bathrooms: unit.bathrooms || 1,
    sqft: unit.sqft || 0,
    floor_plan: unit.floorPlan || '',
  };
  if (unit.is_rv !== undefined) row.is_rv = unit.is_rv;
  if (unit.rv_info !== undefined) row.rv_info = unit.rv_info;
  const { data, error } = await supabase.from('units').insert(row).select().single();
  if (error) throw error;
  // Update property total_units count
  const { count } = await supabase.from('units').select('*', { count: 'exact', head: true }).eq('property_id', propertyUuid);
  await supabase.from('properties').update({ total_units: count || 1 }).eq('id', propertyUuid);
  return { _uuid: data.id, number: data.number, bedrooms: data.bedrooms, bathrooms: data.bathrooms, sqft: data.sqft, is_rv: data.is_rv || false, rv_info: data.rv_info || {} };
}

export async function updateProperty(propUuid, changes) {
  const mapped = {};
  if (changes.name !== undefined) mapped.name = changes.name;
  if (changes.street !== undefined) mapped.street = changes.street;
  if (changes.city !== undefined) mapped.city = changes.city;
  if (changes.state !== undefined) mapped.state = changes.state;
  if (changes.zip !== undefined) mapped.zip = changes.zip;
  if (changes.street !== undefined || changes.city !== undefined || changes.state !== undefined || changes.zip !== undefined) {
    mapped.address = [changes.street, changes.city, changes.state, changes.zip].filter(Boolean).join(', ');
  }
  if (changes.address !== undefined && !changes.street) mapped.address = changes.address;
  if (changes.type !== undefined) mapped.type = changes.type;
  if (changes.totalUnits !== undefined) mapped.total_units = changes.totalUnits;
  if (changes.totalSF !== undefined) mapped.total_sf = changes.totalSF;
  if (changes.manager !== undefined) mapped.manager = changes.manager;
  if (changes.managerPhone !== undefined) mapped.manager_phone = changes.managerPhone;
  if (changes.managerEmail !== undefined) mapped.manager_email = changes.managerEmail;
  if (changes.officeHours !== undefined) mapped.office_hours = changes.officeHours;
  if (changes.lotSize !== undefined) mapped.lot_size = changes.lotSize;
  if (changes.adaUnits !== undefined) mapped.ada_units = changes.adaUnits;
  if (changes.yearBuilt !== undefined) mapped.year_built = changes.yearBuilt;
  const { error } = await supabase.from('properties').update(mapped).eq('id', propUuid);
  if (error) throw error;
}

export async function updateUnit(unitUuid, changes) {
  const mapped = {};
  if (changes.number !== undefined) mapped.number = changes.number;
  if (changes.bedrooms !== undefined) mapped.bedrooms = changes.bedrooms;
  if (changes.bathrooms !== undefined) mapped.bathrooms = changes.bathrooms;
  if (changes.sqft !== undefined) mapped.sqft = changes.sqft;
  if (changes.floorPlan !== undefined) mapped.floor_plan = changes.floorPlan;
  if (changes.is_rv !== undefined) mapped.is_rv = changes.is_rv;
  if (changes.rv_info !== undefined) mapped.rv_info = changes.rv_info;
  const { error } = await supabase.from('units').update(mapped).eq('id', unitUuid);
  if (error) throw error;
}

export async function deleteUnit(unitUuid) {
  const { error } = await supabase.from('units').delete().eq('id', unitUuid);
  if (error) throw error;
}

export async function deleteProperty(propertyUuid) {
  // Cascade delete in dependency order.
  // Note: DB should have ON DELETE CASCADE for most FKs, but we explicitly
  // delete residents and units to ensure dependent records (leases,
  // lease_documents, household_members, rent_payments, income_certifications,
  // onboarding_workflows, user_profiles, etc.) are cleaned up.
  try {
    // 1. Delete maintenance requests referencing this property
    await supabase.from('maintenance_requests').delete().eq('property_id', propertyUuid);

    // 2. Get resident IDs for this property (needed for dependent tables)
    const { data: residents } = await supabase.from('residents').select('id').eq('property_id', propertyUuid);
    const residentIds = (residents || []).map(r => r.id);

    if (residentIds.length > 0) {
      // 3. Delete onboarding workflows for these residents
      await supabase.from('onboarding_workflows').delete().in('resident_id', residentIds);
      // 4. Delete user_profiles for these residents (if table exists)
      await supabase.from('user_profiles').delete().in('resident_id', residentIds).then(() => {}, () => {});
    }

    // 5. Delete residents (cascades to leases, lease_documents, household_members, etc.)
    await supabase.from('residents').delete().eq('property_id', propertyUuid);

    // 6. Delete units
    await supabase.from('units').delete().eq('property_id', propertyUuid);

    // 7. Delete the property itself
    const { error } = await supabase.from('properties').delete().eq('id', propertyUuid);
    if (error) throw error;
  } catch (err) {
    console.error('deleteProperty cascade error:', err);
    throw err;
  }
}

export async function fetchUnits(propertyUuid) {
  const { data, error } = await supabase
    .from('units')
    .select('*')
    .eq('property_id', propertyUuid)
    .order('number');
  if (error) throw error;
  return data;
}

export async function fetchAllUnits() {
  const { data, error } = await supabase
    .from('units')
    .select('*, properties(slug, name)')
    .order('number');
  if (error) throw error;
  return (data || []).map(u => ({
    _uuid: u.id,
    number: u.number,
    propertyId: u.properties?.slug || '',
    propertyName: u.properties?.name || '',
    bedrooms: u.bedrooms,
    bathrooms: u.bathrooms,
    sqft: u.sqft,
    is_rv: u.is_rv || false,
  }));
}

// ── RESIDENTS (with property slug + unit number) ──

export async function fetchResidents() {
  const { data, error } = await supabase
    .from('residents')
    .select('*, units(number), properties(slug)')
    .order('name');
  if (error) throw error;
  return data.map(r => ({
    id: r.slug,
    _uuid: r.id,
    propertyId: r.properties?.slug || '',
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.name,
    firstName: r.first_name || r.name?.split(' ')[0] || '',
    lastName: r.last_name || r.name?.split(' ').slice(1).join(' ') || '',
    unit: r.units?.number || '',
    unitId: r.unit_id || null,
    phone: r.phone,
    email: r.email,
    preferredChannel: r.preferred_channel,
    mailingStreet: r.mailing_street || '',
    mailingCity: r.mailing_city || '',
    mailingState: r.mailing_state || '',
    mailingZip: r.mailing_zip || '',
    mailingAddress: [r.mailing_street, r.mailing_city, r.mailing_state, r.mailing_zip].filter(Boolean).join(', '),
  }));
}

// ── RESIDENTS EXTENDED (keyed by slug, includes lease data) ──

export async function fetchResidentsExtended() {
  const { data, error } = await supabase
    .from('residents')
    .select('slug, status, move_in_date, properties(slug), units(number, bedrooms), leases(start_date, end_date, rent_amount, tenant_portion, hap_payment, status, lease_type)')
    .order('name');
  if (error) throw error;
  const result = {};
  for (const r of data) {
    // Pick the active lease, or the most recent one
    const lease = r.leases?.find(l => l.status === 'active') || r.leases?.[0];
    result[r.slug] = {
      propertyId: r.properties?.slug || '',
      unit: r.units?.number || '',
      leaseStart: lease?.start_date || null,
      leaseEnd: lease?.end_date || null,
      leaseType: lease?.lease_type || "fixed",
      rentAmount: lease ? Number(lease.rent_amount) : 0,
      tenantPortion: lease ? Number(lease.tenant_portion) : 0,
      hapPayment: lease ? Number(lease.hap_payment) : 0,
      bedrooms: r.units?.bedrooms || 0,
      moveIn: r.move_in_date,
      status: r.status,
    };
  }
  return result;
}

// ── LEASE DOCUMENTS (keyed by resident slug) ──

export async function fetchLeaseDocsByResident() {
  const { data, error } = await supabase
    .from('lease_documents')
    .select('*, residents(slug)')
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  const result = {};
  for (const d of data) {
    const slug = d.residents?.slug;
    if (!slug) continue;
    if (!result[slug]) result[slug] = [];
    result[slug].push({
      id: d.id,
      name: d.name,
      type: d.type,
      size: d.size,
      uploadedAt: d.uploaded_at,
      uploadedBy: d.uploaded_by,
      storagePath: d.storage_path,
    });
  }
  return result;
}

// ── WRITES ──

export async function insertResident(resident, propertyUuid, unitUuid) {
  const baseSlug = resident.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  // Always generate unique slug with random suffix — retry on collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = baseSlug + '-' + Math.random().toString(36).slice(2, 7);
    const { data, error } = await supabase.from('residents').insert({
      slug,
      property_id: propertyUuid,
      unit_id: unitUuid,
      name: resident.name,
      first_name: resident.firstName || resident.name?.split(' ')[0] || '',
      last_name: resident.lastName || resident.name?.split(' ').slice(1).join(' ') || '',
      phone: resident.phone,
      email: resident.email,
      preferred_channel: resident.preferredChannel || 'email',
      mailing_street: resident.mailingStreet || null,
      mailing_city: resident.mailingCity || null,
      mailing_state: resident.mailingState || null,
      mailing_zip: resident.mailingZip || null,
      status: resident.status || 'active',
      move_in_date: resident.moveInDate || null,
    }).select().single();
    if (!error) return data;
    if (!error?.message?.includes('slug') || attempt === 2) throw error;
  }
}

export async function updateResident(residentUuid, changes) {
  const mapped = {};
  if (changes.name !== undefined) mapped.name = changes.name;
  if (changes.phone !== undefined) mapped.phone = changes.phone;
  if (changes.email !== undefined) mapped.email = changes.email;
  if (changes.preferredChannel !== undefined) mapped.preferred_channel = changes.preferredChannel;
  if (changes.smsConsent !== undefined) mapped.sms_consent = changes.smsConsent;
  if (changes.mailingStreet !== undefined) mapped.mailing_street = changes.mailingStreet;
  if (changes.mailingCity !== undefined) mapped.mailing_city = changes.mailingCity;
  if (changes.mailingState !== undefined) mapped.mailing_state = changes.mailingState;
  if (changes.mailingZip !== undefined) mapped.mailing_zip = changes.mailingZip;
  if (changes.status !== undefined) mapped.status = changes.status;
  const { error } = await supabase.from('residents').update(mapped).eq('id', residentUuid);
  if (error) throw error;
}

export async function updateLease(leaseUuid, changes) {
  const mapped = {};
  if (changes.startDate !== undefined) mapped.start_date = changes.startDate;
  if (changes.endDate !== undefined) mapped.end_date = changes.endDate || null;
  if (changes.rentAmount !== undefined) mapped.rent_amount = changes.rentAmount;
  if (changes.tenantPortion !== undefined) mapped.tenant_portion = changes.tenantPortion;
  if (changes.hapPayment !== undefined) mapped.hap_payment = changes.hapPayment;
  if (changes.leaseType !== undefined) mapped.lease_type = changes.leaseType;
  const { error } = await supabase.from('leases').update(mapped).eq('id', leaseUuid);
  if (error) throw error;
}

export async function fetchResidentLease(residentUuid) {
  const { data } = await supabase.from('leases').select('*').eq('resident_id', residentUuid).eq('status', 'active').single();
  return data;
}

export async function insertLease(lease, residentUuid, unitUuid) {
  const resId = lease.residentId || residentUuid;
  const uId = lease.unitId || unitUuid || null;
  const { data, error } = await supabase.from('leases').insert({
    resident_id: resId,
    unit_id: uId,
    start_date: lease.startDate || null,
    end_date: lease.endDate || null,
    rent_amount: lease.rentAmount || 0,
    tenant_portion: lease.tenantPortion || 0,
    hap_payment: lease.hapPayment || 0,
    lease_type: lease.leaseType || 'fixed',
    status: 'active',
  }).select().single();
  if (error) throw error;
  return data;
}

export async function insertLeaseDocument(doc, residentUuid) {
  const { error } = await supabase.from('lease_documents').insert({
    resident_id: residentUuid,
    name: doc.name,
    type: doc.type,
    size: doc.size,
    uploaded_by: doc.uploadedBy || 'Admin',
    storage_path: doc.storagePath || null,
  });
  if (error) throw error;
}

export async function deleteLeaseDocument(docId) {
  const { error } = await supabase.from('lease_documents').delete().eq('id', docId);
  if (error) throw error;
}

// ── MESSAGE THREADS ──

export async function fetchThreads() {
  const { data, error } = await supabase.from('message_threads').select('*').order('last_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(t => ({
    id: t.code, _uuid: t.id, participants: t.participants || [],
    subject: t.subject, lastMessage: t.last_message, lastDate: t.last_date,
    unread: t.unread, channel: t.channel, type: t.type, priority: t.priority,
  }));
}

export async function fetchMessages() {
  const { data, error } = await supabase.from('messages').select('*, message_threads(code)').order('sent_at');
  if (error) throw error;
  return (data || []).map(m => ({
    id: m.code, _uuid: m.id, threadId: m.message_threads?.code || '',
    from: m.sender, body: m.body, date: m.sent_at, status: m.status,
  }));
}

export async function insertThread(t) {
  const { data, error } = await supabase.from('message_threads').insert({
    code: t.id || `THR-${Date.now()}`, participants: t.participants || [],
    subject: t.subject, last_message: t.lastMessage || '', last_date: t.lastDate || new Date().toISOString(),
    unread: t.unread || 0, channel: t.channel || 'email', type: t.type || 'direct', priority: t.priority || null,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function insertMessage(msg) {
  const { data: thread } = await supabase.from('message_threads').select('id').eq('code', msg.threadId).single();
  const { data, error } = await supabase.from('messages').insert({
    code: msg.id || `MSG-${Date.now()}`, thread_id: thread?.id,
    sender: msg.from, body: msg.body, sent_at: msg.date || new Date().toISOString(), status: msg.status || 'delivered',
  }).select().single();
  if (error) throw error;
  // Update thread's last message
  await supabase.from('message_threads').update({ last_message: msg.body, last_date: msg.date || new Date().toISOString() }).eq('code', msg.threadId);
  return data;
}

export async function updateThread(code, changes) {
  const updateData = {};
  if (changes.unread !== undefined) updateData.unread = changes.unread;
  if (changes.lastMessage !== undefined) updateData.last_message = changes.lastMessage;
  if (changes.lastDate !== undefined) updateData.last_date = changes.lastDate;
  const { error } = await supabase.from('message_threads').update(updateData).eq('code', code);
  if (error) throw error;
}

export async function deleteThread(code) {
  // Get the thread UUID from code
  const { data: thread, error: findErr } = await supabase.from('message_threads').select('id').eq('code', code).single();
  if (findErr) console.warn('Find thread failed:', findErr);
  if (thread) {
    // Delete messages first (FK constraint)
    const { error: msgErr } = await supabase.from('messages').delete().eq('thread_id', thread.id);
    if (msgErr) console.warn('Delete messages failed:', msgErr);
    // Delete the thread
    const { error: thrErr } = await supabase.from('message_threads').delete().eq('id', thread.id);
    if (thrErr) console.warn('Delete thread failed:', thrErr);
  }
}

export async function fetchCommTemplates() {
  const { data, error } = await supabase.from('comm_templates').select('*').order('name');
  if (error) throw error;
  return (data || []).map(t => ({
    id: t.code, name: t.name, channel: t.channel, subject: t.subject || undefined, body: t.body,
  }));
}

// ── AUDIT LOG ──

export async function fetchAuditLog(limit = 50) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(a => ({
    id: a.id, table: a.table_name, recordId: a.record_id,
    action: a.action, changedBy: a.changed_by_email || 'System',
    oldData: a.old_data, newData: a.new_data, createdAt: a.created_at,
  }));
}

// ── FILE STORAGE (Lease Documents) ──

export async function uploadLeaseFile(file, residentSlug) {
  const path = `${residentSlug}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from('lease-documents').upload(path, file);
  if (error) throw error;
  return path;
}

export async function getLeaseFileUrl(path) {
  const { data } = await supabase.storage.from('lease-documents').createSignedUrl(path, 3600); // 1hr
  return data?.signedUrl || null;
}

export async function deleteLeaseFile(path) {
  const { error } = await supabase.storage.from('lease-documents').remove([path]);
  if (error) throw error;
}

// ── INSPECTION ATTACHMENTS (dedicated inspection-attachments bucket) ──

export async function uploadInspectionAttachment(file, checklistId, itemKey) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${checklistId}/${itemKey}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from('inspection-attachments').upload(path, file);
  if (error) throw error;
  return { path, name: file.name };
}

export async function getInspectionAttachmentUrl(path) {
  const { data } = await supabase.storage.from('inspection-attachments').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

export async function deleteInspectionAttachment(path) {
  const { error } = await supabase.storage.from('inspection-attachments').remove([path]);
  if (error) throw error;
}

// ── VENDORS ──

export async function fetchVendors() {
  const { data, error } = await supabase.from('vendors').select('*').order('company');
  if (error) throw error;
  return (data || []).map(v => ({
    id: v.id, company: v.company, contact: v.contact, phone: v.phone, email: v.email,
    trade: v.trade, license: v.license, licenseExp: v.license_exp, insured: v.insured,
    coiExp: v.coi_exp, active: v.active, notes: v.notes || '',
  }));
}

export async function insertVendor(v) {
  const { data, error } = await supabase.from('vendors').insert({
    company: v.company, contact: v.contact, phone: v.phone, email: v.email,
    trade: v.trade, license: v.license, license_exp: v.licenseExp,
    insured: v.insured !== false, coi_exp: v.coiExp || null,
    active: v.active !== false, notes: v.notes || '',
  }).select().single();
  if (error) throw error;
  return { ...data, id: data.id, licenseExp: data.license_exp, coiExp: data.coi_exp };
}

export async function updateVendor(vendorUuid, changes) {
  const mapped = {};
  if (changes.company !== undefined) mapped.company = changes.company;
  if (changes.contact !== undefined) mapped.contact = changes.contact;
  if (changes.trade !== undefined) mapped.trade = changes.trade;
  if (changes.phone !== undefined) mapped.phone = changes.phone;
  if (changes.email !== undefined) mapped.email = changes.email;
  if (changes.license !== undefined) mapped.license = changes.license;
  if (changes.licenseExp !== undefined) mapped.license_exp = changes.licenseExp;
  if (changes.insured !== undefined) mapped.insured = changes.insured;
  if (changes.coiExp !== undefined) mapped.coi_exp = changes.coiExp;
  if (changes.active !== undefined) mapped.active = changes.active;
  if (changes.notes !== undefined) mapped.notes = changes.notes;
  const { error } = await supabase.from('vendors').update(mapped).eq('id', vendorUuid);
  if (error) throw error;
}

// ── UNIT INSPECTIONS ──

export async function fetchUnitInspections() {
  const { data, error } = await supabase
    .from('unit_inspections')
    .select('*, properties(slug), units(number)')
    .order('inspection_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(i => ({
    id: i.code, _uuid: i.id, propertyId: i.properties?.slug || '', unit: i.units?.number || '',
    category: i.category, date: i.inspection_date, inspector: i.inspector,
    result: i.result, score: i.score,
    failedItems: Array.isArray(i.failed_items) ? i.failed_items : (typeof i.failed_items === 'string' ? (() => { try { return JSON.parse(i.failed_items); } catch { return []; } })() : []),
    notes: i.notes || '',
  }));
}

export async function insertUnitInspection(insp) {
  let { data: prop } = await supabase.from('properties').select('id').eq('slug', insp.propertyId || 'wharf').maybeSingle();
  if (!prop) {
    const { data: fallback } = await supabase.from('properties').select('id').limit(1).single();
    if (!fallback) throw new Error('No properties found');
    prop = fallback;
  }
  const { data: unitRow } = await supabase.from('units').select('id').eq('number', insp.unit).eq('property_id', prop.id).maybeSingle();
  const code = `UI-${Date.now().toString(36)}`;
  const { data, error } = await supabase.from('unit_inspections').insert({
    code, property_id: prop.id, unit_id: unitRow?.id || null,
    category: insp.category, inspection_date: insp.date, inspector: insp.inspector || 'Mike R.',
    result: insp.result || 'Pass', score: insp.score || null,
    failed_items: insp.failedItems || [], notes: insp.notes || '',
  }).select().single();
  if (error) throw error;
  return { ...insp, id: code, _uuid: data.id };
}

export async function updateUnitInspection(code, changes) {
  const mapped = {};
  if (changes.result !== undefined) mapped.result = changes.result;
  if (changes.score !== undefined) mapped.score = changes.score;
  if (changes.failedItems !== undefined) mapped.failed_items = changes.failedItems;
  if (changes.notes !== undefined) mapped.notes = changes.notes;
  if (changes.date !== undefined) mapped.inspection_date = changes.date;
  if (changes.inspector !== undefined) mapped.inspector = changes.inspector;
  const { error } = await supabase.from('unit_inspections').update(mapped).eq('code', code);
  if (error) throw error;
}

// ── REGULATORY INSPECTIONS ──

export async function fetchRegInspections() {
  const { data, error } = await supabase
    .from('reg_inspections')
    .select('*, properties(slug)')
    .order('next_due');
  if (error) throw error;
  return (data || []).map(i => ({
    id: i.code, _uuid: i.id, propertyId: i.properties?.slug || '',
    type: i.type, authority: i.authority, date: i.inspection_date,
    result: i.result, score: i.score, nextDue: i.next_due,
    units: i.units_inspected, deficiencies: i.deficiencies,
  }));
}

// ── MAINTENANCE REQUESTS ──

export async function fetchMaintenanceRequests() {
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select('*, residents(slug), properties(slug), units(number)')
    .order('submitted_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(m => ({
    id: m.code,
    _uuid: m.id,
    propertyId: m.properties?.slug || '',
    unit: m.units?.number || '',
    category: m.category,
    priority: m.priority,
    status: m.status,
    description: m.description,
    submitted: m.submitted_date,
    assignedTo: m.assigned_to,
    queuePos: m.queue_pos,
    projectedComplete: m.projected_complete,
    completedDate: m.completed_date,
    notes: Array.isArray(m.notes) ? m.notes : (typeof m.notes === 'string' ? (() => { try { return JSON.parse(m.notes); } catch { return []; } })() : []),
  }));
}

export async function insertMaintenanceRequest({ unit, category, priority, description, propertySlug }) {
  // Look up unit row (includes property_id)
  // Look up property first so we can scope the unit lookup
  let propertyId = null;
  if (propertySlug) {
    const { data: prop } = await supabase.from('properties').select('id').eq('slug', propertySlug).single();
    propertyId = prop?.id || null;
  }
  if (!propertyId) {
    // Last resort: grab first property
    const { data: firstProp } = await supabase.from('properties').select('id').limit(1).single();
    propertyId = firstProp?.id || null;
  }

  // Look up unit row scoped to property to avoid cross-property collisions
  let unitQuery = supabase.from('units').select('id, property_id').eq('number', unit);
  if (propertyId) unitQuery = unitQuery.eq('property_id', propertyId);
  const { data: unitRow } = await unitQuery.limit(1).single();

  // If we didn't have propertyId yet, use the unit's property_id
  if (!propertyId && unitRow?.property_id) {
    propertyId = unitRow.property_id;
  }

  // Look up resident by unit
  const { data: resident } = await supabase.from('residents').select('id').eq('unit_id', unitRow?.id).limit(1).single();

  // Generate code with timestamp to avoid collisions
  const code = `MR-${Date.now().toString(36)}`;

  const { data, error } = await supabase.from('maintenance_requests').insert({
    code,
    resident_id: resident?.id || null,
    property_id: propertyId,
    unit_id: unitRow?.id || null,
    category,
    priority,
    status: 'submitted',
    description,
    assigned_to: null,
  }).select().single();
  if (error) throw error;
  return { ...data, id: data.code };
}

export async function updateMaintenanceRequest(code, changes) {
  const updateData = {};
  if (changes.status !== undefined) updateData.status = changes.status;
  if (changes.assignedTo !== undefined) updateData.assigned_to = changes.assignedTo || null;
  if (changes.completedDate !== undefined) updateData.completed_date = changes.completedDate;
  if (changes.projectedComplete !== undefined) updateData.projected_complete = changes.projectedComplete;
  if (changes.queuePos !== undefined) updateData.queue_pos = changes.queuePos;
  if (changes.notes !== undefined) updateData.notes = JSON.stringify(changes.notes);
  updateData.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('maintenance_requests')
    .update(updateData)
    .eq('code', code);
  if (error) throw error;
}

// ── COMPLIANCE DOCS ──

export async function fetchComplianceDocs() {
  const { data, error } = await supabase
    .from('compliance_docs')
    .select('*, properties(slug), residents(slug)')
    .order('created_at');
  if (error) throw error;
  return (data || []).map(d => ({
    propertyId: d.properties?.slug || '', residentId: d.residents?.slug || '',
    unit: d.unit, docType: d.doc_type, status: d.status,
    expires: d.expires, lastUploaded: d.last_uploaded,
  }));
}

// ── ONBOARDING WORKFLOWS ──

export async function fetchOnboardingWorkflows() {
  const { data, error } = await supabase
    .from('onboarding_workflows')
    .select('*, properties(slug), residents(slug)')
    .order('created_at');
  if (error) throw error;
  return (data || []).map(o => ({
    id: o.code, _uuid: o.id, propertyId: o.properties?.slug || '',
    residentId: o.residents?.slug || '', type: o.type, status: o.status,
    startDate: o.start_date, targetDate: o.target_date, steps: o.steps || {},
  }));
}

export async function insertOnboardingWorkflow(w) {
  const { data: prop } = await supabase.from('properties').select('id').eq('slug', w.propertyId || 'wharf').single();
  const { data: resident } = await supabase.from('residents').select('id').eq('slug', w.residentId).single();
  const code = `OB-${Date.now().toString(36)}`;
  const { data, error } = await supabase.from('onboarding_workflows').insert({
    code, property_id: prop?.id, resident_id: resident?.id,
    type: w.type, status: w.status || 'not-started',
    start_date: w.startDate, target_date: w.targetDate || null,
    steps: JSON.stringify(w.steps),
  }).select().single();
  if (error) throw error;
  return { ...w, id: code, _uuid: data.id };
}

export async function updateOnboardingWorkflow(code, changes) {
  const updateData = { updated_at: new Date().toISOString() };
  if (changes.status !== undefined) updateData.status = changes.status;
  if (changes.steps !== undefined) updateData.steps = JSON.stringify(changes.steps);
  const { error } = await supabase.from('onboarding_workflows').update(updateData).eq('code', code);
  if (error) throw error;
}

// ── RENT LEDGER (computed view) ──

export async function fetchRentLedger() {
  const { data, error } = await supabase
    .from('rent_ledger')
    .select('*');
  if (error) throw error;
  return (data || []).map(r => ({
    propertyId: r.property_id,
    residentId: r.resident_id,
    unit: r.unit,
    name: r.name,
    rentDue: Number(r.rent_due),
    tenantPortion: Number(r.tenant_portion),
    hapPayment: Number(r.hap_payment),
    tenantPaid: Number(r.tenant_paid),
    hapReceived: Number(r.hap_received),
    balance: Number(r.balance),
    status: r.status,
    month: r.month || new Date().toISOString().slice(0, 7),
  }));
}

// ── RENT PAYMENTS ──

export async function fetchRentPayments(month) {
  let query = supabase
    .from('rent_payments')
    .select('*, residents(slug, name, units(number)), properties(slug)')
    .order('payment_date', { ascending: false });
  if (month) query = query.eq('month', month);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(p => ({
    id: p.id,
    residentId: p.residents?.slug,
    residentName: p.residents?.name,
    unit: p.residents?.units?.number,
    propertyId: p.properties?.slug,
    amount: Number(p.amount),
    method: p.method,
    paymentDate: p.payment_date,
    month: p.month,
    note: p.note,
    recordedBy: p.recorded_by,
    createdAt: p.created_at,
  }));
}

export async function recordPayment({ residentSlug, amount, method, paymentDate, month, note }) {
  // Look up resident UUID from slug
  const { data: resident } = await supabase
    .from('residents')
    .select('id, property_id')
    .eq('slug', residentSlug)
    .single();
  if (!resident) throw new Error('Resident not found');

  const { data, error } = await supabase.from('rent_payments').insert({
    resident_id: resident.id,
    property_id: resident.property_id,
    amount,
    method,
    payment_date: paymentDate,
    month: month || paymentDate?.slice(0, 7) || new Date().toISOString().slice(0, 7),
    note: note || null,
    recorded_by: 'Admin',
  }).select().single();
  if (error) throw error;
  return data;
}

// ── HOUSEHOLD MEMBERS ──

export async function fetchHouseholdMembers(residentUuid) {
  const { data, error } = await supabase
    .from('household_members')
    .select('*')
    .eq('resident_id', residentUuid)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function insertHouseholdMember(member) {
  const { data, error } = await supabase.from('household_members').insert({
    resident_id: member.residentId,
    name: member.name,
    relationship: member.relationship || 'Spouse',
    phone: member.phone || null,
    email: member.email || null,
    date_of_birth: member.dob || null,
    is_adult: member.isAdult !== false,
    notes: member.notes || null,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteHouseholdMember(id) {
  const { error } = await supabase.from('household_members').delete().eq('id', id);
  if (error) throw error;
}

// ── STAFF MEMBERS ──

export async function fetchStaffMembers() {
  const { data, error } = await supabase
    .from('staff_members')
    .select('*, properties(name)')
    .order('name');
  if (error) throw error;
  return (data || []).map(s => ({
    id: s.id,
    name: s.name,
    role: s.role,
    email: s.email,
    phone: s.phone,
    propertyId: s.property_id,
    propertyName: s.properties?.name || null,
    active: s.active,
  }));
}

export async function insertStaffMember(staff) {
  const { data, error } = await supabase.from('staff_members').insert({
    name: staff.name,
    role: staff.role || 'maintenance',
    email: staff.email || null,
    phone: staff.phone || null,
    property_id: staff.propertyId || null,
    active: true,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateStaffMember(id, changes) {
  const mapped = {};
  if (changes.name !== undefined) mapped.name = changes.name;
  if (changes.role !== undefined) mapped.role = changes.role;
  if (changes.email !== undefined) mapped.email = changes.email;
  if (changes.phone !== undefined) mapped.phone = changes.phone;
  if (changes.propertyId !== undefined) mapped.property_id = changes.propertyId;
  if (changes.active !== undefined) mapped.active = changes.active;
  const { error } = await supabase.from('staff_members').update(mapped).eq('id', id);
  if (error) throw error;
}

export async function deleteStaffMember(id) {
  const { error } = await supabase.from('staff_members').delete().eq('id', id);
  if (error) throw error;
}

// ── INCOME CERTIFICATIONS ──

export async function fetchIncomeCertifications(propertyFilter) {
  let q = supabase.from('income_certifications').select('*, residents(name, slug, units(number), properties(name, slug))').order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.id, residentId: c.resident_id,
    residentName: c.residents?.name, residentSlug: c.residents?.slug,
    unit: c.residents?.units?.number, propertyName: c.residents?.properties?.name, propertySlug: c.residents?.properties?.slug,
    certType: c.cert_type, effectiveDate: c.effective_date, status: c.status,
    stepsCompleted: c.steps_completed || {},
    householdSize: c.household_size, totalAnnualIncome: Number(c.total_annual_income || 0),
    totalAssetValue: Number(c.total_asset_value || 0), totalAssetIncome: Number(c.total_asset_income || 0),
    imputedAssetIncome: Number(c.imputed_asset_income || 0), incomeForDetermination: Number(c.income_for_determination || 0),
    amiPercentage: c.ami_percentage ? Number(c.ami_percentage) : null, amiCategory: c.ami_category, incomeEligible: c.income_eligible,
    tenantRent: Number(c.tenant_rent || 0), utilityAllowance: Number(c.utility_allowance || 0), grossRent: Number(c.gross_rent || 0),
    hapPayment: Number(c.hap_payment || 0), rentLimit: c.rent_limit ? Number(c.rent_limit) : null, rentCompliant: c.rent_compliant,
    programType: c.program_type, allStudentHousehold: c.all_student_household,
    residentSignature: c.resident_signature, residentSignedAt: c.resident_signed_at,
    adminSignature: c.admin_signature, adminSignedAt: c.admin_signed_at, adminSignerName: c.admin_signer_name,
    demographics: c.demographics, createdAt: c.created_at, updatedAt: c.updated_at,
  }));
}

export async function insertIncomeCertification(cert) {
  const { data, error } = await supabase.from('income_certifications').insert({
    resident_id: cert.residentId, cert_type: cert.certType || 'annual',
    effective_date: cert.effectiveDate || new Date().toISOString().slice(0, 10),
    status: 'draft', steps_completed: cert.stepsCompleted || {},
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateIncomeCertification(id, changes) {
  const mapped = {};
  if (changes.status !== undefined) mapped.status = changes.status;
  if (changes.stepsCompleted !== undefined) mapped.steps_completed = changes.stepsCompleted;
  if (changes.householdSize !== undefined) mapped.household_size = changes.householdSize;
  if (changes.totalAnnualIncome !== undefined) mapped.total_annual_income = changes.totalAnnualIncome;
  if (changes.totalAssetValue !== undefined) mapped.total_asset_value = changes.totalAssetValue;
  if (changes.totalAssetIncome !== undefined) mapped.total_asset_income = changes.totalAssetIncome;
  if (changes.imputedAssetIncome !== undefined) mapped.imputed_asset_income = changes.imputedAssetIncome;
  if (changes.incomeForDetermination !== undefined) mapped.income_for_determination = changes.incomeForDetermination;
  if (changes.amiPercentage !== undefined) mapped.ami_percentage = changes.amiPercentage;
  if (changes.amiCategory !== undefined) mapped.ami_category = changes.amiCategory;
  if (changes.incomeEligible !== undefined) mapped.income_eligible = changes.incomeEligible;
  if (changes.tenantRent !== undefined) mapped.tenant_rent = changes.tenantRent;
  if (changes.utilityAllowance !== undefined) mapped.utility_allowance = changes.utilityAllowance;
  if (changes.grossRent !== undefined) mapped.gross_rent = changes.grossRent;
  if (changes.hapPayment !== undefined) mapped.hap_payment = changes.hapPayment;
  if (changes.rentLimit !== undefined) mapped.rent_limit = changes.rentLimit;
  if (changes.rentCompliant !== undefined) mapped.rent_compliant = changes.rentCompliant;
  if (changes.programType !== undefined) mapped.program_type = changes.programType;
  if (changes.allStudentHousehold !== undefined) mapped.all_student_household = changes.allStudentHousehold;
  if (changes.studentExemption !== undefined) mapped.student_exemption = changes.studentExemption;
  if (changes.residentSignature !== undefined) mapped.resident_signature = changes.residentSignature;
  if (changes.residentSignedAt !== undefined) mapped.resident_signed_at = changes.residentSignedAt;
  if (changes.adminSignature !== undefined) mapped.admin_signature = changes.adminSignature;
  if (changes.adminSignedAt !== undefined) mapped.admin_signed_at = changes.adminSignedAt;
  if (changes.adminSignerName !== undefined) mapped.admin_signer_name = changes.adminSignerName;
  if (changes.demographics !== undefined) mapped.demographics = changes.demographics;
  mapped.updated_at = new Date().toISOString();
  const { error } = await supabase.from('income_certifications').update(mapped).eq('id', id);
  if (error) throw error;
}

export async function fetchTICMembers(certId) {
  const { data, error } = await supabase.from('tic_household_members').select('*').eq('certification_id', certId).order('sort_order');
  if (error) throw error;
  return (data || []).map(m => ({ id: m.id, certId: m.certification_id, name: m.member_name, relationship: m.relationship, dob: m.date_of_birth, ssn4: m.ssn_last4, ftStudent: m.is_full_time_student, ptStudent: m.is_part_time_student, disabled: m.is_disabled, race: m.race_code, ethnicity: m.ethnicity_code, order: m.sort_order }));
}

export async function insertTICMember(member) {
  const { data, error } = await supabase.from('tic_household_members').insert({
    certification_id: member.certId, member_name: member.name, relationship: member.relationship || 'Head of Household',
    date_of_birth: member.dob || null, ssn_last4: member.ssn4 || null,
    is_full_time_student: member.ftStudent || false, is_part_time_student: member.ptStudent || false,
    is_disabled: member.disabled || false, sort_order: member.order || 0,
  }).select().single();
  if (error) throw error;
  return { ...data, id: data.id };
}

export async function deleteTICMember(id) {
  const { error } = await supabase.from('tic_household_members').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchTICIncome(certId) {
  const { data, error } = await supabase.from('tic_income_entries').select('*').eq('certification_id', certId);
  if (error) throw error;
  return (data || []).map(e => ({ id: e.id, certId: e.certification_id, memberId: e.member_id, category: e.category, source: e.source_description, amount: Number(e.annual_amount || 0), verified: e.verified, docPath: e.verification_doc_path }));
}

export async function insertTICIncome(entry) {
  const { data, error } = await supabase.from('tic_income_entries').insert({
    certification_id: entry.certId, member_id: entry.memberId, category: entry.category,
    source_description: entry.source || '', annual_amount: entry.amount || 0,
    verified: entry.verified || false, verification_doc_path: entry.docPath || null,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateTICIncome(id, changes) {
  const mapped = {};
  if (changes.amount !== undefined) mapped.annual_amount = changes.amount;
  if (changes.source !== undefined) mapped.source_description = changes.source;
  if (changes.verified !== undefined) mapped.verified = changes.verified;
  if (changes.docPath !== undefined) mapped.verification_doc_path = changes.docPath;
  const { error } = await supabase.from('tic_income_entries').update(mapped).eq('id', id);
  if (error) throw error;
}

export async function deleteTICIncome(id) {
  const { error } = await supabase.from('tic_income_entries').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchTICAssets(certId) {
  const { data, error } = await supabase.from('tic_asset_entries').select('*').eq('certification_id', certId);
  if (error) throw error;
  return (data || []).map(e => ({ id: e.id, certId: e.certification_id, memberId: e.member_id, assetType: e.asset_type, description: e.description, isImputed: e.is_imputed, cashValue: Number(e.cash_value || 0), annualIncome: Number(e.annual_income || 0) }));
}

export async function insertTICAsset(entry) {
  const { data, error } = await supabase.from('tic_asset_entries').insert({
    certification_id: entry.certId, member_id: entry.memberId, asset_type: entry.assetType || 'savings',
    description: entry.description || '', is_imputed: entry.isImputed || false,
    cash_value: entry.cashValue || 0, annual_income: entry.annualIncome || 0,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateTICAsset(id, updates) {
  const mapped = {};
  if (updates.assetType !== undefined) mapped.asset_type = updates.assetType;
  if (updates.description !== undefined) mapped.description = updates.description;
  if (updates.cashValue !== undefined) mapped.cash_value = updates.cashValue;
  if (updates.annualIncome !== undefined) mapped.annual_income = updates.annualIncome;
  if (updates.isImputed !== undefined) mapped.is_imputed = updates.isImputed;
  const { error } = await supabase.from('tic_asset_entries').update(mapped).eq('id', id);
  if (error) throw error;
}

export async function deleteTICAsset(id) {
  const { error } = await supabase.from('tic_asset_entries').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAMIReference(year, county) {
  const { data, error } = await supabase.from('ami_reference').select('*').eq('year', year || 2026).eq('county', county || 'Marin');
  if (error) throw error;
  // Convert to lookup: { householdSize: { 30: limit, 50: limit, ... } }
  const lookup = {};
  for (const r of (data || [])) {
    lookup[r.household_size] = { 100: Number(r.ami_100), 80: Number(r.ami_80), 60: Number(r.ami_60), 50: Number(r.ami_50), 30: Number(r.ami_30) };
  }
  return lookup;
}

export async function fetchRentLimits(year, county) {
  const { data, error } = await supabase.from('ami_rent_limits').select('*').eq('year', year || 2026).eq('county', county || 'Marin');
  if (error) throw error;
  // Convert to lookup: { amiPct: { bedrooms: limit } }
  const lookup = {};
  for (const r of (data || [])) {
    if (!lookup[r.ami_pct]) lookup[r.ami_pct] = {};
    lookup[r.ami_pct][r.bedrooms] = Number(r.rent_limit);
  }
  return lookup;
}

// Upload TIC verification document
export async function uploadTICDocument(file, certId) {
  const path = `tic-documents/${certId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('tic-documents').upload(path, file);
  if (error) throw error;
  return path;
}

export async function getTICDocumentUrl(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from('tic-documents').createSignedUrl(path, 3600); // 1hr
  return data?.signedUrl || null;
}

// ── ADMIN NOTES ──

export async function fetchAdminNotes() {
  const { data, error } = await supabase
    .from('admin_notes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  // Group by resident_id
  const grouped = {};
  (data || []).forEach(n => {
    const rid = n.resident_id;
    if (!grouped[rid]) grouped[rid] = [];
    grouped[rid].push({ id: n.id, date: n.note_date, by: n.author, text: n.text });
  });
  return grouped;
}

export async function insertAdminNote(residentUuid, note) {
  const { data, error } = await supabase.from('admin_notes').insert({
    resident_id: residentUuid,
    author: note.by || 'Admin',
    note_date: note.date || new Date().toISOString().slice(0, 10),
    text: note.text,
  }).select().single();
  if (error) throw error;
  return { id: data.id, date: data.note_date, by: data.author, text: data.text };
}

export async function deleteAdminNote(noteUuid) {
  const { error } = await supabase.from('admin_notes').delete().eq('id', noteUuid);
  if (error) throw error;
}

// ── INSPECTION CHECKLISTS ──

export async function fetchInspectionChecklists() {
  const { data, error } = await supabase
    .from('inspection_checklists')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(c => ({
    id: c.code,
    _uuid: c.id,
    procedureId: c.procedure_id,
    procedure: c.procedure_name,
    unit: c.unit,
    inspector: c.inspector,
    date: c.inspection_date,
    responses: c.responses || {},
    overallResult: c.overall_result,
    completedAt: c.completed_at,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }));
}

export async function insertInspectionChecklist(checklist) {
  const code = `CL-${Date.now()}`;
  const { data, error } = await supabase.from('inspection_checklists').insert({
    code,
    procedure_id: checklist.procedureId,
    procedure_name: checklist.procedure,
    unit: checklist.unit,
    inspector: checklist.inspector,
    inspection_date: checklist.date,
    responses: checklist.responses || {},
    overall_result: checklist.overallResult || 'Complete',
    completed_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return { id: code, _uuid: data.id, ...checklist };
}

export async function updateInspectionChecklist(uuid, changes) {
  const mapped = {};
  if (changes.responses !== undefined) mapped.responses = changes.responses;
  if (changes.overallResult !== undefined) mapped.overall_result = changes.overallResult;
  if (changes.inspector !== undefined) mapped.inspector = changes.inspector;
  if (changes.date !== undefined) mapped.inspection_date = changes.date;
  mapped.updated_at = new Date().toISOString();
  if (changes.overallResult) mapped.completed_at = new Date().toISOString();
  const { error } = await supabase.from('inspection_checklists').update(mapped).eq('id', uuid);
  if (error) throw error;
}
