const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const fixtureSchema = 'quellight.q4-009.cedar-cut-delivery@1';

export const revisions = freeze({
  r1: {
    marker: 'SYN_Q4_ROOM_R001',
    territory: 'Design a review portal for fictional Cedar Cut footage.',
    direction: 'Keep each feedback item tied to the cut the reviewer opened.',
    posture: 'Resolve reversible reliability details. Leave unpublished visibility with the owner.',
  },
  r2: {
    marker: 'SYN_Q4_ROOM_R002',
    territory: 'Design a review portal for fictional Cedar Cut footage.',
    direction: 'Implement a verification handoff for comment retries and cut identity.',
    posture: 'Resolve reversible reliability details. Leave unpublished visibility with the owner.',
  },
  r3: {
    marker: 'SYN_Q4_ROOM_R003',
    territory: 'Design a review portal for fictional Cedar Cut footage.',
    direction: 'Implement a verification handoff for comment retries and cut identity.',
    posture: 'The owner has confirmed private review. Keep that decision fixed and verify the handoff.',
  },
});

export const markerText = Object.freeze(Object.fromEntries(Object.entries(revisions).map(([id, value]) => [id, value.marker])));

const turn = (caseId, input, reply, expectedRevision) => ({ caseId, input, reply, expectedRevision });
const long = Array.from({ length: 104 }, (_, offset) => {
  const index = offset + 1;
  const number = String(index).padStart(3, '0');
  return {
    ...turn(`long-${number}`, `Cedar Cut verification case ${number}. Reopen the cut and check that comment ${number} still names its original review version.`,
      `Verification case ${number}: compare the reopened cut identifier with the original comment version identifier.`, index <= 50 ? 'r1' : 'r2'),
    index,
    ...(index === 1 ? { checkpoint: 'first-use' } : {}),
    ...(index === 50 ? { checkpoint: 'last-stable-before-revision' } : {}),
    ...(index === 51 ? { checkpoint: 'first-after-revision' } : {}),
    ...(index === 52 ? { checkpoint: 'first-stable-after-revision' } : {}),
    ...((index % 10 === 0 || index === 104) ? { dispatchAfter: true } : {}),
    ...(index === 80 ? { reflectAfter: true, checkpoint: 'before-reflection' } : {}),
    ...(index === 81 ? { checkpoint: 'after-reflection' } : {}),
  };
});

// These are matching requests for the normal foreground route. Room revisions,
// reopen and care are fixture actions performed and evidenced by the runner.
const short = [
  turn('short-first', 'What should the reviewer notice on their first visit to the Cedar Cut portal?',
    'Show the currently reviewed cut beside its feedback and keep the comment tied to that cut.', 'r1'),
  turn('short-repeat', 'Write the simplest acceptance check for a duplicate submission.',
    'Repeat one submission and verify that there is still one comment on the reviewed version.', 'r1'),
  turn('short-reopen', 'I have reopened this conversation. Continue its existing check.',
    'Compare the comment’s saved cut identifier with the reviewed version when reopened.', 'r1'),
  turn('short-fresh', 'In this new conversation, propose the next verification step.',
    'Replay the submission once and reopen the cut to validate comment version identity.', 'r1'),
  turn('short-other-room', 'Give one general review check for an unrelated media room.',
    'Check that comments stay linked to the item the reviewer opened.', null),
  turn('short-changed', 'The handoff is ready to test. Summarize its confirmation criteria.',
    'Recover repeated submission and compare the comment version with the original review cut.', 'r2'),
  turn('short-after-correction', 'Continue with the approved scope and confirm the final handoff.',
    'Verify the handoff preserves the approved scope, the original version and retry identity.', 'r3'),
  turn('short-after-exclusion', 'Which verification step should I run now?',
    'Check the current version identifier and reopen the comment to confirm the association.', null),
];

export const workload = freeze({ schema: fixtureSchema, sampleIndices: [1, 2, 10, 49, 50, 51, 52, 75, 80, 81, 100, 104],
  short, long, revisions });
