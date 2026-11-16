-- Apply with Supabase administration authority after 001_product.
-- The migration and runtime roles receive no direct auth.sessions access.
CREATE OR REPLACE FUNCTION quellight_product_v1.owner_session_active(subject_id uuid, session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=$2 AND s.user_id=$1
    AND (s.not_after IS NULL OR s.not_after > now()))
$$;
REVOKE ALL ON FUNCTION quellight_product_v1.owner_session_active(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION quellight_product_v1.owner_session_active(uuid,uuid) TO ql_app_runtime;
