export interface NotificationEnv {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
  WHATSAPP_BUSINESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
}

export interface OutboundMessageInput {
  to: string;
  message: string;
}

export interface OutboundMessageResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

export async function sendSms(
  env: NotificationEnv,
  payload: OutboundMessageInput,
): Promise<OutboundMessageResult> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    return { ok: false, error: 'Twilio is not configured' };
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: payload.to,
        From: env.TWILIO_PHONE_NUMBER,
        Body: payload.message,
      }),
    },
  );

  const body = await response.json<any>();
  return {
    ok: response.ok,
    externalId: body.sid,
    error: response.ok ? undefined : JSON.stringify(body),
  };
}

export async function sendWhatsApp(
  env: NotificationEnv,
  payload: OutboundMessageInput,
): Promise<OutboundMessageResult> {
  if (!env.WHATSAPP_BUSINESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, error: 'WhatsApp Business API is not configured' };
  }

  const response = await fetch(
    `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_BUSINESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: payload.to,
        type: 'text',
        text: { body: payload.message },
      }),
    },
  );

  const body = await response.json<any>();
  return {
    ok: response.ok,
    externalId: body.messages?.[0]?.id,
    error: response.ok ? undefined : JSON.stringify(body),
  };
}

export function buildAppointmentConfirmationMessage(input: {
  locale?: string;
  visitorName?: string | null;
  appointmentType?: string;
  scheduledTime: number;
  timezone?: string;
  meetingLink?: string | null;
}) {
  const locale = (input.locale || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
  const timezone = input.timezone || 'Asia/Riyadh';
  const date = new Date(input.scheduledTime).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (locale === 'ar') {
    return `مرحباً ${input.visitorName || ''}، تم تأكيد موعد ${input.appointmentType || 'الاستشارة'} مع Basma في ${date}.${input.meetingLink ? ` رابط الاجتماع: ${input.meetingLink}` : ''}`.trim();
  }

  return `Hello ${input.visitorName || ''}, your ${input.appointmentType || 'consultation'} with Basma is confirmed for ${date}.${input.meetingLink ? ` Meeting link: ${input.meetingLink}` : ''}`.trim();
}
