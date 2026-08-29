# Corrector de Prode

Una sola pantalla, un solo flujo:

```
NUEVA FECHA -> partidos y resultados oficiales -> subir PDF -> PROCESAR BOLETAS -> TOP 10
```

No hay login, ni panel, ni estadísticas. Se carga la fecha, se sube el PDF con
todas las boletas y sale el ranking. Al tocar una posición se ve el detalle
partido por partido para comprobar el cálculo.

**El procesamiento arranca solo.** No hay que ejecutar nada a mano ni dejar
ninguna computadora prendida: cuando se aprieta PROCESAR BOLETAS, la aplicación
levanta ella misma el worker que lee el PDF.

---

## Cómo funciona (en 30 segundos)

```
NAVEGADOR                    VERCEL                 SUPABASE            GITHUB ACTIONS
   |                           |                        |                     |
   |-- crea la fecha --------->|-- guarda ------------->|                     |
   |-- parte el PDF            |                        |                     |
   |-- sube cada parte --------------------------------->| Storage            |
   |-- "procesar" ------------>|-- encola ------------->|                     |
   |                           |-- despierta al worker ------------------------>|
   |                           |                        |<-- lee el PDF -------|
   |-- pregunta el progreso -->|<-- progreso -----------|<-- guarda boletas ---|
   |<-- TOP 10 ----------------|                        |                     |
```

Tres decisiones que explican todo lo demás:

- **El PDF no pasa por Vercel.** El navegador lo parte y sube cada pedazo
  directo a Supabase Storage con un permiso firmado. Por eso admite archivos de
  250 MB o más sin chocar con los límites de una función serverless.
- **El procesamiento pesado corre en GitHub Actions**, que da 4 vCPU, 16 GB de
  RAM y horas de tiempo. Vercel se queda solo con la aplicación y una API
  liviana.
- **Supabase es el único almacén.** Fechas, boletas, progreso y archivos, todo
  en el mismo lugar. Tener varios almacenes fue lo que rompía el procesamiento
  con el error "la fecha no existe".

---

## Instalación

```bash
npm install
```

Node 20 o superior.

Si los PDF de boletas son **imágenes** (fotos o capturas de pantalla, que es lo
habitual), hace falta además Python 3.10+ con:

```bash
pip install -r worker/requisitos.txt
```

Son tres paquetes de pip (PyMuPDF, numpy y RapidOCR) y no necesitan permisos de
administrador ni instalar nada del sistema operativo. Si el PDF tiene texto de
verdad, esto no hace falta.

---

## Configuración

### 1. Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com). El plan gratuito alcanza.
2. Abrir **SQL Editor**, pegar `supabase/schema.sql` entero y ejecutarlo. Crea
   las tablas, activa RLS y crea el bucket privado `prode-pdfs`. Se puede
   volver a ejecutar cuando quieras: no borra datos.
3. En **Project Settings → API** copiar los valores al paso siguiente.

### 2. Variables de entorno

Copiar `.env.example` a `.env.local` y completar:

| Variable | Para qué | Secreta |
| --- | --- | --- |
| `SUPABASE_URL` | servidor y worker | no |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor y worker | **sí** |
| `NEXT_PUBLIC_SUPABASE_URL` | navegador | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador | no |
| `GITHUB_WORKER_REPO` | arranque automático en producción | no |
| `GITHUB_WORKER_TOKEN` | arranque automático en producción | **sí** |
| `PRODE_PDF_BUCKET` | opcional, por defecto `prode-pdfs` | no |
| `MAX_CHUNK_MB` | opcional, por defecto `45` | no |

La `service_role` y el token de GitHub son las únicas secretas y nunca salen
del servidor. La clave `anon` sí llega al navegador —está diseñada para eso— y
por sí sola no puede leer ni escribir nada: las tablas tienen RLS activado sin
ninguna política.

### 3. Correr localmente

```bash
npm run dev
```

Y nada más. **En desarrollo el worker también arranca solo**: al encolar un PDF,
el servidor lanza `npm run worker:once` como proceso aparte.

Si querés tenerlo corriendo a mano igual (para ver los logs):

```bash
npm run worker:bucle
```

