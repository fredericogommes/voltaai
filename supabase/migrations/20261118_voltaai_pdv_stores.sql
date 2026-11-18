-- Aplicada no projeto Supabase "voltaai" em 2026-11-18.
-- Lojas que usam o Voltaai CRM. O CRM só libera o painel para quem é dono de uma loja aqui (server.js, requireAdmin).
create schema if not exists voltaai_pdv;

create table voltaai_pdv.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);
create index stores_owner_idx on voltaai_pdv.stores(owner_id);

alter table voltaai_pdv.stores enable row level security;
create policy "dono ve a propria loja" on voltaai_pdv.stores
  for select to authenticated using (owner_id = (select auth.uid()));

grant usage on schema voltaai_pdv to authenticated, service_role;
grant select on voltaai_pdv.stores to authenticated;
grant all on voltaai_pdv.stores to service_role;
revoke all on voltaai_pdv.stores from anon;

-- expõe o schema na API REST (Accept-Profile: voltaai_pdv)
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, voltaai_pdv';
notify pgrst, 'reload config';
