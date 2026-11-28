import type {
  MastraMemoryService,
  MemoryObservationSourceMembership,
  NativeMemoryOperationReceipt,
} from '@victframework/mastra';

export async function typedMembership(service: MastraMemoryService, thread: string, operation: string) {
  const receipt: NativeMemoryOperationReceipt | null = await service.operation(thread, operation);
  const result = receipt?.result;
  const membership: MemoryObservationSourceMembership | undefined = result && 'snapshot' in result
    ? result.sourceMembership : undefined;
  for (const group of membership?.groups ?? []) {
    if (group.status === 'available') {
      const originalIds: readonly string[] = group.messageIds;
      const basis: 'observe-input' | 'retained-parents' = group.basis;
      void originalIds;
      void basis;
      // @ts-expect-error Published IDs are immutable.
      group.messageIds.push('new');
    } else {
      // @ts-expect-error An unavailable group does not expose message IDs.
      void group.messageIds;
    }
  }
  return membership;
}
