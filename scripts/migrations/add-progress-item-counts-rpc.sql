-- =====================================================================
-- get_progress_item_counts RPC — per-drawing status counts for the
-- Progress Drawings list, aggregated server-side.
--
-- WHAT THIS DOES:
--   Returns one row per drawing: total + green/yellow/red, counting only
--   real points. Annotation labels (circle/text/comment) are excluded so
--   the list matches the detail view (ProgressViewer), which excludes them.
--
-- WHY:
--   The list previously fetched every progress_items row and counted
--   client-side. With >1000 items the PostgREST response was capped
--   (3385 rows -> 1000), undercounting every drawing — and unstably,
--   since the query had no ORDER BY. Aggregating inside Postgres returns
--   ~1 row per drawing, far under the API row cap, so it is cap-immune.
--
-- SECURITY:
--   SECURITY INVOKER (default) — runs as the calling manager, so the SAME
--   RLS on progress_items (company_id = get_my_company_id()) applies. The
--   function carries no company filter of its own and adds no new access;
--   visibility is identical to the previous direct query. Granted to
--   authenticated only (manager-only page; no anon read path introduced).
--
-- ROLLBACK:
--   see add-progress-item-counts-rpc-rollback.sql
--   (DROP FUNCTION IF EXISTS public.get_progress_item_counts();)
--
-- RUN IN: Supabase SQL Editor
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_progress_item_counts()
RETURNS TABLE (drawing_id uuid, total bigint, green bigint, yellow bigint, red bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    pi.drawing_id,
    count(*)                                     AS total,
    count(*) FILTER (WHERE pi.status = 'green')  AS green,
    count(*) FILTER (WHERE pi.status = 'yellow') AS yellow,
    count(*) FILTER (WHERE pi.status = 'red')    AS red
  FROM public.progress_items pi
  WHERE coalesce(pi.label, '') NOT IN ('circle', 'text', 'comment')
  GROUP BY pi.drawing_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_progress_item_counts() TO authenticated;
