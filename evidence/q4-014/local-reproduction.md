# Local room-learning qualification

The launcher runs the installed application and its ordinary SvelteKit routes on loopback PostgreSQL. A separate loopback Auth fixture accepts one synthetic account. Quellight's own cookie, owner, revocation, VICT actor, action and database checks run normally. The fixture imports no production configuration or data. The local operator controls scheduler delivery and the deterministic model barrier used for a pending-work race.

## Run

Use Node 22.23.5 and the package closure pinned by this candidate. Make the eight selected Markdown sources available to the server as described by the identity setup. Start an isolated local PostgreSQL instance with the `q4_fixture` test administrator. The defaults use port 55443. The provisioner requires a `q4_014_` database name, applies the product schema and both installed Mastra profiles, and records the migration SHA-256 values.

```text
node --preserve-symlinks --experimental-import-meta-resolve scripts/q4-014/start.mjs --private-dir PRIVATE_DIR
```

Open the loopback address printed by the process. Sign in with `room-review@quellight.invalid` and `local-room-review`. Run the offline app test using the fixture's private session file.

```text
node --preserve-symlinks --experimental-import-meta-resolve scripts/q4-014/flow.mjs offline PRIVATE_DIR/session.json RESULTS
```

Use `--provider-key-file AUTHORIZED_LOCAL_KEY_FILE` only for the authorized Z.AI development run. The script reads the key in-process and the observer permits only the configured GLM-5.3-Flash endpoint. Completed stages are recorded in `RESULTS/learn.json` and `RESULTS/deliver.json`. The device browser script accepts real learned conversation IDs in separate rooms and exercises the same app view.

Raw traces and operator credentials remain in the private fixture directory. The browser account and case documents are synthetic.

## Equal-state foreground comparison

The live learning stage reaches governed publication via ordinary chat. The paired delivery uses a custom dump of that exact synthetic database as its common starting point. Stop the candidate before restoring the control from that dump. The fixture may pause automatic delivery *after* the learning stage for both arms so their paired fresh turns start with equivalent ordinary memory. The control uses the same runtime and model with `--guidance off`. Use `snapshot.mjs` to save, restore, or drop only a marked synthetic fixture.

`measure.mjs` compares the normalized first SDK input and actual first wire payloads. It removes the single admitted room block and normalizes per-capture Mastra timestamps from SDK content parts. A digest mismatch remains visible. The measured lookup is `JSON.stringify([{b,r}])` for the actual admitted block and revision. The test records requests and provider-reported usage separately.

The Mira and solo-review conversations are development cases. No held-out evaluation task or evaluator answer is used here.
