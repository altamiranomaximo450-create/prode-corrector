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

-- ---------------------------------------------------------------------------
--  PDFs grandes: trabajos de procesamiento por partes
--
--  Un "trabajo" representa la subida y el procesamiento de UN PDF, partido en
--  chunks (pedazos de páginas) que el navegador sube directo a Supabase
--  Storage -- nunca pasan por una función de Vercel -- y que un worker aparte
--  (worker/index.ts, fuera de Vercel) procesa de a poco, guardando progreso en
--  esta misma fila para poder retomar si se interrumpe.
-- ---------------------------------------------------------------------------

create table if not exists public.prode_trabajos (
  id                 text primary key,
  fecha_id           text not null references public.prode_fechas (id) on delete cascade,
  nombre_archivo     text not null,
  bytes_totales      bigint not null default 0,
  paginas_totales    integer not null default 0,
  -- subiendo -> pendiente -> extrayendo -> analizando -> completado
  --                                              \-> error / cancelado
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

alter table public.prode_trabajos enable row level security;
revoke all on public.prode_trabajos from anon, authenticated;

-- Cada chunk extraído escribe SU PROPIA fila acá (no un blob que crece y se
-- reescribe entero en cada chunk): así el costo de guardar el progreso de un
-- chunk es siempre chico, sin importar cuántas páginas ya se llevan
-- acumuladas de chunks anteriores. Reescribir un único blob creciente se
-- probó en la práctica y terminaba en timeout con PDFs de varios chunks.
create table if not exists public.prode_trabajo_paginas (
  trabajo_id text not null references public.prode_trabajos (id) on delete cascade,
  indice     integer not null,
  paginas    jsonb not null,
  creado_en  timestamptz not null default now(),
  primary key (trabajo_id, indice)
);

alter table public.prode_trabajo_paginas enable row level security;
revoke all on public.prode_trabajo_paginas from anon, authenticated;

-- ---------------------------------------------------------------------------
--  Storage: bucket privado para los chunks de PDF subidos.
--
--  El límite de 47 MB por archivo queda A PROPÓSITO por debajo del tope duro
--  de 50 MB que impone el plan gratuito de Supabase Storage (no es elegible:
--  Supabase lo rechaza igual si se pone más alto). El PDF original puede pesar
--  250 MB o más porque se sube partido en varios objetos de este tamaño.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('prode-pdfs', 'prode-pdfs', false, 49283072) -- 47 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- Sin políticas de storage.objects: la subida se hace con un token firmado
-- (creado en el servidor con la service_role, ver /api/fechas/[id]/subida) que
-- autoriza esa única escritura sin depender de RLS, y la descarga la hace
-- sólo el worker con la service_role. La clave anon nunca puede leer ni listar
-- este bucket por su cuenta.
