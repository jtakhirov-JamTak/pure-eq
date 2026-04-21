-- Drop the user_profiles delete RLS policy.
--
-- The app never calls `.delete()` on user_profiles; leaving the user-writable
-- delete policy allows any authenticated user to DELETE their own profile row
-- via PostgREST and then retake onboarding. Before this migration, that flow
-- was harmless. After the 7-day free Tools window landed (see
-- docs/access_route_matrix.md + src/lib/subscription.ts), the earliest
-- `user_profiles.created_at` row anchors the window — so delete + retake
-- resets the anchor and re-opens free Tools access indefinitely.
--
-- Closing the delete path hardens the anchor. If a retake flow ever needs
-- to remove old profile rows, it must run via the service-role client
-- (which bypasses RLS), not the user session.

drop policy if exists "user_profiles_delete_own" on public.user_profiles;
