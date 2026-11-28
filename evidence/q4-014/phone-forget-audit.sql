BEGIN READ ONLY;
WITH target AS (
  SELECT id, room_id, actor_id FROM quellight_product_v1.conversations WHERE id='3a0aa6c4-16e0-4bf9-8105-076e8b55f0bc'::uuid
), care AS (
  SELECT m.*, (m.input->>'sourceMessageIds')::jsonb->>0 AS source_id
  FROM quellight_product_v1.memory_care_commands m JOIN target c ON c.id=m.conversation_id AND c.actor_id=m.actor_id
  WHERE m.action_id='memory.forget' AND m.state='applied'
), transition AS (
  SELECT r.* FROM quellight_product_v1.room_learning_revisions r JOIN target c ON c.room_id=r.room_id AND c.actor_id=r.actor_id
  WHERE r.kind='forgotten'
), originals AS (
  SELECT source.* FROM target c JOIN transition t ON t.room_id=c.room_id
  JOIN quellight_product_v1.room_learning_revisions previous ON previous.actor_id=c.actor_id AND previous.room_id=c.room_id AND previous.revision=t.previous_revision
  CROSS JOIN LATERAL jsonb_array_elements(previous.fields) AS field
  CROSS JOIN LATERAL jsonb_array_elements(field->'sources') AS source
)
SELECT json_build_object('scope','Q4-014 actual phone flow and read-only governed receipt audit',
  'phoneConversation', c.id, 'syntheticRoom', c.room_id,
  'browserObservation', 'Correction, reopen, restoration and selected original were visible. The Forget click produced no observed POST acknowledgement.',
  'careAction', m.action_id, 'careState',m.state, 'sourceId',m.source_id,
  'commandCreatedMYT',m.created_at AT TIME ZONE 'Asia/Kuala_Lumpur',
  'commandAppliedMYT',m.updated_at AT TIME ZONE 'Asia/Kuala_Lumpur',
  'roomPublishedMYT',r.created_at AT TIME ZONE 'Asia/Kuala_Lumpur',
  'sourceWasInPreviousVersion',(SELECT bool_or(value->>'id'=m.source_id) FROM originals),
  'allReferencedExcerptsRemainInTranscript',(SELECT bool_and(EXISTS(SELECT 1 FROM quellight_product_v1.conversation_turns t WHERE t.actor_id=c.actor_id AND t.conversation_id=c.id AND position(value->>'quote' in t.input_text)>0)) FROM originals WHERE value->>'id'=m.source_id),
  'previousRevision',r.previous_revision,'publishedRevision',r.revision,'publicationKind',r.kind,
  'resultAuthorityMatchesPublication',m.result->>'authorityRevision'=r.authority_revision,
  'nativeOperation',m.native_operation_id,
  'affectedDimensions',r.changed,'currentFieldCountAtForget',jsonb_array_length(r.fields))
FROM target c JOIN care m ON m.actor_id=c.actor_id AND m.conversation_id=c.id
JOIN transition r ON r.actor_id=c.actor_id AND r.room_id=c.room_id AND r.authority_revision=m.intended_authority_revision;
COMMIT;
