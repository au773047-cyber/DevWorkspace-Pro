-- Existing project-wide helper was exposed as an RPC despite being SECURITY DEFINER.
-- It should not be callable by browser roles.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