---

## Despliegue

### Frontend en Vercel

1. Subir el repositorio a GitHub.
2. En Vercel, **Add New → Project** y elegir el repositorio. Next.js se detecta solo.
3. En **Settings → Environment Variables** cargar las 6 variables de la tabla de
   arriba (las 4 de Supabase más las 2 de GitHub).
4. Deploy.

> Ojo con la CLI de Vercel: para las variables `NEXT_PUBLIC_*` que parecen una
> credencial hay que agregar `--type config`, si no el comando no agrega nada y
> no avisa. Verificar siempre con `vercel env ls production` que estén las 6.

### Worker en GitHub Actions

El worker ya está en `.github/workflows/worker.yml`. Solo falta darle acceso a
Supabase:

1. En el repositorio: **Settings → Secrets and variables → Actions → Secrets**,
   agregar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (los mismos valores que
   en Vercel).
2. Opcional, en **Variables**: `PRODE_PDF_BUCKET` si cambiaste el nombre del bucket.

### Que la aplicación pueda despertar al worker

Vercel necesita permiso para pedirle a GitHub que arranque el workflow:

1. En GitHub: **Settings del usuario → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: solo este repositorio.
3. **Permissions → Repository permissions → Contents: Read and write**. Es el
   permiso mínimo que habilita `repository_dispatch`; no hace falta nada más.
4. Copiar el token y cargarlo en Vercel como `GITHUB_WORKER_TOKEN`, junto con
   `GITHUB_WORKER_REPO` = `usuario/repositorio`.

Sin estas dos variables la aplicación **no finge** que arrancó: el trabajo queda
con un mensaje que dice exactamente qué falta configurar, y se ve en pantalla.

---

## Cómo arranca el procesamiento, en detalle

Cuando terminan de subirse las partes del PDF:

1. `POST /api/fechas/<id>/subida/<trabajo>/encolar` marca el trabajo como
   pendiente y manda un `repository_dispatch` a GitHub (en desarrollo, lanza un
   proceso hijo).
2. GitHub levanta un runner, instala dependencias y corre `npm run worker:once`,
   que procesa **todos** los trabajos pendientes y termina.
3. Mientras trabaja, el worker escribe un **latido** cada 15 segundos y va
   guardando el progreso real: páginas leídas, boletas detectadas, boletas
   guardadas. Eso es lo que muestra la pantalla.
4. La pantalla, además de preguntar el progreso, hace de **vigía**: si un
   trabajo debería estar avanzando y hace más de 90 segundos que nadie lo toca,
   vuelve a pedir un worker. Después de varios intentos sin éxito, el trabajo
   pasa a error con el motivo real en vez de quedar girando para siempre.
5. Como red de seguridad, el workflow también corre dos veces por día y drena
   lo que haya quedado.

Dos runners disparados casi juntos no se pisan: tomar un trabajo es un
compare-and-swap sobre el latido, así que uno solo se lo queda.

**Si se corta a la mitad, retoma.** Después de cada parte del PDF se guarda un
checkpoint. Un worker que arranca sobre un trabajo a medias sigue por la parte
siguiente; no vuelve a la página 0.

---

## Qué hace con las boletas

- **No asume "una boleta por página".** Prueba varias maneras de partir el
  documento (por número de boleta, por nombre, por página, por columnas, por
  bloques), puntúa cada una y se queda con la que mejor explica el archivo.
- **Boletas que son una imagen.** Si la página no tiene texto, se mira la imagen
  y se buscan las casillas marcadas. No importa si la marca es un círculo de
  color, uno gris o una cruz hecha a mano: lo que se busca es una mancha que
  contrasta con el fondo, dentro de una grilla que se deduce mirando todas las
  boletas juntas. El nombre del participante se lee con OCR.
- **Dobles.** Dos casillas marcadas en el mismo partido son una jugada válida:
  aciertan si el resultado oficial es cualquiera de las dos.
- **Nombres repetidos.** Nunca se deduplican. Tres boletas de "Juan Pérez" son
  tres participaciones distintas y las tres compiten.
- **Nada frena el procesamiento.** Una boleta ilegible entra igual al ranking
  con los partidos que sí se pudieron leer; los que no, valen 0.
