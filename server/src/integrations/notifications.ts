/**
 * Provider adapters for outgoing messages. No provider is configured yet (the owner has not chosen an email/SMS
 * service), so messages stay queued in the `notifications` collection until one is registered at start-up.
 * Swapping providers means implementing one of these interfaces — nothing else changes.
 */
export interface OutgoingMessage { to: string; subject: string; text: string }
export interface SendResult { providerMessageId?: string }
export interface EmailProvider { send(msg: OutgoingMessage): Promise<SendResult> }
export interface SmsProvider { send(msg: Pick<OutgoingMessage, 'to' | 'text'>): Promise<SendResult> }

export const providers: { email: EmailProvider | null; sms: SmsProvider | null } = { email: null, sms: null };
export const registerEmailProvider = (p: EmailProvider | null) => { providers.email = p; };
export const registerSmsProvider = (p: SmsProvider | null) => { providers.sms = p; };
