import { ProductError } from './domain/queries.js';

interface ModelV2 {
  specificationVersion: 'v2'; provider: string; modelId: string;
  supportedUrls: unknown;
  doStream(options: unknown): unknown;
  doGenerate(options: unknown): unknown;
}
interface SelectedContextReader {
  selectedContext(conversationId: string, turnId: string): Promise<Record<string, unknown> | null>;
  authority(conversationId: string): Promise<{ revision: string }>;
}

/** Native selection is persisted before this public SDK model boundary. A delayed
 * selection must not give older Desk instructions a newer source authority. */
export function guardDeskModel(model: unknown, reader: SelectedContextReader,
  binding: { conversationId: string; turnId: string; authorityRevision: string }) {
  const candidate = model as ModelV2 | null;
  if (!candidate || candidate.specificationVersion !== 'v2' || typeof candidate.doStream !== 'function' ||
      typeof candidate.doGenerate !== 'function') throw new ProductError('DESK_MODEL_CONFIGURATION_INVALID', 503);
  async function validate() {
    const selected = await reader.selectedContext(binding.conversationId, binding.turnId);
    const payload = selected?.payload as { authorityRevision?: string } | undefined;
    if (payload?.authorityRevision !== binding.authorityRevision ||
      (await reader.authority(binding.conversationId)).revision !== binding.authorityRevision) {
      throw new ProductError('DESK_AUTHORITY_CHANGED', 409);
    }
  }
  // Forward the public LanguageModelV2 contract and its provider defaults unchanged.
  // Forget after this check retains the selected native authority, so native late-save
  // quarantine still applies. Each later SDK model step validates again.
  return { specificationVersion: candidate.specificationVersion, provider: candidate.provider,
    modelId: candidate.modelId, supportedUrls: candidate.supportedUrls,
    async doStream(options: unknown) { await validate(); return candidate.doStream(options); },
    async doGenerate(options: unknown) { await validate(); return candidate.doGenerate(options); },
  };
}
