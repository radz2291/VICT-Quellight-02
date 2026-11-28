# Quellight 4A local candidate

The isolated candidate builds from app `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344` and the Phase 4 design at `9dbfd28175d86b28f9a52340aa4939b4ed11db81`. It uses the Q4-007 and Q4-008 staged VICT Mastra and Mastra Memory pair. Keep separately installed dependencies tied to the app's `package-lock.json` and `baseline.json`.

| Pin | SHA-256 |
| --- | --- |
| Candidate lockfile | `9b9c90361392dd0af0f282834ad231011554f04a3e5ac2ab20eff734874563be` |
| VICT Mastra candidate archive | `9f75998297af4755bfa1abe567f198c7b0731dd304fca1c6c06163f480e03184` |
| Mastra Memory candidate archive | `ed2e8db8e55c60afe1dd4eb3b93b3c5308f35d7accaeff939d488724339c0ea6` |
| Selected speaking assembly | `23adc723ab5a8d25dcc1371e2a70df248c4f6db1eb9c141df58f5c2ca8b77254` |

## Prepare the local candidate

Use Node `22.23.5`, npm `11.21.2` and the exact app install. Open a terminal at this app root. Install the eight selected Markdown files and `EDITING.md` from the owner's private Original Quellight persona directory. The installer verifies the bytes and preserves each source as its own file. Its destination is the ignored `.private/persona` directory. The server can also load a directory supplied to `QUELLIGHT_PERSONA_DIR`.

```text
node scripts/install-selected-persona.mjs ORIGINAL_PERSONA_DIRECTORY
npm run verify:baseline
node --preserve-symlinks scripts/q4-014/check-activation.mjs
```

The conversation role composes the selected identity first. The app's conversation prompt editor controls the operating instructions appended to it. The source and order are recorded in [the selection manifest](../src/lib/server/prompts/persona-selection.json). `EDITING.md` governs future edits. A reviewed editorial change requires a new selection pin and a server restart. The local app loads a verified assembly once per directory in a process.

## Open the synthetic app

The review launcher uses the pinned app, an isolated loopback PostgreSQL 18.6 cluster and synthetic owner authentication. Run it from the app root with the fixture cluster listening on the chosen port.

```text
node --preserve-symlinks --experimental-import-meta-resolve scripts/q4-014/start.mjs --database q4_014_local --pg-port 55443 --port 4317 --auth-port 4318 --private-dir PRIVATE_FIXTURE_DIRECTORY
```

Open the [local app](http://127.0.0.1:4317). The fixture sign-in is `room-review@quellight.invalid` with password `local-room-review`. The launcher defaults to deterministic synthetic replies. To exercise the approved live provider route on fictional conversations, add `--provider-key-file LOCAL_KEY_FILE`. Its captures and operator session belong in the private directory.

Open a conversation's **More → Memory** menu to inspect room guidance and its sources. The launcher’s `--guidance off` option starts the equivalent ordinary-memory comparison. The lookup in the guided case selects the current owner, room and authority before assembly. The app records the selected room revision on the admitted turn. The control uses the same speaking identity, native memory, Desk and tool capabilities.

The release boundary for this candidate is local review. A future package adoption must use one active native writer and account for old queued and already-started operations. [Qualified recovery and pin transition](https://github.com/radz2291/VICT-Quellight-02/blob/3122d2a283e3e42ca27961117d1de788dd065b7e/evidence/q4-008/README.md)