- **El cálculo no usa IA.** Un pronóstico acierta si contiene el resultado
  oficial. Punto. Los empates conservan a todos: comparten posición y ninguno
  se elimina.

---

## Probar

```bash
npm test                 # pruebas unitarias (cálculo, dobles, boletas gráficas)
npm run typecheck        # TypeScript
npm run build            # build de producción
```

Con un PDF de verdad:

```bash
npm run pdf:probar -- muestras/mi-pdf.pdf scripts/fecha-mananero.json
```

Muestra qué lee el sistema y el TOP 10, sin base de datos ni servidor. Es lo
primero que conviene correr cuando un PDF nuevo no se lee bien.

Con el PDF de prueba generado (difícil a propósito: nombres repetidos, una
boleta sin nombre, dobles, un partido sin marcar en el medio y boletas partidas
entre dos páginas):

```bash
npm run pdf:prueba       # genera muestras/boletas-prueba.pdf + su verdad conocida
npm run pdf:verificar    # compara lo leído contra esa verdad, campo por campo
```

De punta a punta, en un navegador real (Playwright):

```bash
npm run e2e
```

Necesita un PDF de boletas en `muestras/mananero.pdf`. La prueba carga la fecha,
sube el PDF, aprieta PROCESAR y espera el TOP 10 **sin arrancar ningún worker**:
si el procesamiento no empieza solo, falla.

Reanudación tras un corte:

```bash
npx tsx scripts/probar-checkpoint.mts
```

Arranca el worker, lo mata de golpe a mitad de camino y comprueba que al
reintentar no rehace el trabajo ya hecho.

---

## Límites reales de la solución gratuita

Están puestos acá para que no sorprendan:

- **Tamaño por parte: 47 MB.** Es un tope duro de Supabase Storage. El PDF se
  sube partido, así que el archivo completo puede ser mucho más grande; lo que
  no puede superarse es el tamaño de cada pedazo.
- **Almacenamiento de Supabase: 1 GB** en el plan gratuito. Las partes del PDF
  se borran solas al terminar cada trabajo, así que lo que se acumula son las
  boletas (texto), que ocupan muy poco.
- **Minutos de GitHub Actions: 2.000 por mes** en un repositorio privado (en uno
  público son ilimitados). Cada procesamiento usa entre 2 y 5 minutos, así que
  alcanza para varios cientos de fechas por mes. Si se agotan, el worker deja de
  arrancar hasta el mes siguiente: se ve en pantalla como un error de arranque,
  no como un cuelgue.
- **Duración máxima de un trabajo: 3 horas** (el tope del workflow; GitHub
  permite hasta 6). Con OCR se procesan del orden de 1 a 3 páginas por segundo,
  así que entran varios miles de boletas por corrida.
- **Demora de arranque: entre 20 segundos y 1 minuto.** Es lo que tarda GitHub
  en levantar el runner e instalar dependencias. Durante ese rato la pantalla
  dice "Arrancando el worker", con el estado real.
- **Los workflows programados se desactivan solos** si el repositorio pasa 60
  días sin actividad. Eso solo afecta a la red de seguridad de dos veces por
  día; el arranque por `repository_dispatch` sigue funcionando igual.
- **Lectura de boletas que son imagen.** El detector necesita ver varias boletas
  de la misma plantilla para deducir dónde están las casillas: con menos de 4
  páginas no puede, y avisa. Sobre el PDF real de referencia acierta 96 de 96
  pronósticos verificados a mano, y lee 36 de 41 nombres (los otros 5 tienen el
  campo vacío en la boleta).

---

## Estructura

```
src/app/            pantalla y API (Next.js, corre en Vercel)
src/lib/            dominio: fechas, boletas, corrección, análisis de PDF
src/lib/disparador.ts   arranque automático del worker
worker/             el worker: descarga, extrae, analiza y guarda
worker/marcas.py    detección de casillas marcadas en boletas que son imagen
worker/ocr.py       lectura de textos de una imagen
supabase/schema.sql esquema completo, idempotente
e2e/                prueba de punta a punta en navegador
scripts/            herramientas para probar PDFs
```
