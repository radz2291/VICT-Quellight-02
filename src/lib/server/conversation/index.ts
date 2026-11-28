import { env } from '$env/dynamic/private';
import { protectCredentialPort, requireCredential } from '@victframework/runtime';
import { openProductDatabase } from '../db/index.js';
import { createConversationService } from './service.js';
import { CREDENTIAL } from './activation.js';

const credentials = protectCredentialPort({ async get(name) { return name === CREDENTIAL ? env[CREDENTIAL] : undefined; } });
export const conversations = createConversationService({
  openDatabase: openProductDatabase,
  roomGuidance: env.QUELLIGHT_ROOM_GUIDANCE !== 'off',
  async readCredential() {
    const key = requireCredential(await credentials.get(CREDENTIAL), CREDENTIAL);
    if (!key || /\s/.test(key)) throw new Error('PROVIDER_CREDENTIAL_MISSING');
    return key;
  },
});
