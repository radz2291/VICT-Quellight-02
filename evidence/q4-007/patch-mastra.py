"""Build the isolated Mastra dependency archive from the pinned registry bytes."""

import argparse
import base64
import gzip
import hashlib
import io
import json
import tarfile
from pathlib import Path


BASE_VERSION = '1.28.2'
VERSION = '1.28.2-q4-007.1'
MODULE = 'package/dist/src-BYrxAUzs.js'
MODULE_SHA256 = '68020175639768e6c7442f0f74bf7dd5fa48fa3c52fcfdd2397ed9d0e3ccbdeb'


def patch_module(data):
    if hashlib.sha256(data).hexdigest() != MODULE_SHA256:
        raise ValueError('Unexpected installed Mastra module identity')
    source = data.decode()

    def replace(old, new, count=1):
        nonlocal source
        if source.count(old) != count:
            raise ValueError(f'Unexpected Mastra source seam: {old[:100]}')
        source = source.replace(old, new)

    replace('function buildObserverHistoryMessage(messages, options) {', '''const publicationProof = Symbol.for("vict.mastra.observation-publication-proof@1");
function buildObserverHistoryMessage(messages, options, inputIds) {''')
    replace('''		context = appendFormattedObserverMessage(content, formatted, context);
	});
	return {''', '''		const start = content.length;
		context = appendFormattedObserverMessage(content, formatted, context);
		if (content.length > start) inputIds?.push(message.id);
	});
	return {''')
    replace('''		const attachmentFilter = this.resolveAttachmentFilter(resolvedModel.model, options?.requestContext);
		const observerMessages = [{''', '''		const attachmentFilter = this.resolveAttachmentFilter(resolvedModel.model, options?.requestContext);
		const inputIds = [];
		const observerMessages = [{''')
    replace('buildObserverHistoryMessage(messagesToObserve, { attachmentFilter })',
            'buildObserverHistoryMessage(messagesToObserve, { attachmentFilter }, inputIds)')
    replace('''		const usage = result.totalUsage ?? result.usage;
		return {
			observations: parsed.observations,''', '''		const usage = result.totalUsage ?? result.usage;
		return {
			[publicationProof]: inputIds,
			observations: parsed.observations,''')
    replace('''		const newObservations = await this.wrapObservations(output.observations, existingObservations, threadId, lastObservedAt, messageRange);
''', '''		const newObservations = await this.wrapObservations(output.observations, existingObservations, threadId, lastObservedAt, messageRange);
		const appended = this.scope === "thread" && messageRange && newObservations.startsWith(existingObservations)
			? parseObservationGroups(newObservations.slice(existingObservations.length))
			: [];
		const group = appended.length === 1 ? appended[0] : void 0;
		const proof = group && group.content && group.content === output.observations.trim() &&
			!/<\\/?observation-group\\b/i.test(group.content) && output[publicationProof]?.length
			? { groupId: group.id, messageIds: output[publicationProof] }
			: void 0;
''')
    replace('''			observations: newObservations,
			observationTokens,
			cycleObservationTokens,
			observedMessageIds,
			lastObservedAt,''', '''			observations: newObservations,
			observationTokens,
			cycleObservationTokens,
			observedMessageIds,
			[publicationProof]: proof,
			lastObservedAt,''')
    replace('''			observedMessageIds: processed.observedMessageIds
		});
		await this.indexObservationGroups''', '''			observedMessageIds: processed.observedMessageIds,
			[publicationProof]: processed[publicationProof]
		});
		await this.indexObservationGroups''')
    replace('function deriveObservationGroupProvenance(content, groups) {',
            'function deriveObservationGroupProvenance(content, groups, publicationGroups) {')
    replace('''		return {
			id: getCanonicalGroupId(section.heading, index),
			range: combineObservationGroupRanges(resolvedGroups),''', '''		const id = getCanonicalGroupId(section.heading, index);
		if (publicationGroups && bodyLines.size > 0 && matchingGroups.length > 0) {
			const lineOwners = new Map();
			for (const parent of matchingGroups) {
				for (const line of new Set(parent.content.split("\\n").map((line) => line.trim()).filter(Boolean))) {
					if (!bodyLines.has(line)) continue;
					lineOwners.set(line, (lineOwners.get(line) ?? 0) + 1);
				}
			}
			if ([...bodyLines].every((line) => lineOwners.get(line) === 1) &&
				matchingGroups.every((parent) => groups.filter((group) => group.id === parent.id).length === 1)) {
				publicationGroups.push({ groupId: id, parentIds: matchingGroups.map((group) => group.id) });
			}
		}
		return {
			id,
			range: combineObservationGroupRanges(resolvedGroups),''')
    replace('function reconcileObservationGroupsFromReflection(content, sourceObservations) {',
            'function reconcileObservationGroupsFromReflection(content, sourceObservations, publicationGroups) {')
    replace('deriveObservationGroupProvenance(normalizedContent, sourceGroups);',
            'deriveObservationGroupProvenance(normalizedContent, sourceGroups, publicationGroups);')
    replace('''	const sanitizedObservations = sanitizeObservationLines(stripEphemeralAnchorIds(parsed.observations || ""));
	return {
		observations: (sourceObservations ? reconcileObservationGroupsFromReflection(sanitizedObservations, sourceObservations) : null) ?? sanitizedObservations,''', '''	const sanitizedObservations = sanitizeObservationLines(stripEphemeralAnchorIds(parsed.observations || ""));
	const publicationGroups = [];
	return {
		observations: (sourceObservations ? reconcileObservationGroupsFromReflection(sanitizedObservations, sourceObservations, publicationGroups) : null) ?? sanitizedObservations,
		[publicationProof]: publicationGroups,''')
    replace('''			usage: totalUsage.totalTokens > 0 ? totalUsage : void 0,
			providerMetadata: finalProviderMetadata''', '''			usage: totalUsage.totalTokens > 0 ? totalUsage : void 0,
			[publicationProof]: parsed[publicationProof],
			providerMetadata: finalProviderMetadata''')
    replace('''				reflection: reflectResult.observations,
				tokenCount: reflectionTokenCount''', '''				reflection: reflectResult.observations,
				[publicationProof]: reflectResult[publicationProof],
				tokenCount: reflectionTokenCount''', 2)
    return source.replace('//# sourceMappingURL=src-BYrxAUzs.js.map', '').encode()


