<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ControlScope, DocumentHost, type ActionResult } from '@victframework/ui-svelte';
  import { descriptors, implementations, signInDocument, setupDocument, requireRenderPlan } from '$lib/product/definition';
  import { request, storageRead, RequestError } from '$lib/product/client';
  let { setup = false }: { setup?: boolean } = $props();
  const source = $derived(setup ? setupDocument : signInDocument);
  const plan = $derived(requireRenderPlan(source));
  let pending = $state(true);
  let error = $state('');
  let dark = $state(false);
  let tokenHash = '';
  let tokenType: 'invite' | 'recovery' = 'invite';
  const view = $derived({ pending, error, hasError: !!error });

  async function dispatch(actionId: string, input?: unknown): Promise<ActionResult> {
    if (pending || actionId !== (setup ? 'auth.setup' : 'auth.sign-in')) return { ok: false, code: 'UNAVAILABLE' };
    const values = (input ?? {}) as Record<string, unknown>;
    error = '';
    const password = String(values.password ?? '');
    if (!password || (!setup && !String(values.email ?? '').trim())) error = setup ? 'Enter a password.' : 'Enter your email and password.';
    if (setup && password !== values.confirmation) error = 'The passwords do not match. Please try again.';
    if (setup && !tokenHash) error = 'Open your private setup link to create your password.';
    if (error) return { ok: false, code: 'CHECK_FIELDS', message: error };
    pending = true;
    try {
      await request(setup ? '/auth/setup' : '/auth/sign-in', setup
        ? { tokenHash, password, type: tokenType }
        : { email: String(values.email).trim(), password });
      tokenHash = '';
      await goto('/', { replaceState: true, invalidateAll: true });
      return { ok: true };
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Sign-in could not be completed. Please try again.';
      return { ok: false, code: cause instanceof RequestError ? cause.code : 'AUTH_UNAVAILABLE', message: error };
    } finally { pending = false; }
  }
  onMount(() => {
    pending = false;
    dark = storageRead('quellight:appearance') === 'dark';
    if (setup) {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      tokenHash = fragment.get('token_hash') ?? '';
      tokenType = fragment.get('type') === 'recovery' ? 'recovery' : 'invite';
      window.history.replaceState(window.history.state, '', window.location.pathname);
      if (!tokenHash) error = 'Open your private setup link to create your password.';
    }
  });
</script>

<svelte:head>
  <title>{setup ? 'Welcome' : 'Sign in'} · Quellight</title>
  <meta name="robots" content="noindex, nofollow" />
  <meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="quellight" data-appearance={dark ? 'dark' : 'light'}>
  <ControlScope>
    <DocumentHost {plan} extensionDescriptors={descriptors} extensionImplementations={implementations}
      localState={source.localState} {view} {dispatch} navigate={() => {}} ariaLabel={setup ? 'Set up Quellight' : 'Sign in to Quellight'} />
  </ControlScope>
</div>
