// Send email notification via /api/notify serverless function
export async function sendNotification(type, data) {
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Notification failed:', err);
    }
  } catch (err) {
    // Non-blocking — don't break the UI if notification fails
    console.warn('Notification send error:', err);
  }
}
