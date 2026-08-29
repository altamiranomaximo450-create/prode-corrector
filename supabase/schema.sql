-- ---------------------------------------------------------------------------
--  Corrector de Prode — esquema para Supabase (Postgres)
--
--  Cómo usarlo:
--    1. Entrá a supabase.com y creá un proyecto (el plan gratuito alcanza).
--    2. Abrí SQL Editor, pegá este archivo entero y ejecutalo.
--    3. En Project Settings → API copiá:
--         Project URL          -> SUPABASE_URL  y  NEXT_PUBLIC_SUPABASE_URL
--         anon public          -> NEXT_PUBLIC_SUPABASE_ANON_KEY
--         service_role secret  -> SUPABASE_SERVICE_ROLE_KEY
--
--  Supabase es el ÚNICO almacén de la aplicación. No hay modo "archivos" ni
--  "memoria": tener varios motores fue exactamente lo que rompía el
--  procesamiento, porque la fecha se guardaba en uno y el worker la buscaba en
--  otro ("la fecha no existe").
--
--  Seguridad: se activa RLS y NO se crea ninguna política. Sin políticas, la
--  clave pública (anon) no puede leer ni escribir NADA de estas tablas. Sólo la
--  service_role —que vive únicamente en el servidor y en el worker— pasa por
--  encima de RLS.
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
  -- Orden explícito dentro de la fecha: el ranking se calcula sobre estas filas
  -- y creada_en no distingue dos boletas insertadas en el mismo milisegundo.
  orden     integer not null default 0,
  datos     jsonb not null,
  creada_en timestamptz not null default now()
);

create index if not exists prode_boletas_fecha_idx on public.prode_boletas (fecha_id);
create index if not exists prode_boletas_orden_idx on public.prode_boletas (fecha_id, orden);
create index if not exists prode_fechas_creada_idx on public.prode_fechas (creada_en desc);

-- ---------------------------------------------------------------------------
--  Trabajos de procesamiento de PDF
--
--  Un trabajo es la subida y el procesamiento de UN PDF, partido en pedazos que
--  el navegador sube DIRECTO a Supabase Storage —nunca pasan por una función de
--  Vercel— y que el worker (worker/index.ts, fuera de Vercel) procesa de a uno,
--  guardando progreso acá para poder retomar si se interrumpe.
-- ---------------------------------------------------------------------------

create table if not exists public.prode_trabajos (
  id                 text primary key,
  fecha_id           text not null references public.prode_fechas (id) on delete cascade,
  nombre_archivo     text not null,
  bytes_totales      bigint not null default 0,
  paginas_totales    integer not null default 0,
  -- subiendo -> pendiente -> extrayendo -> analizando -> completado / error
  estado             text not null default 'subiendo',
  -- Array de { indice, paginaDesde, paginaHasta, storagePath, bytes, estado, error? }
  chunks             jsonb not null default '[]'::jsonb,
  paginas_extraidas  integer not null default 0,
  boletas_detectadas integer not null default 0,
  mensaje            text,
  error              text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);

create index if not exists prode_trabajos_fecha_idx on public.prode_trabajos (fecha_id);
create index if not exists prode_trabajos_estado_idx on public.prode_trabajos (estado, creado_en);

-- Cada parte extraída escribe SU PROPIA fila acá, no un blob que crece y se
-- reescribe entero en cada parte: así guardar el progreso cuesta siempre lo
-- mismo, sin importar cuántas páginas se lleven acumuladas. Reescribir un único
-- blob creciente se probó y terminaba en timeout con PDFs de varias partes.
create table if not exists public.prode_trabajo_paginas (
  trabajo_id text not null references public.prode_trabajos (id) on delete cascade,
  indice     integer not null,
  paginas    jsonb not null,
  creado_en  timestamptz not null default now(),
  primary key (trabajo_id, indice)
);

-- ---------------------------------------------------------------------------
--  RLS: activado y sin políticas => la clave anon no llega a ningún dato.
-- ---------------------------------------------------------------------------

alter table public.prode_fechas          enable row level security;
alter table public.prode_boletas         enable row level security;
alter table public.prode_trabajos        enable row level security;
alter table public.prode_trabajo_paginas enable row level security;

revoke all on public.prode_fechas          from anon, authenticated;
revoke all on public.prode_boletas         from anon, authenticated;
revoke all on public.prode_trabajos        from anon, authenticated;
revoke all on public.prode_trabajo_paginas from anon, authenticated;

-- ---------------------------------------------------------------------------
--  Storage: bucket privado para las partes del PDF.
--
--  El límite de 47 MB por objeto queda a propósito por debajo del tope duro de
--  50 MB del plan gratuito (Supabase lo rechaza igual si se pone más alto). El
--  PDF original puede pesar 250 MB o más: se sube partido en varios objetos.
--
--  Sin políticas de storage.objects: la subida se hace con un token firmado que
--  crea el servidor con la service_role, y la descarga la hace sólo el worker.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('prode-pdfs', 'prode-pdfs', false, 49283072) -- 47 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
