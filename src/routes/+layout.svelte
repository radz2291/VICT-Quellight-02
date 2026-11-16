<script lang="ts">
  import '@victframework/ui-svelte/styles.css';
  import '@victframework/ui-svelte/catalog.css';
  import '@victframework/ui-svelte/rhea.css';
  import '@victframework/ui-ai-svelte/styles.css';
  import '$lib/theme.css';
  let { children } = $props();
</script>

{@render children()}
