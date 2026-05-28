// ── Resident-side internationalization ──
// English-only for admin/maint users. Residents can switch to Spanish
// via My Profile → Preferences → Language; the existing language
// picker on commPrefs.language drives this.
//
// Usage:
//   const { t, lang, setLang } = useI18n();
//   <h1>{t('welcome_back', { name: 'Jane' })}</h1>
//
// Translation rules:
// - Keys are snake_case English-ish hints (e.g. 'maintenance_all_clear')
// - Use {name}, {count} etc. for interpolation
// - When a key is missing in the active lang, falls back to English
// - When a key is missing in English too, the raw key is returned
//   (visible during development so untranslated strings are obvious)

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

export const TRANSLATIONS = {
  en: {
    // ── Sidebar nav (resident) ──
    nav_dashboard: "Dashboard",
    nav_maintenance: "Maintenance",
    nav_rent: "Rent & Payments",
    nav_messages: "Messages",
    nav_recert: "Recertification",
    nav_unit: "My Unit",
    nav_inspections: "Inspections",
    nav_profile: "My Profile",

    // ── Dashboard ──
    dash_welcome: "Welcome back, {name}",
    dash_unit_at: "Unit {unit} — {property}",
    tile_rent_label: "Rent Balance",
    tile_rent_paid: "All paid up",
    tile_rent_outstanding: "Outstanding — tap to pay",
    tile_maint_label: "Maintenance",
    tile_maint_all_clear: "All clear",
    tile_maint_open: "{count} Open",
    tile_maint_default_sub: "Submit a request anytime",
    tile_maint_tap_view: "Tap to view",
    tile_msg_label: "Messages",
    tile_msg_new: "{count} new",
    tile_msg_none: "—",
    tile_msg_reach_out: "Reach out anytime",
    tile_msg_latest_from: "Latest from {sender}",
    tile_insp_label: "Inspections",
    tile_insp_none: "None scheduled",
    tile_insp_check_history: "Check inspection history",
    tile_cert_label: "Income Certification",
    tile_cert_verified: "Verified {date}",
    tile_cert_required: "Verification Required",
    tile_cert_required_sub: "Complete your annual income update",
    tile_cert_next_due_in: "Next due in {days} days",
    tile_cert_due_in: "Due in {days} day",
    tile_cert_due_in_plural: "Due in {days} days",
    tile_cert_overdue: "Overdue by {days} days",
    tile_unit_label: "My Unit",
    tile_unit_active: "Active",
    tile_unit_expired: "Expired",
    tile_unit_mtm: "Month-to-Month",
    tile_unit_lease_ends: "Lease ends {date}",
    tile_unit_at: "Unit {unit} · {property}",

    // ── Contact Info card ──
    contact_info: "My Contact Info",
    contact_edit_in_profile: "Edit in My Profile →",
    contact_phone: "Phone",
    contact_email: "Email",
    contact_preferred: "Preferred Contact",
    contact_sms_consent: "SMS Consent",
    contact_not_set: "Not set",
    contact_opted_in: "✓ Opted In",
    contact_not_opted_in: "Not opted in",

    // ── Common buttons / words ──
    btn_save: "Save",
    btn_save_changes: "Save Changes",
    btn_cancel: "Cancel",
    btn_edit: "Edit",
    btn_remove: "Remove",
    btn_add: "Add",
    btn_submit: "Submit",
    btn_back: "← Back",
    btn_view_all: "View all →",
    btn_open: "Open →",
    word_yes: "Yes",
    word_no: "No",
    word_loading: "Loading...",

    // ── Maintenance page ──
    maint_title: "Maintenance Requests",
    maint_subtitle: "Submit and track maintenance issues for your unit",
    maint_emergency_title: "If this is an emergency, call 911.",
    maint_emergency_body: "Fire, gas leak, flooding, medical emergency, or anything that needs immediate response — dial",
    maint_emergency_body2: "first. Use this form for non-emergency repairs.",
    maint_new_btn: "Submit a New Maintenance Request",
    maint_share_qr: "Share QR Code",
    maint_hide_qr: "Hide QR Code",
    maint_filter_active: "Active",
    maint_filter_done: "Completed",
    maint_filter_all: "All",
    maint_form_category: "Category",
    maint_form_urgency: "Urgency",
    maint_form_description: "Describe the problem",
    maint_form_permission: "Permission to enter",
    maint_form_add_photos: "Add Photos",
    maint_empty_done: "No completed requests yet.",
    maint_empty_active: "No active requests right now.",
    maint_status_submitted: "Submitted: {date}",
    maint_status_assigned: "Assigned: {name}",
    maint_status_queue: "Queue position: #{n}",
    maint_status_est: "Est. complete: {date}",
    maint_needs_info_title: "Management is asking for more info",
    maint_reply_placeholder: "Type your response…",
    maint_edit_title: "Edit Request #{id}",
    maint_edit_photos_label: "Photos ({count}/5)",
    maint_edit_add_photo: "📎 Add Photo",
    maint_edit_photo_help: "Up to 5 photos total. iPhone HEIC photos convert automatically.",

    // ── Messages / Communications ──
    msg_title: "Messages",
    msg_subtitle: "View messages and manage your contact preferences",
    msg_tab_messages: "Messages",
    msg_tab_compose: "Compose",
    msg_tab_preferences: "Preferences",
    msg_compose_intro: "Send a message. We'll reply as soon as we can.",
    msg_compose_not_maint: "If this is a maintenance request, please submit a maintenance request from the {Maintenance} tab instead.",
    msg_send_to: "Send to",
    msg_send_to_pm: "Property Manager",
    msg_send_to_rent: "Rent / Billing",
    msg_subject: "Subject",
    msg_subject_placeholder: "What's this about?",
    msg_message: "Message",
    msg_message_placeholder: "Type your message...",
    msg_attachments: "Attachments (optional)",
    msg_send: "Send Message",
    msg_clear: "Clear",

    // ── Preferences ──
    prefs_contact: "Contact Preferences",
    prefs_preferred_channel: "Preferred Channel",
    prefs_ch_email: "Email",
    prefs_ch_sms: "SMS",
    prefs_ch_both: "Email + SMS",
    prefs_ch_phone: "Phone",
    prefs_sms_consent: "SMS Text Message Consent",
    prefs_sms_consent_body: "I agree to receive text messages from Bolinas Community Land Trust at the phone number on file. Message frequency varies. Message and data rates may apply. Reply STOP to cancel at any time. Reply HELP for help.",
    prefs_delivery: "Delivery Settings",
    prefs_quiet_start: "Quiet Hours Start",
    prefs_quiet_end: "Quiet Hours End",
    prefs_language: "Language",
    prefs_language_en: "English",
    prefs_language_es: "Español",

    // ── Profile tabs ──
    profile_title: "My Profile",
    profile_tab_contact: "Contact",
    profile_tab_emergency: "Emergency Contacts",
    profile_tab_household: "Household",
    profile_tab_lease: "Lease Summary",
    profile_tab_prefs: "Preferences",

    // ── My Unit ──
    unit_title: "My Unit",
    unit_no_info: "Unit information not available. Your profile may not be linked to a unit yet.",
    unit_lease_details: "Lease Details",
    unit_lease_start: "Lease Start",
    unit_lease_end: "Lease End",
    unit_monthly_rent: "Monthly Rent",
    unit_tenant_portion: "Tenant Portion",
    unit_hap_paid: "HAP (PHA Pays)",
    unit_utility_resp: "Utility Responsibility",
    unit_appliance_inv: "Appliance Inventory",
    unit_last_inspection: "Last Inspection",
    unit_property_mgmt: "Property Management",

    // ── Inspections ──
    insp_title: "My Inspections",
    insp_subtitle: "Inspection history for your unit",
    insp_history_for: "Inspection History — Unit {unit}",

    // ── Income Cert ──
    cert_title: "Recertification",
    cert_intro: "BCLT verifies your household income once a year to keep your unit's affordable rent in place. Quick — usually about 10 minutes.",
    cert_status: "Status",
    cert_time: "Time",
    cert_next_step: "Next Step",
    cert_step_submit_now: "Submit now",
    cert_step_submit_soon: "Submit soon",
    cert_step_all_good: "All good",
  },

  es: {
    // ── Sidebar nav (resident) ──
    nav_dashboard: "Tablero",
    nav_maintenance: "Mantenimiento",
    nav_rent: "Renta y Pagos",
    nav_messages: "Mensajes",
    nav_recert: "Recertificación",
    nav_unit: "Mi Unidad",
    nav_inspections: "Inspecciones",
    nav_profile: "Mi Perfil",

    // ── Dashboard ──
    dash_welcome: "Hola de nuevo, {name}",
    dash_unit_at: "Unidad {unit} — {property}",
    tile_rent_label: "Saldo de Renta",
    tile_rent_paid: "Todo al día",
    tile_rent_outstanding: "Pendiente — toque para pagar",
    tile_maint_label: "Mantenimiento",
    tile_maint_all_clear: "Sin problemas",
    tile_maint_open: "{count} Abierto(s)",
    tile_maint_default_sub: "Envíe una solicitud cuando lo necesite",
    tile_maint_tap_view: "Toque para ver",
    tile_msg_label: "Mensajes",
    tile_msg_new: "{count} nuevo(s)",
    tile_msg_none: "—",
    tile_msg_reach_out: "Contáctenos en cualquier momento",
    tile_msg_latest_from: "Último mensaje de {sender}",
    tile_insp_label: "Inspecciones",
    tile_insp_none: "No programadas",
    tile_insp_check_history: "Ver historial de inspecciones",
    tile_cert_label: "Certificación de Ingresos",
    tile_cert_verified: "Verificada {date}",
    tile_cert_required: "Verificación Requerida",
    tile_cert_required_sub: "Complete su actualización anual de ingresos",
    tile_cert_next_due_in: "Próxima en {days} días",
    tile_cert_due_in: "Debido en {days} día",
    tile_cert_due_in_plural: "Debida en {days} días",
    tile_cert_overdue: "Atrasada por {days} días",
    tile_unit_label: "Mi Unidad",
    tile_unit_active: "Activo",
    tile_unit_expired: "Vencido",
    tile_unit_mtm: "Mes a Mes",
    tile_unit_lease_ends: "Contrato termina el {date}",
    tile_unit_at: "Unidad {unit} · {property}",

    // ── Contact Info card ──
    contact_info: "Mi Información de Contacto",
    contact_edit_in_profile: "Editar en Mi Perfil →",
    contact_phone: "Teléfono",
    contact_email: "Correo electrónico",
    contact_preferred: "Contacto Preferido",
    contact_sms_consent: "Consentimiento SMS",
    contact_not_set: "No configurado",
    contact_opted_in: "✓ Suscrito",
    contact_not_opted_in: "No suscrito",

    // ── Common buttons / words ──
    btn_save: "Guardar",
    btn_save_changes: "Guardar Cambios",
    btn_cancel: "Cancelar",
    btn_edit: "Editar",
    btn_remove: "Eliminar",
    btn_add: "Agregar",
    btn_submit: "Enviar",
    btn_back: "← Atrás",
    btn_view_all: "Ver todo →",
    btn_open: "Abrir →",
    word_yes: "Sí",
    word_no: "No",
    word_loading: "Cargando...",

    // ── Maintenance page ──
    maint_title: "Solicitudes de Mantenimiento",
    maint_subtitle: "Envíe y siga el estado de problemas en su unidad",
    maint_emergency_title: "Si es una emergencia, llame al 911.",
    maint_emergency_body: "Incendio, fuga de gas, inundación, emergencia médica o cualquier cosa que requiera respuesta inmediata — marque",
    maint_emergency_body2: "primero. Use este formulario para reparaciones que no son emergencias.",
    maint_new_btn: "Enviar una nueva solicitud de mantenimiento",
    maint_share_qr: "Compartir código QR",
    maint_hide_qr: "Ocultar código QR",
    maint_filter_active: "Activas",
    maint_filter_done: "Completadas",
    maint_filter_all: "Todas",
    maint_form_category: "Categoría",
    maint_form_urgency: "Urgencia",
    maint_form_description: "Describa el problema",
    maint_form_permission: "Permiso para entrar",
    maint_form_add_photos: "Agregar Fotos",
    maint_empty_done: "Aún no hay solicitudes completadas.",
    maint_empty_active: "No hay solicitudes activas en este momento.",
    maint_status_submitted: "Enviada: {date}",
    maint_status_assigned: "Asignada a: {name}",
    maint_status_queue: "Posición en cola: #{n}",
    maint_status_est: "Fecha estimada: {date}",
    maint_needs_info_title: "Administración solicita más información",
    maint_reply_placeholder: "Escriba su respuesta…",
    maint_edit_title: "Editar Solicitud #{id}",
    maint_edit_photos_label: "Fotos ({count}/5)",
    maint_edit_add_photo: "📎 Agregar Foto",
    maint_edit_photo_help: "Hasta 5 fotos en total. Las fotos HEIC del iPhone se convierten automáticamente.",

    // ── Messages / Communications ──
    msg_title: "Mensajes",
    msg_subtitle: "Vea mensajes y administre sus preferencias de contacto",
    msg_tab_messages: "Mensajes",
    msg_tab_compose: "Redactar",
    msg_tab_preferences: "Preferencias",
    msg_compose_intro: "Envíe un mensaje. Responderemos lo antes posible.",
    msg_compose_not_maint: "Si esto es una solicitud de mantenimiento, envíela desde la pestaña {Maintenance}.",
    msg_send_to: "Enviar a",
    msg_send_to_pm: "Administrador de la Propiedad",
    msg_send_to_rent: "Renta / Facturación",
    msg_subject: "Asunto",
    msg_subject_placeholder: "¿De qué se trata?",
    msg_message: "Mensaje",
    msg_message_placeholder: "Escriba su mensaje...",
    msg_attachments: "Adjuntos (opcional)",
    msg_send: "Enviar Mensaje",
    msg_clear: "Limpiar",

    // ── Preferences ──
    prefs_contact: "Preferencias de Contacto",
    prefs_preferred_channel: "Canal Preferido",
    prefs_ch_email: "Correo",
    prefs_ch_sms: "SMS",
    prefs_ch_both: "Correo + SMS",
    prefs_ch_phone: "Teléfono",
    prefs_sms_consent: "Consentimiento de Mensajes de Texto (SMS)",
    prefs_sms_consent_body: "Acepto recibir mensajes de texto de Bolinas Community Land Trust al número de teléfono registrado. La frecuencia varía. Pueden aplicarse tarifas. Responda STOP para cancelar en cualquier momento. Responda HELP para ayuda.",
    prefs_delivery: "Configuración de Entrega",
    prefs_quiet_start: "Inicio de Horas de Silencio",
    prefs_quiet_end: "Fin de Horas de Silencio",
    prefs_language: "Idioma",
    prefs_language_en: "English",
    prefs_language_es: "Español",

    // ── Profile tabs ──
    profile_title: "Mi Perfil",
    profile_tab_contact: "Contacto",
    profile_tab_emergency: "Contactos de Emergencia",
    profile_tab_household: "Hogar",
    profile_tab_lease: "Resumen del Contrato",
    profile_tab_prefs: "Preferencias",

    // ── My Unit ──
    unit_title: "Mi Unidad",
    unit_no_info: "La información de la unidad no está disponible. Su perfil aún no está vinculado a una unidad.",
    unit_lease_details: "Detalles del Contrato",
    unit_lease_start: "Inicio del Contrato",
    unit_lease_end: "Fin del Contrato",
    unit_monthly_rent: "Renta Mensual",
    unit_tenant_portion: "Porción del Inquilino",
    unit_hap_paid: "HAP (PHA Paga)",
    unit_utility_resp: "Responsabilidad de Servicios",
    unit_appliance_inv: "Inventario de Electrodomésticos",
    unit_last_inspection: "Última Inspección",
    unit_property_mgmt: "Administración de la Propiedad",

    // ── Inspections ──
    insp_title: "Mis Inspecciones",
    insp_subtitle: "Historial de inspecciones de su unidad",
    insp_history_for: "Historial de Inspecciones — Unidad {unit}",

    // ── Income Cert ──
    cert_title: "Recertificación",
    cert_intro: "BCLT verifica los ingresos de su hogar una vez al año para mantener la renta asequible de su unidad. Es rápido — usualmente toma unos 10 minutos.",
    cert_status: "Estado",
    cert_time: "Tiempo",
    cert_next_step: "Siguiente Paso",
    cert_step_submit_now: "Enviar ahora",
    cert_step_submit_soon: "Enviar pronto",
    cert_step_all_good: "Todo bien",
  },
};

const I18nContext = createContext({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

export function I18nProvider({ children, initialLang = "en" }) {
  const [lang, setLang] = useState(initialLang);
  // Keep language in sync if the consumer passes a different initialLang later
  // (e.g. when commPrefs.language loads asynchronously)
  useEffect(() => { if (initialLang && initialLang !== lang) setLang(initialLang); }, [initialLang]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = useCallback((key, params) => {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    let str = dict[key];
    if (str === undefined) str = TRANSLATIONS.en[key];
    if (str === undefined) return key;
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
