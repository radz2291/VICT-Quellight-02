import { isHttpError, json } from '@sveltejs/kit';
import { ProductError } from '../domain/queries.js';

const messages: Record<string, string> = {
  CONVERSATION_BUSY: 'This conversation is finishing some work. Your message is kept; try sending again in a moment.',
  TURN_IDEMPOTENCY_CONFLICT: 'This message request was already used for different text. Refresh before sending again.',
  ROOM_ARCHIVED: 'This room is archived. Choose an active room to continue.',
  CONVERSATION_NOT_FOUND: 'This conversation could not be found.',
  TURN_NOT_FOUND: 'This reply could not be found.',
  TURN_STARTING: 'The reply is still starting. Try stopping it again in a moment.',
  TURN_INPUT_INVALID: 'Write a message before sending.',
  TURN_ADMISSION_UNCONFIRMED: 'Your message is kept here. Retry to check whether the reply started.',
  STREAM_SESSION_REVOKED: 'Sign in to continue.',
};
export function conversationError(value: unknown) {
  if (isHttpError(value)) return json({ code: `HTTP_${value.status}`, message: value.body.message }, { status: value.status });
  if (value instanceof ProductError) return json({ code: value.code,
    message: messages[value.code] ?? 'The request could not be completed. Refresh to check its status.' }, { status: value.status });
  return json({ code: 'CONVERSATION_UNAVAILABLE', message: 'Your conversation is temporarily unavailable. Reopen it to check its status.' }, { status: 503 });
}
