-- Molla Pro Zone AI — Supabase schema
-- Run this once in Supabase SQL Editor.

create extension if not exists citext;

create table if not exists public.app_settings (
  id boolean primary key default true check (id = true),
  welcome_credits integer not null default 500 check (welcome_credits >= 0),
  chat_cost integer not null default 1 check (chat_cost >= 0),
  image_cost integer not null default 20 check (image_cost >= 0),
  video_cost integer not null default 50 check (video_cost >= 0),
  voice_cost integer not null default 10 check (voice_cost >= 0),
  project_cost integer not null default 20 check (project_cost >= 0),
  bkash_number text not null default '01729834248',
  bkash_type text not null default 'Personal',
  updated_at timestamptz not null default now()
);
insert into public.app_settings(id) values(true) on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext unique,
  username citext unique not null,
  full_name text not null default '',
  credits integer not null default 0 check (credits >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  reference text,
  created_at timestamptz not null default now()
);

create table if not exists public.recharge_packages (
  id bigint generated always as identity primary key,
  name text not null,
  credits integer not null check (credits > 0),
  price_bdt integer not null check (price_bdt > 0),
  active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.recharge_packages(name,credits,price_bdt,sort_order)
select * from (values
 ('Starter',3000,30,1),
 ('Popular',5000,50,2),
 ('Power',10000,100,3)
) as x(name,credits,price_bdt,sort_order)
where not exists (select 1 from public.recharge_packages);

create table if not exists public.recharge_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id bigint not null references public.recharge_packages(id),
  trx_id citext not null unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.media_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('video')),
  operation_name text not null,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  result_url text,
  error text,
  charge_amount integer not null default 0,
  refunded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare w integer;
declare uname text;
begin
  select welcome_credits into w from public.app_settings where id=true;
  uname := coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1));
  -- ensure a unique fallback if needed
  if exists(select 1 from public.profiles where username=uname) then
    uname := uname || '_' || substr(new.id::text,1,6);
  end if;
  insert into public.profiles(id,email,username,full_name,credits)
  values(new.id,new.email,uname,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(w,500));
  insert into public.credit_ledger(user_id,amount,balance_after,reason,reference)
  values(new.id,coalesce(w,500),coalesce(w,500),'welcome_bonus','signup');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.charge_credits(p_user uuid,p_amount integer,p_reason text,p_reference text default null)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare bal integer;
begin
  if p_amount < 0 then raise exception 'Invalid charge'; end if;
  select credits into bal from public.profiles where id=p_user for update;
  if bal is null then raise exception 'User not found'; end if;
  if bal < p_amount then raise exception 'INSUFFICIENT_CREDITS'; end if;
  bal := bal - p_amount;
  update public.profiles set credits=bal,updated_at=now() where id=p_user;
  insert into public.credit_ledger(user_id,amount,balance_after,reason,reference) values(p_user,-p_amount,bal,p_reason,p_reference);
  return bal;
end; $$;

create or replace function public.refund_credits(p_user uuid,p_amount integer,p_reason text,p_reference text default null)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare bal integer;
begin
  if p_amount < 0 then raise exception 'Invalid refund'; end if;
  select credits into bal from public.profiles where id=p_user for update;
  bal := bal + p_amount;
  update public.profiles set credits=bal,updated_at=now() where id=p_user;
  insert into public.credit_ledger(user_id,amount,balance_after,reason,reference) values(p_user,p_amount,bal,p_reason,p_reference);
  return bal;
end; $$;

create or replace function public.approve_recharge(p_request bigint,p_admin uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare r public.recharge_requests%rowtype;
declare pkg public.recharge_packages%rowtype;
declare bal integer;
begin
  if not exists(select 1 from public.profiles where id=p_admin and is_admin=true) then raise exception 'NOT_ADMIN'; end if;
  select * into r from public.recharge_requests where id=p_request for update;
  if r.id is null then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'Request already reviewed'; end if;
  select * into pkg from public.recharge_packages where id=r.package_id;
  select credits into bal from public.profiles where id=r.user_id for update;
  bal := bal + pkg.credits;
  update public.profiles set credits=bal,updated_at=now() where id=r.user_id;
  update public.recharge_requests set status='approved',reviewed_by=p_admin,reviewed_at=now() where id=p_request;
  insert into public.credit_ledger(user_id,amount,balance_after,reason,reference) values(r.user_id,pkg.credits,bal,'recharge_approved','recharge:'||p_request);
  return bal;
end; $$;

create or replace function public.reject_recharge(p_request bigint,p_admin uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists(select 1 from public.profiles where id=p_admin and is_admin=true) then raise exception 'NOT_ADMIN'; end if;
  update public.recharge_requests set status='rejected',reviewed_by=p_admin,reviewed_at=now()
  where id=p_request and status='pending';
end; $$;

-- RLS
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.recharge_packages enable row level security;
alter table public.recharge_requests enable row level security;
alter table public.media_jobs enable row level security;

drop policy if exists "settings readable by authenticated" on public.app_settings;
create policy "settings readable by authenticated" on public.app_settings for select to authenticated using (true);
drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles for select to authenticated using (id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
drop policy if exists "ledger self read" on public.credit_ledger;
create policy "ledger self read" on public.credit_ledger for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
drop policy if exists "packages readable" on public.recharge_packages;
create policy "packages readable" on public.recharge_packages for select to authenticated using (active=true or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
drop policy if exists "recharge self read" on public.recharge_requests;
create policy "recharge self read" on public.recharge_requests for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
drop policy if exists "recharge self insert" on public.recharge_requests;
create policy "recharge self insert" on public.recharge_requests for insert to authenticated with check (user_id=auth.uid() and status='pending');
drop policy if exists "jobs self read" on public.media_jobs;
create policy "jobs self read" on public.media_jobs for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

-- Column privileges: users can read profiles but cannot change credits/admin flags.
revoke update on public.profiles from authenticated;
grant update(full_name,username) on public.profiles to authenticated;

-- Sensitive credit RPCs are service-role only.
revoke all on function public.charge_credits(uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.refund_credits(uuid,integer,text,text) from public,anon,authenticated;
revoke all on function public.approve_recharge(bigint,uuid) from public,anon,authenticated;
revoke all on function public.reject_recharge(bigint,uuid) from public,anon,authenticated;
grant execute on function public.charge_credits(uuid,integer,text,text) to service_role;
grant execute on function public.refund_credits(uuid,integer,text,text) to service_role;
grant execute on function public.approve_recharge(bigint,uuid) to service_role;
grant execute on function public.reject_recharge(bigint,uuid) to service_role;

-- Public generated media bucket. Object names are UUID-based and unguessable in normal use.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('user-media','user-media',true,52428800,array['image/png','image/jpeg','video/mp4','audio/wav','audio/x-wav','audio/mpeg'])
on conflict(id) do update set public=true;
