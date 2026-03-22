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
