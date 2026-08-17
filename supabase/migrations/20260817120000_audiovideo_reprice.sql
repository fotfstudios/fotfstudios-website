-- supabase/migrations/20260817120000_audiovideo_reprice.sql
-- A+V add-on reprice: $49.990 → $39.990 (customer-favorable, market-aligned).
-- See docs/superpowers/specs/2026-08-17-services-restructure-design.md.
update addons set amount_clp = 39990 where key = 'audioVideo';
