ALTER TABLE quellight_product_v1.conversation_turns
  ADD COLUMN room_guidance_revision integer CHECK (room_guidance_revision > 0);
