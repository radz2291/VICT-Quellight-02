<script lang="ts">
  import '@victframework/ui-ai-svelte/styles.css';
  import '$lib/theme.css';
  let { children } = $props();
</script>

{@render children()}
