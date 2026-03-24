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

export async function insertProperty(prop) {
  const slug = prop.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '') + '-' + Math.random().toString(36).slice(2, 6);
  const { data, error } = await supabase.from('properties').insert({
    slug,
    name: prop.name,
    address: prop.address || '',
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
  const { data, error } = await supabase.from('units').insert({
    property_id: propertyUuid,
    number: unit.number,
    bedrooms: unit.bedrooms || 1,
    bathrooms: unit.bathrooms || 1,
    sqft: unit.sqft || 0,
    floor_plan: unit.floorPlan || '',
  }).select().single();
  if (error) throw error;
  return { _uuid: data.id, number: data.number, bedrooms: data.bedrooms, bathrooms: data.bathrooms, sqft: data.sqft };
}

export async function updateProperty(propUuid, changes) {
  const mapped = {};
  if (changes.name !== undefined) mapped.name = changes.name;
  if (changes.address !== undefined) mapped.address = changes.address;
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
  const { error } = await supabase.from('units').update(mapped).eq('id', unitUuid);
  if (error) throw error;
}

export async function deleteUnit(unitUuid) {
  const { error } = await supabase.from('units').delete().eq('id', unitUuid);
  if (error) throw error;
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
      phone: resident.phone,
      email: resident.email,
      preferred_channel: resident.preferredChannel || 'email',
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
