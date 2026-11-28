/** Owner-facing room learning. Native observations and prompts stay on the server. */
export const roomLearningDimensions = ['understanding', 'intent', 'attunement'] as const;
export type RoomLearningDimension = typeof roomLearningDimensions[number];
export type RoomLearningAction = 'correct' | 'forget' | 'restore';
export const roomLearningLabels: Record<RoomLearningDimension, string> = {
  understanding: 'Understanding', intent: 'Intent', attunement: 'Attunement',
};

export interface RoomLearningSource { id: string; conversationId: string; quote: string }
export interface RoomLearningField {
  dimension: RoomLearningDimension;
  text: string;
  certainty: 'stated' | 'tentative';
  origin: 'learned' | 'owner';
  sources: RoomLearningSource[];
}
export interface RoomLearningHistoryItem {
  revision: number;
  previousRevision: number;
  kind: 'learned' | 'corrected' | 'forgotten' | 'restored' | 'revalidated';
  changedAt: string;
  changed: string[];
  eligible: boolean;
  fields?: Pick<RoomLearningField, 'dimension' | 'text' | 'origin' | 'certainty'>[];
}
export interface RoomLearningView {
  roomId: string;
  revision: number;
  authorityRevision: string;
  fields: RoomLearningField[];
  history: RoomLearningHistoryItem[];
}
