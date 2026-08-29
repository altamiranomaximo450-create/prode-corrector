-- ---------------------------------------------------------------------------
--  Corrector de Prode — esquema para Supabase (Postgres)
--
--  Cómo usarlo:
--    1. Entrá a supabase.com, creá un proyecto (el plan gratuito alcanza).
--    2. Abrí SQL Editor, pegá este archivo entero y ejecutalo.
--    3. En Project Settings → API copiá:
--         Project URL          -> SUPABASE_URL
--         service_role secret  -> SUPABASE_SERVICE_ROLE_KEY
--    4. Cargá esas dos variables en Vercel junto con STORAGE_DRIVER=supabase.
--
--  Seguridad: se activa RLS y NO se crea ninguna política. Con eso, la clave
--  pública (anon) no puede leer ni escribir NADA. Sólo la clave service_role
--  —que vive únicamente en el servidor— pasa por encima de RLS. Los datos de
--  los participantes no quedan expuestos aunque alguien conozca la URL.
-- ---------------------------------------------------------------------------

create table if not exists public.prode_fechas (
  id             text primary key,
  datos          jsonb       not null,
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

create table if not exists public.prode_boletas (
  id        text primary key,
  fecha_id  text not null references public.prode_fechas (id) on delete cascade,
  datos     jsonb not null,
  creada_en timestamptz not null default now()
);

-- Banderas de configuración que deben sobrevivir a un reinicio
-- (por ejemplo: "el administrador borró los datos de demostración").
create table if not exists public.prode_config (
  clave text primary key,
  valor text not null default ''
);

create index if not exists prode_boletas_fecha_idx on public.prode_boletas (fecha_id);
create index if not exists prode_fechas_creada_idx on public.prode_fechas (creada_en desc);

alter table public.prode_fechas  enable row level security;
alter table public.prode_boletas enable row level security;
alter table public.prode_config  enable row level security;

-- A propósito no se define ninguna política: sin políticas, RLS deniega todo
-- a las claves anónimas. El acceso llega sólo desde el servidor autenticado.

-- Si alguna vez querés revocar además los permisos de tabla (defensa en
-- profundidad, por si se agregara una política por error):
revoke all on public.prode_fechas  from anon, authenticated;
revoke all on public.prode_boletas from anon, authenticated;
revoke all on public.prode_config  from anon, authenticated;
