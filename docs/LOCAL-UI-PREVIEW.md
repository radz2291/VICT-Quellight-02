# Local UI preview

This launcher renders the real Quellight SvelteKit app and installed VICT controls with a separate in-memory sample workspace. It is for reviewing the interface before deployment. The loopback address identifies the running preview and exports identify sample content. No Supabase sign-in, database, AI provider, or hosted deployment is used.

From the `app` directory:

```powershell
& ../.tools/node-v22.23.5-win-x64/node.exe scripts/preview-ui.mjs
```

The repository also provides `npm run preview:ui` when the pinned Node/npm toolchain is on PATH. Open [the local preview](http://127.0.0.1:4320/); it selects Home and “Making room for the week” automatically. The initial development render may take a moment to compile. Source edits appear through Vite's normal live reload.

You can navigate sample conversations, create, rename or archive rooms, change appearance, copy or export sample text, inspect Memory, and edit sample Desk items. Send animates a clearly identified reply written in advance. Stop interrupts that sample animation. The preview covers the interface with sample data. Model quality, live authentication and durable storage require live verification.

Sample rooms, conversations, and replies exist only in this launcher process, shared by its open tabs. Stop with Ctrl+C and restart to reset them. Appearance and sample drafts use the app's normal browser storage, under a synthetic actor distinct from the production owner.

The launcher always binds to `127.0.0.1`, checks the loopback Host and write Origin, blanks the app's runtime credentials, and selects foundation mode. Its middleware handles the explicitly supported sample APIs, blocks every other API request and auth write, and supplies a browser policy that restricts resources and connections to the local preview. No production hook or route contains a preview bypass or sample records.

For a transport and SSR check that starts and closes its own instance on port 4321:

```powershell
& ../.tools/node-v22.23.5-win-x64/node.exe scripts/preview-ui.mjs --check
```

Use `--port 4322` if a chosen port is already occupied; the host cannot be changed. The 17 November 2026 builder check passed actual app SSR, preview labelling, sample bootstrap, room creation/rename/archive, canned Send/Stop, labelled export, unknown API refusal, auth-write refusal, and cross-origin refusal. Browser layout and interaction review are separate evidence.

Launcher: `scripts/preview-ui.mjs`. Synthetic transport: `scripts/preview/sample-workspace.mjs`. These files are not imported by the production application.

## 26 November design review

The local candidate shows the room above the conversation and resumes the last opened conversation in the selected room on this device. On a device without a remembered conversation, the app opens the room's most recent one. New conversation is a labelled sidebar action. On phones, **Desk** is also in the conversation header. The Desk list accepts Enter to search, and the mobile item editor keeps **Back to Desk**, **Save item**, and **Preview** reachable while the content scrolls. The New room form focuses **Room name** and closing Memory restores focus to **More**.

See the [review and matched screenshots](../../deliverables/quellight-design-review/README.md) for the reference products, measured controls, and checked viewports. The candidate runs in the loopback sample preview and awaits owner review.

## Second design pass

The header has one line of context. Nested views share a left-arrow control in the header with a destination-specific accessible name. The sidebar distinguishes room selection, adding a room, conversations, and room tools. Desk shows a responsive gallery of saved excerpts. Opening a card enters a dedicated editor with an action bar and a Back arrow to the gallery. Room method shows the learned document before learning settings, with activity and history available on demand. Settings and Desk scroll at the workspace edge while their reading columns stay inset.

[Before and after screenshots](../../deliverables/quellight-design-pass-2/README.md)

The Desk header uses icons for **Search Desk** and **New item**. Search opens a focused field above the cards. Press the same icon again or use Escape to close the field and clear the query. The three-dot menu contains **Attention** and **Archived**, and active filters appear above the cards. **Method** is under **Room tools**. Tiles share one height at each size, with short previews and attention chips aligned at the bottom. The room method appears first when it matches the current view and adds an outlined Room method chip beside its attention level. Kind and status are available in the item's details.

### Surface depth

| Surface | Token | Use |
| --- | --- | --- |
| Workspace | `--vict-color-bg` | The base for conversation, Desk, and settings. |
| Shell | `--ql-sidebar` | A consistent navigation tint, including the Rooms drawer. |
| Raised | `--vict-color-surface` | Desk cards, the learned method, and action bars. A quiet border marks the edge. |
| Recessed | `--ql-field` | Input wells with a legible boundary. |
| Floating | `--ql-floating` | Menus and inspection overlays. Elevation and the drawer backdrop establish their position. |
| Active and focused | `--ql-selected`, `--vict-color-focusRing` | One selection tint and a separate keyboard ring. The containing room is indicated with weight. |
