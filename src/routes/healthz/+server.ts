import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/** Process liveness only; never evidence of agent/database readiness. */
export function GET() {
  return json({ status: 'ok', application: 'quellight', mode: env.QUELLIGHT_MODE ?? 'foundation' }, { headers: { 'cache-control': 'no-store' } });
}
