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
    address: p.address,
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
    name: r.name,
    unit: r.units?.number || '',
    phone: r.phone,
    email: r.email,
    preferredChannel: r.preferred_channel,
  }));
}

// ── RESIDENTS EXTENDED (keyed by slug, includes lease data) ──

export async function fetchResidentsExtended() {
  const { data, error } = await supabase
    .from('residents')
    .select('slug, status, move_in_date, properties(slug), units(number, bedrooms), leases(start_date, end_date, rent_amount, tenant_portion, hap_payment, status)')
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
    });
  }
  return result;
}

// ── WRITES ──

export async function insertResident(resident, propertyUuid, unitUuid) {
  const { data, error } = await supabase.from('residents').insert({
    slug: resident.slug || resident.name.toLowerCase().replace(/\s+/g, '-'),
    property_id: propertyUuid,
    unit_id: unitUuid,
    name: resident.name,
    phone: resident.phone,
    email: resident.email,
    preferred_channel: resident.preferredChannel || 'email',
    status: resident.status || 'active',
    move_in_date: resident.moveInDate || null,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function insertLease(lease, residentUuid, unitUuid) {
  const { data, error } = await supabase.from('leases').insert({
    resident_id: residentUuid,
    unit_id: unitUuid,
    start_date: lease.startDate,
    end_date: lease.endDate,
    rent_amount: lease.rentAmount,
    tenant_portion: lease.tenantPortion,
    hap_payment: lease.hapPayment,
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
  });
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
    code: t.id || `THR-${Date.now()}`, participants: JSON.stringify(t.participants || []),
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

export async function fetchCommTemplates() {
  const { data, error } = await supabase.from('comm_templates').select('*').order('name');
  if (error) throw error;
  return (data || []).map(t => ({
    id: t.code, name: t.name, channel: t.channel, subject: t.subject || undefined, body: t.body,
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
    result: i.result, score: i.score, failedItems: i.failed_items || [], notes: i.notes || '',
  }));
}

export async function insertUnitInspection(insp) {
  const { data: prop } = await supabase.from('properties').select('id').eq('slug', insp.propertyId || 'wharf').single();
  const { data: unitRow } = await supabase.from('units').select('id').eq('number', insp.unit).single();
  const { count } = await supabase.from('unit_inspections').select('*', { count: 'exact', head: true });
  const code = `UI-${110 + (count || 0)}`;
  const { data, error } = await supabase.from('unit_inspections').insert({
    code, property_id: prop?.id, unit_id: unitRow?.id || null,
    category: insp.category, inspection_date: insp.date, inspector: insp.inspector || 'Mike R.',
    result: insp.result || 'Pass', score: insp.score || null,
    failed_items: JSON.stringify(insp.failedItems || []), notes: insp.notes || '',
  }).select().single();
  if (error) throw error;
  return { ...insp, id: code, _uuid: data.id };
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
    notes: m.notes || [],
  }));
}

export async function insertMaintenanceRequest({ unit, category, priority, description, propertySlug }) {
  // Look up property and unit UUIDs
  const { data: prop } = await supabase.from('properties').select('id').eq('slug', propertySlug || 'wharf').single();
  const { data: unitRow } = await supabase.from('units').select('id').eq('number', unit).single();
  // Look up resident by unit
  const { data: resident } = await supabase.from('residents').select('id').eq('unit_id', unitRow?.id).single();

  // Generate code
  const { count } = await supabase.from('maintenance_requests').select('*', { count: 'exact', head: true });
  const code = `MR-${2406 + (count || 0)}`;

  const { data, error } = await supabase.from('maintenance_requests').insert({
    code,
    resident_id: resident?.id || null,
    property_id: prop?.id,
    unit_id: unitRow?.id || null,
    category,
    priority,
    status: 'submitted',
    description,
    assigned_to: null,
    queue_pos: (count || 0) + 1,
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
  const { count } = await supabase.from('onboarding_workflows').select('*', { count: 'exact', head: true });
  const code = `OB-${7 + (count || 0)}`;
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
