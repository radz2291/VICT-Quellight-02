import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [app, capture] = process.argv.slice(2);
const parent = pathToFileURL(join(resolve(app), 'package.json')).href;
const { parseObservationGroups, deriveObservationGroupProvenance, wrapInObservationGroup } =
  await import(import.meta.resolve('@mastra/memory/processors', parent));
const baseline = JSON.parse(readFileSync(capture, 'utf8'));
assert.equal(baseline.appSha, '14b6ccaf6f409eac3e041dc3d9abd0bb9f875344');
assert.equal(baseline.archives.find(x => x.name === '@victframework/mastra')?.sha256,
  '90b2de7c6515785e23b4e6370c92be019959ffca430a7980f6752d5d104c9b2c');

const wrap = group => wrapInObservationGroup(group.content, group.range, group.id, undefined, group.kind);
const lines = value => [...new Set(value.split('\n').map(x => x.trim()).filter(Boolean))];
const structural = line => /^(?:date\s*:|---\s*$|#{1,6}\s+)/i.test(line);
const exists = (a, b) => a.some(x => b.has(x));
const unavailable = reason => ({ status: 'unavailable', reason });

// Research oracle for a deliberately limited approach. It never reconstructs membership from interval endpoints.
function assess(retained, prior, originals, suppliedMembership) {
  const outputs = parseObservationGroups(retained);
  const source = parseObservationGroups(prior);
  if (!outputs.length || new Set(outputs.map(x => x.id)).size !== outputs.length ||
      new Set(source.map(x => x.id)).size !== source.length ||
      outputs.map(wrap).join('\n\n') !== retained ||
      [...outputs, ...source].some(x => /<\/?observation-group\b/i.test(x.content))) return unavailable('unproven-shape');
  const parentLines = source.map(group => ({ group, lines: lines(group.content) }));
  return outputs.map(group => {
    if (group.kind !== 'reflection' || /^[0-9a-f]{16}$/.test(group.id)) return unavailable('possible-aggregate-fallback');
    const outputLines = lines(group.content);
    const outputSet = new Set(outputLines);
    const matching = parentLines.filter(candidate => exists(candidate.lines, outputSet));
    if (!matching.length) return unavailable('ordinal-only-fallback');
    const verified = new Set();
    for (const line of outputLines.filter(x => !structural(x))) {
      const parents = matching.filter(candidate => candidate.lines.includes(line));
      if (parents.length !== 1) return unavailable('unverified-output-line');
      verified.add(parents[0].group.id);
    }
    if (verified.size !== matching.length) return unavailable('only-shared-or-structural-match');
    const reconstructed = deriveObservationGroupProvenance('## Group `' + group.id + '`\n' + group.content, source);
    if (reconstructed.length !== 1 || wrap(reconstructed[0]) !== wrap(group)) return unavailable('native-projection-mismatch');
    const supplied = matching.map(parent => suppliedMembership.get(parent.group.id));
    if (supplied.some(ids => !ids?.length)) return unavailable('parent-membership-unavailable');
    const union = new Set(supplied.flat());
    const messageIds = originals.filter(id => union.has(id));
    if (messageIds.length !== union.size) return unavailable('ineligible-member');
    return { status: 'available', id: group.id, parentIds: matching.map(x => x.group.id), messageIds };
  });
}

const publication = id => baseline.publications.find(x => x.label === id);
const idsFedIntoGroup = id => baseline.models.find(x => x.label === id).orderedSourceIds;
const active = id => publication(id).operation.result.snapshot.current.observations;
const originalInventory = label => baseline.inventories.find(x => x.label === label).orderedOriginals.filter(x => !x.excluded);
const before = originalInventory('before-close');
const after = originalInventory('after-forget-before-rebuild');
const priorGroups = new Map(['open', 'middle', 'close'].map(id => [publication(id).group.id, idsFedIntoGroup(id)]));
const originalIds = before.map(x => x.id);

const outer = assess(active('outer-combination'), active('close'), originalIds, priorGroups);
assert.equal(outer.length, 1);
assert.deepEqual(outer[0].messageIds, [...idsFedIntoGroup('open'), ...idsFedIntoGroup('close')]);
assert.equal(outer[0].messageIds.length, 8);
const rebuilt = assess(active('rebuilt-reflection'), active('rebuilt'), after.map(x => x.id),
  new Map([[publication('rebuilt').group.id, idsFedIntoGroup('rebuilt')]]));
assert.equal(rebuilt.length, 1);
assert.equal(rebuilt[0].messageIds.length, 4);
assert.deepEqual(rebuilt[0].messageIds, idsFedIntoGroup('rebuilt'));
const modeled = parseObservationGroups(active('outer-combination'))[0];
const simulated = (changes, source = active('close')) => assess(wrap({ ...modeled, ...changes }), source, originalIds, priorGroups)[0];
assert.equal(simulated({ id: '0000000000000abc' }).reason, 'possible-aggregate-fallback');
assert.equal(simulated({ content: '- A paraphrase with no copied lines.' }).reason, 'ordinal-only-fallback');
assert.equal(simulated({ content: modeled.content + '\n- An unsupported new statement.' }).reason, 'unverified-output-line');
assert.equal(assess(active('outer-combination'), active('close'), originalIds, new Map())[0].reason, 'parent-membership-unavailable');
assert.equal(assess(active('outer-combination'), active('close'), originalIds.slice(1), priorGroups)[0].reason, 'ineligible-member');
const duplicate = active('close').replace(publication('middle').group.body, publication('open').group.body);
assert.equal(simulated({}, duplicate).reason, 'unverified-output-line');
console.log(JSON.stringify({ outer, rebuilt, omittedIds: idsFedIntoGroup('middle'), negatives: [
  'possible-aggregate-fallback', 'ordinal-only-fallback', 'unverified-output-line', 'legacy parent', 'ineligible member', 'duplicate copied-line attribution',
], scope: 'frozen Q4-006 capture plus public installed Mastra processors; no candidate package or provider call' }, null, 2));
