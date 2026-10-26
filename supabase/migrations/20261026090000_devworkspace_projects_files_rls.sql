-- DevWorkspace Pro: private projects and file content, protected by Supabase RLS.
create table if not exists public.dwp_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dwp_projects_owner_updated_idx
  on public.dwp_projects (owner_id, updated_at desc);

create table if not exists public.dwp_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.dwp_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 500),
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);
create index if not exists dwp_files_owner_project_idx
  on public.dwp_files (owner_id, project_id);

alter table public.dwp_projects enable row level security;
alter table public.dwp_files enable row level security;

drop policy if exists "DWP owners select projects" on public.dwp_projects;
create policy "DWP owners select projects" on public.dwp_projects for select to authenticated
  using ((select auth.uid()) = owner_id);
drop policy if exists "DWP owners insert projects" on public.dwp_projects;
create policy "DWP owners insert projects" on public.dwp_projects for insert to authenticated
  with check ((select auth.uid()) = owner_id);
drop policy if exists "DWP owners update projects" on public.dwp_projects;
create policy "DWP owners update projects" on public.dwp_projects for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
drop policy if exists "DWP owners delete projects" on public.dwp_projects;
create policy "DWP owners delete projects" on public.dwp_projects for delete to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "DWP owners select files" on public.dwp_files;
create policy "DWP owners select files" on public.dwp_files for select to authenticated
  using ((select auth.uid()) = owner_id);
drop policy if exists "DWP owners insert files" on public.dwp_files;
create policy "DWP owners insert files" on public.dwp_files for insert to authenticated
  with check ((select auth.uid()) = owner_id and exists (
    select 1 from public.dwp_projects p where p.id = project_id and p.owner_id = (select auth.uid())
  ));
drop policy if exists "DWP owners update files" on public.dwp_files;
create policy "DWP owners update files" on public.dwp_files for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and exists (
    select 1 from public.dwp_projects p where p.id = project_id and p.owner_id = (select auth.uid())
  ));
drop policy if exists "DWP owners delete files" on public.dwp_files;
create policy "DWP owners delete files" on public.dwp_files for delete to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.dwp_projects to authenticated;
grant select, insert, update, delete on public.dwp_files to authenticated;
