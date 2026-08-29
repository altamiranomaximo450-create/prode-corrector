# Corrector de Prode

Una sola pantalla, un solo flujo:

```
NUEVA FECHA -> partidos y resultados oficiales -> subir PDF -> PROCESAR BOLETAS -> RANKING TOP 10
```

No hay login, ni panel, ni estadísticas. Se carga la fecha, se sube el PDF con
todas las boletas y sale el ranking. Al tocar una posición se ve el detalle
partido por partido para comprobar el cálculo.

## Instalación

```bash
npm install
```

Requiere Node 20 o superior.

## Variables de entorno

Copiar `.env.example` a `.env.local` y completar. Supabase es el único
almacén: sin estas variables la aplicación no arranca.

| Variable | Dónde se usa | Secreta |
| --- | --- | --- |
| `SUPABASE_URL` | servidor y worker | no |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor y worker | **sí** |
| `NEXT_PUBLIC_SUPABASE_URL` | navegador | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador | no |
| `PRODE_PDF_BUCKET` | opcional, por defecto `prode-pdfs` | no |
| `MAX_CHUNK_MB` | opcional, por defecto `45` | no |

La `service_role` es la única secreta y nunca sale del servidor: no lleva el
prefijo `NEXT_PUBLIC_`, así que el navegador no la ve. La clave `anon` sí llega
al navegador —está diseñada para eso— y por sí sola no puede leer ni escribir
nada, porque las tablas tienen RLS activado sin ninguna política.

## Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com) (el plan gratuito alcanza).
2. Abrir **SQL Editor**, pegar `supabase/schema.sql` entero y ejecutarlo. Eso
   crea las tablas, activa RLS y crea el bucket privado `prode-pdfs`.
3. En **Project Settings → API** copiar los valores a `.env.local`.

## Ejecución

Hacen falta **dos procesos**:

```bash
npm run dev
```

```bash
npm run worker
```

El worker es el que procesa los PDF. Sin él la subida termina pero el trabajo
queda en cola y la pantalla se queda en "esperando al worker". Se puede apagar y
volver a prender: retoma desde la última parte procesada.

## Cómo se procesa el PDF

El PDF puede pesar 250 MB o más, así que **nunca** pasa por una función de
Vercel (allí el cuerpo de una petición no puede superar unos 4,5 MB, y el
tiempo de ejecución está limitado):

1. El navegador parte el PDF con `pdf-lib`, en pedazos que entren bajo el
   límite de Supabase Storage.
2. Cada pedazo se sube **directo a Supabase Storage** con una URL firmada que
   emite el servidor. Las funciones de Vercel sólo mueven ese permiso, jamás los
   bytes del archivo.
3. El worker descarga los pedazos **de a uno**, les extrae el texto con
   `pdfjs-dist` y guarda el progreso después de cada uno. Nunca tiene el PDF
   completo en memoria: como mucho, un pedazo.
4. Con todos los pedazos extraídos, analiza una sola vez el documento completo
   ya recompuesto y guarda las boletas.

El paso 3 es el checkpoint: si el worker se cae o se apaga a mitad de camino, al
volver a arrancarlo sigue desde el pedazo siguiente en vez de empezar de cero.

No se usa ninguna API de IA paga: la lectura es `pdfjs-dist` más un analizador
propio.

### Cómo se leen las boletas

El analizador no asume un formato. Prueba varias maneras de partir el documento
en boletas (por número de boleta, por nombre del participante, por página, por
columnas, por bloques separados con espacio en blanco), puntúa cada una según
cuántas boletas leen la cantidad de partidos que tiene la fecha, y se queda con
la mejor. Por eso soporta varias boletas en una página, y una boleta repartida
entre dos páginas.

Nada detiene el procesamiento. Si un partido no se puede leer queda vacío y vale
0 **para esa boleta**; si una boleta no tiene nombre legible entra al ranking
como "Sin nombre (página N)". Los participantes nunca se deduplican: tres
boletas de Juan Pérez son tres boletas y las tres cuentan.

### Cálculo

100% determinístico, sin IA. Para cada partido, el pronóstico acierta si
**contiene** el resultado oficial, que es la única fuente de verdad. Un doble
(`1/X`, y también `X/1`, `1 X`, `1-X`) acierta con `1` y con `X`, y falla con
`2`. Un partido sin resultado oficial cargado no computa para nadie.

En el ranking los empatados comparten posición y no se elimina a ninguno. A
igualdad de aciertos el orden de impresión se decide por número de boleta,
página, nombre y, por último, orden de aparición en el PDF: el mismo archivo
produce siempre el mismo listado.

## Build y despliegue

```bash
npm run typecheck
npm test
npm run build
```

En Vercel se despliega **sólo el frontend y las rutas de API** (que son livianas:
crean la fecha, firman las subidas y consultan el progreso). Está desplegado en
**https://prode-corrector.vercel.app**.

Con la CLI de Vercel ya enlazada al proyecto (`npx vercel link`):

```bash
npx vercel env add NOMBRE_VARIABLE production preview development
npx vercel --prod
```

Las 6 variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PRODE_PDF_BUCKET`,
`MAX_CHUNK_MB`) tienen que estar cargadas en los tres entornos antes de
desplegar. Las dos `NEXT_PUBLIC_*` son JWT de Supabase, así que la CLI las
detecta como credencial y exige el flag explícito `--type config` (exponerla al
navegador es intencional: ver la sección de arriba) — sin eso, `vercel env add`
falla en silencio para esa variable puntual y el sitio queda desplegado sin
poder subir PDFs. Comprobar con `npx vercel env ls production` que las 6 estén
antes de cada deploy.

El worker **no va en Vercel**: corre donde haya Node y conexión a Supabase —la
computadora del operador, un VPS, una Raspberry—. Sólo necesita `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` en su `.env.local`, y se arranca con `npm run worker`.
Sin el worker corriendo, las fechas se crean y el PDF se sube, pero el trabajo
queda en cola para siempre y la pantalla se queda en "esperando al worker".

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | servidor de desarrollo |
| `npm run worker` | worker de PDF (en bucle) |
| `npm run worker:once` | procesa un trabajo pendiente y termina |
| `npm run build` | build de producción |
| `npm run typecheck` | comprobación de tipos |
| `npm test` | tests del cálculo y del lector de pronósticos |
| `npm run pdf:prueba [n]` | genera un PDF de boletas de prueba en `muestras/` |

`npm run pdf:prueba` arma un PDF que a propósito no es fácil: boletas repetidas
del mismo nombre, una sin nombre, dobles, un partido sin marcar y boletas
partidas entre dos páginas. Junto al PDF deja un `.json` con lo que debería
leerse, para comparar contra el resultado real. Con un número (`npm run
pdf:prueba 600`) genera uno grande para probar el procesamiento por partes.

Para entender el formato de un PDF real y ajustar el analizador:

```bash
npx tsx scripts/inspeccionar-pdf.mts ruta/al/archivo.pdf
```

Muestra, línea por línea, el texto que el sistema realmente extrae.
