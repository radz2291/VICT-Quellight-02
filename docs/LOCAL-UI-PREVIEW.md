# Local UI preview

This launcher renders the real Quellight SvelteKit app and installed VICT controls with a separate in-memory sample workspace. It is for reviewing the interface before deployment. The small **LOCAL UI PREVIEW · SAMPLE CONTENT** label stays visible. No Supabase sign-in, database, AI provider, or hosted deployment is used.

From the `app` directory:

```powershell
& ../.tools/node-v22.23.5-win-x64/node.exe scripts/preview-ui.mjs
```

The repository also provides `npm run preview:ui` when the pinned Node/npm toolchain is on PATH. Open [the local preview](http://127.0.0.1:4320/); it selects Home and “Making room for the week” automatically. The initial development render may take a moment to compile. Source edits appear through Vite's normal live reload.

You can navigate sample conversations, create and rename rooms, archive a room, start a new conversation, change appearance, and copy or export sample text. Send animates a clearly identified reply written in advance; Stop interrupts that sample animation. It does not test model quality, actual authentication, or durable product storage.

Sample rooms, conversations, and replies exist only in this launcher process, shared by its open tabs. Stop with Ctrl+C and restart to reset them. Appearance and sample drafts use the app's normal browser storage, under a synthetic actor distinct from the production owner.

The launcher always binds to `127.0.0.1`, checks the loopback Host and write Origin, blanks the app's runtime credentials, and selects foundation mode. Its middleware handles the explicitly supported sample APIs, blocks every other API request and auth write, and supplies a browser policy that restricts resources and connections to the local preview. No production hook or route contains a preview bypass or sample records.

For a transport and SSR check that starts and closes its own instance on port 4321:

```powershell
& ../.tools/node-v22.23.5-win-x64/node.exe scripts/preview-ui.mjs --check
```

Use `--port 4322` if a chosen port is already occupied; the host cannot be changed. The 17 November 2026 builder check passed actual app SSR, preview labelling, sample bootstrap, room creation/rename/archive, canned Send/Stop, labelled export, unknown API refusal, auth-write refusal, and cross-origin refusal. Browser layout and interaction review are separate evidence.

Launcher: `scripts/preview-ui.mjs`. Synthetic transport: `scripts/preview/sample-workspace.mjs`. These files are not imported by the production application.
