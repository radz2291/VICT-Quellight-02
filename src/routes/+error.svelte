<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ControlScope, Text, Feedback, Button } from '@victframework/ui-svelte';
</script>

<svelte:head><title>Quellight — page unavailable</title></svelte:head>

<div class="quellight">
  <ControlScope>
    <section class="vict-app quellight-error">
      <Text content="Quellight" tag="h1" />
      <Feedback kind="error" message={page.status === 404 ? 'This page is not here. You can return to Quellight.' : 'This page could not be opened. Please return to Quellight and try again.'} />
      <Button label="Return to Quellight" onclick={() => goto('/')} />
    </section>
  </ControlScope>
</div>

<style>
  .quellight-error { padding: var(--vict-space-6); }
</style>
