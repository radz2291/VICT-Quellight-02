-- Per-turn admission pins; nullable for preserved Phase 1/2 turns.
ALTER TABLE quellight_product_v1.conversation_turns ADD COLUMN IF NOT EXISTS desk_binding jsonb;
