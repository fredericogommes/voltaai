-- Cópia do CRM no Supabase (supabase-sync.js), clube de fidelidade e QR codes.
-- Aplicada no projeto Supabase "voltaai" em 2026-11-18.
--
-- Acesso: o CRM usa a chave publicável + o cabeçalho x-crm-key (SUPABASE_CRM_SECRET do .env).
-- O banco guarda só o SHA-256 do segredo em private.config ('crm_secret_sha256'); sem ele, a RLS não mostra nada.
-- As Edge Functions (clube, qr) usam a service role e passam por cima da RLS.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.config (key text primary key, value text not null);
insert into private.config (key, value) values ('pepper', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (key) do nothing;

-- true quando o pedido traz o segredo do CRM no cabeçalho x-crm-key
create or replace function private.crm_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    encode(sha256(convert_to(coalesce(current_setting('request.headers', true)::json->>'x-crm-key', ''), 'UTF8')), 'hex')
      = (select value from private.config where key = 'crm_secret_sha256'),
    false)
$$;
grant usage on schema private to anon, authenticated, service_role;
revoke all on private.config from anon, authenticated;
grant execute on function private.crm_ok() to anon, authenticated, service_role;

-- pimenta dos hashes de telefone: o CRM lê com o segredo; as Edge Functions, com a service role
create or replace function public.crm_pepper() returns text
language sql stable security definer set search_path = '' as $$
  select value from private.config where key = 'pepper' and private.crm_ok()
$$;
revoke execute on function public.crm_pepper() from public;
grant execute on function public.crm_pepper() to anon, authenticated;

create or replace function public.fn_pepper_service() returns text
language sql stable security definer set search_path = '' as $$
  select value from private.config where key = 'pepper'
$$;
revoke execute on function public.fn_pepper_service() from public, anon, authenticated;
grant execute on function public.fn_pepper_service() to service_role;

-- ---------- espelho do SQLite (mesmas colunas do db.js) ----------
create table public.customers (
  id bigint primary key, name text, phone text unique, opt_out boolean default false, created_at timestamptz,
  birth_date text, external_id text unique, email text, email_optin timestamptz, address text, address_number text,
  address_complement text, address_reference text, district text, excluded boolean default false
);
create table public.orders (
  id bigint primary key, external_id text unique, customer_id bigint references public.customers(id) on delete cascade,
  total double precision, created_at timestamptz, channel text, sale_type integer, items_total double precision,
  discount double precision, increase double precision, coupon text, delivery_fee double precision, district text, payment text
);
create index on public.orders (customer_id, created_at);
create table public.flows (
  id bigint primary key, name text, status text, trigger jsonb, steps jsonb, schedule jsonb, exit_on_order boolean,
  reentry_days integer, start_order_id bigint, activated_at timestamptz, created_at timestamptz
);
create table public.campaigns (
  id bigint primary key, name text, channel text, min_days integer, max_days integer, min_orders integer, cooldown_days integer,
  message text, active boolean, ads jsonb, category text, status text, schedule jsonb, flow_id bigint references public.flows(id) on delete set null,
  created_at timestamptz, updated_at timestamptz
);
create table public.messages (
  id bigint primary key, campaign_id bigint references public.campaigns(id) on delete cascade,
  customer_id bigint references public.customers(id) on delete cascade, status text, error text, sent_at timestamptz,
  variant text, rfv_group text
);
create index on public.messages (customer_id, sent_at);
create table public.order_items (
  id bigint primary key, order_id bigint references public.orders(id) on delete cascade, item_id text unique,
  product_key text, name text, quantity double precision, unit_price double precision
);
create index on public.order_items (order_id);
create table public.item_choices (
  id bigint primary key, item_id bigint references public.order_items(id) on delete cascade,
  choice_key text, name text, extra double precision
);
create index on public.item_choices (item_id);
create table public.flow_runs (
  id bigint primary key, flow_id bigint references public.flows(id) on delete cascade,
  customer_id bigint references public.customers(id) on delete cascade, trigger_ref bigint, step integer, state text,
  next_at timestamptz, entered_at timestamptz, finished_at timestamptz, exit_reason text, fails integer,
  unique (flow_id, customer_id, trigger_ref)
);
create table public.templates (
  id bigint primary key, campaign_id bigint references public.campaigns(id) on delete cascade, variant text, name text,
  meta_id text, status text, error text, updated_at timestamptz, unique (campaign_id, variant)
);
create table public.loyalty_redemptions (
  id bigint primary key, customer_id bigint references public.customers(id) on delete cascade,
  pontos integer, premio text, created_at timestamptz
);
create table public.meta (key text primary key, value text);

-- ---------- clube de fidelidade (página pública: função "clube") ----------
create table public.loyalty_program (id integer primary key, nome text, regras text, recompensas jsonb, ativo boolean default false, updated_at timestamptz);
create table public.loyalty_cards (
  phone_hash text primary key, first_name text, points integer, next_reward text, missing integer, expires_soon integer, updated_at timestamptz
);
create table public.loyalty_signups (
  id bigint generated always as identity primary key, phone_hash text not null, email text not null,
  consent boolean not null default false, created_at timestamptz not null default now()
);
create table public.loyalty_lookups (id bigint generated always as identity primary key, visitor text not null, at timestamptz not null default now());
create index on public.loyalty_lookups (visitor, at);

-- ---------- QR codes (página pública: função "qr") ----------
create table public.qr_codes (
  code text primary key check (code ~ '^[a-z0-9]{4,16}$'), name text not null, destino text not null, material text,
  active boolean not null default true, expires_at timestamptz, created_at timestamptz not null default now()
);
create table public.qr_scans (
  id bigint generated always as identity primary key, code text not null references public.qr_codes(code) on delete cascade,
  visitor text, at timestamptz not null default now()
);
create index on public.qr_scans (code, at);
create view public.qr_stats with (security_invoker = true) as
  select code, count(*)::int as scans, count(distinct visitor)::int as pessoas, max(at) as ultimo_scan,
    (count(*) filter (where at > now() - interval '7 days'))::int as scans_7d,
    (count(*) filter (where at > now() - interval '30 days'))::int as scans_30d,
    (count(*) filter (where at > now() - interval '90 days'))::int as scans_90d
  from public.qr_scans group by code;

-- ---------- RLS: tudo fechado, menos para quem traz o segredo do CRM ----------
do $$
declare t text;
begin
  foreach t in array array['customers','orders','flows','campaigns','messages','order_items','item_choices','flow_runs',
    'templates','loyalty_redemptions','meta','loyalty_program','loyalty_cards','loyalty_signups','loyalty_lookups','qr_codes','qr_scans']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "so o CRM" on public.%I for all to anon, authenticated using ((select private.crm_ok())) with check ((select private.crm_ok()))', t);
  end loop;
end $$;
