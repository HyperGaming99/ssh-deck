create table public.vault (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salt text not null,
  blob text not null,
  rev integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.vault enable row level security;
create policy "vault select" on public.vault for select using (auth.uid() = user_id);
create policy "vault insert" on public.vault for insert with check (auth.uid() = user_id);
create policy "vault update" on public.vault for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
