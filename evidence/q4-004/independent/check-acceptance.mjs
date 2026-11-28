import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const fixtures = process.argv[2];
assert.ok(fixtures, 'Pass the fixtures directory');
const run = JSON.parse(await readFile(join(fixtures, 'acceptance-run.json'), 'utf8'));
assert.equal(run.caseId, 'verified-outcome');
const first = run.submissions.find(request => request.requestId === 'R1');
const repeated = run.submissions.find(request => request.requestId === 'R2');
assert.ok(first && repeated);
assert.equal(first.intentId, 'INT-1');
assert.equal(repeated.intentId, first.intentId);
assert.equal(first.cutVersion, 'v1');
assert.equal(repeated.cutVersion, first.cutVersion);
const stored = run.storedComments.filter(comment => comment.intentId === first.intentId);
assert.equal(stored.length, 1);
const [comment] = stored;
assert.equal(first.returnedCommentId, comment.id);
assert.equal(repeated.returnedCommentId, comment.id);
assert.equal(comment.cutVersion, first.cutVersion);
const reopened = run.reopenResults.filter(view => view.commentId === comment.id);
assert.equal(reopened.length, 1);
assert.equal(reopened[0].renderedCutVersion, 'v2');
assert.notEqual(reopened[0].renderedCutVersion, comment.cutVersion);
console.log(JSON.stringify({
  caseId: run.caseId,
  retryDeduplication: {
    result: 'pass', intentId: first.intentId, requestIds: [first.requestId, repeated.requestId],
    commentId: comment.id, storedCommentCount: stored.length,
  },
  versionBindingOnReopen: {
    result: 'fail', commentId: comment.id, expectedVersion: comment.cutVersion,
    observedVersion: reopened[0].renderedCutVersion,
  },
  scope: 'One synthetic artifact. No causal diagnosis or claim about any later run.',
}, null, 2));
