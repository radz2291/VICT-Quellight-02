# Q4-008 independent installed replay

**Pass for both independent cases.** I audited the primary capture and separately ran `after-prepare` and `cross-thread` on a fresh loopback database with the pinned candidate install. The fixture interrupted a real worker child after the preparation transaction committed. I derived expected ordered IDs by matching synthetic tags from actual Observer input to the scoped app source page. I independently recomputed the native operation request digests, the four VICT maintenance invocation argument digests, and the applied Forget command digest and authority revision.

| Case | Independent result |
| --- | --- |
| After prepare | The first child made one deterministic Observe request and left one durable checkpoint with two ordered IDs and zero publications. A different process claimed the same job after natural expiration and published the same checkpoint and ordered membership once, with zero repeat inference. The original Observe receipt remained `running`, and a separate `reconcile` receipt completed. |
| Care in thread B | A's old worker died with a two-ID checkpoint. The governed Forget targeted B's user original in the same room and advanced both threads to the same new authority. The scoped read masked A's old checkpoint before purge. The dispatcher delivered only current jobs, and A's old job retained one claim and zero publications. Its new Observe used one deterministic request and published A's eligible user ID under the new authority. |
| Duplicate delivery | Repeating owner-scoped dispatch after each case handled zero jobs, made zero model requests, and left the result digest, receipt list, and numeric event history unchanged. |

The cross-thread source pages retained the transcript IDs. The governed authority marked the selected B user original excluded and quarantined prior assistant sources, so A's current publication contained one ID. Purge removed the old private checkpoint. The fixture tests the app's dispatcher and worker from separate local processes on deterministic responses. Provider, hosted scheduler and production behavior are outside this replay.

## Reproduce

Use the Q4-007 candidate install and the Q4-008 fixture in the parent evidence directory. The review used app `14b6ccaf6f409eac3e041dc3d9abd0bb9f875344`, design `9dbfd28175d86b28f9a52340aa4939b4ed11db81`, Node `22.23.5`, PostgreSQL `18.6`, and candidate lock SHA-256 `9b9c90361392dd0af0f282834ad231011554f04a3e5ac2ab20eff734874563be`. I rehashed the installed consumer's archive files before replay.

| Candidate archive | SHA-256 |
| --- | --- |
| `victframework-mastra-0.4.0-rc.1-q4-007.1.tgz` | `9f75998297af4755bfa1abe567f198c7b0731dd304fca1c6c06163f480e03184` |
| `mastra-memory-1.28.2-q4-007.1.tgz` | `ed2e8db8e55c60afe1dd4eb3b93b3c5308f35d7accaeff939d488724339c0ea6` |

Create an empty disposable database named `q4_008_review` on the loopback fixture cluster. Set the paths and loopback DSN for this installation and run from the Q4-008 evidence directory.

```sh
node --preserve-symlinks --experimental-import-meta-resolve run.mjs "$CANDIDATE_APP" "$DESIGN" "$FIXTURE_DSN" "$OUT" after-prepare,cross-thread
node independent/check-recovery.mjs "$OUT/capture.json"
```

The fixture files used for this replay have these SHA-256 hashes.

| File | SHA-256 |
| --- | --- |
| `run.mjs` | `803002f856738c519ab2d73908a7f28257dcf958fc3a78966005858d1254cf91` |
| `fixture.mjs` | `7a81adb335ad146bdca6265f81cf23adbc826b5b577fa079b0cc92d2af68203b` |
| `worker.mjs` | `8f2a1b5151b8da4793b79a2d04a46f57004c19fde9196c5765f9c83c1009e9a5` |

[`fresh-audit.json`](fresh-audit.json) records the separate replay's IDs and receipts. [`fresh-capture.json`](fresh-capture.json) contains its raw synthetic evidence, with SHA-256 `b81c944876da295ad05d643824992269fb0a641ed9ff83d5d5bc34a1421bbc0c`. [`main-audit.json`](main-audit.json) records the cross-check of the primary capture. Both audit outputs bind the corresponding raw capture by SHA-256.
