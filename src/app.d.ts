import type { SupabaseClient } from '@supabase/supabase-js';
import type { Owner } from '$lib/server/domain/queries.js';
declare global {
  namespace App {
    interface Locals {
      supabase?: SupabaseClient;
      ownerPromise?: Promise<Owner | null>;
    }
  }
}
export {};