def pack(baseline, integrity, output):
    with baseline.open('rb') as original:
        digest = hashlib.file_digest(original, 'sha512').digest()
    if f'sha512-{base64.b64encode(digest).decode()}' != integrity:
        raise ValueError('Registry tarball does not match the Quellight lock integrity')
    with tarfile.open(baseline, 'r:gz') as original, output.open('wb') as target:
        with gzip.GzipFile(filename='', fileobj=target, mode='wb', mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w|', format=tarfile.PAX_FORMAT) as candidate:
                for item in original:
                    data = original.extractfile(item)
                    if item.name == f'{MODULE}.map':
                        continue
                    if item.name in (MODULE, 'package/package.json'):
                        assert data is not None
                        body = data.read()
                        if item.name == MODULE:
                            body = patch_module(body)
                        else:
                            manifest = json.loads(body)
                            assert manifest['version'] == BASE_VERSION
                            manifest['version'] = VERSION
                            body = (json.dumps(manifest, indent=2) + '\n').encode()
                        data = io.BytesIO(body)
                        item.size = len(body)
                    candidate.addfile(item, data)
                notice = (b'Q4-007 changes the installed Observer and Reflector bundle to carry private\n'
                          b'publication lineage proofs at staged writes. The changed bundle has no source map.\n')
                item = tarfile.TarInfo('package/Q4-007-NOTICE.txt')
                item.size = len(notice)
                candidate.addfile(item, io.BytesIO(notice))


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('baseline', type=Path)
    cli.add_argument('lock', type=Path)
    cli.add_argument('output', type=Path)
    args = cli.parse_args()
    lock = json.loads(args.lock.read_text(encoding='utf-8'))
    pack(args.baseline, lock['packages']['node_modules/@mastra/memory']['integrity'], args.output)
