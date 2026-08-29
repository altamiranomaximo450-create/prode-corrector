# Corrector de Prode

Plataforma web para corregir automáticamente las boletas de una fecha del Prode:
se sube el PDF con todas las boletas, se cargan los resultados oficiales y el
sistema extrae cada boleta, la valida, compara pronóstico por pronóstico, arma
el ranking, el Top 5 y permite exportar todo. Admite PDFs de cientos de MB
(se suben por partes, directo a Supabase Storage, y los procesa un worker
aparte) y los "dobles" (dos pronósticos marcados en el mismo partido, ej.
"1/X"): son una jugada normal en el Prode, no un error.

**Regla de diseño número uno: el sistema nunca adivina.** Si una boleta no se
puede leer con certeza, queda marcada como `REQUIERE REVISIÓN MANUAL`, se
explica exactamente qué no se pudo interpretar y no entra al ranking hasta que
una persona la resuelva. Es preferible frenar antes que asignar un puntaje
equivocado.

---

## 1. Cómo ejecutarla

Hace falta **Node.js 20 o superior** (probado con Node 24).

```bash
cd prode-corrector
npm install
npm run dev
```

Abrí <http://localhost:3000> e ingresá la contraseña.

En desarrollo, si no configuraste nada, la contraseña es **`prode-demo`** y el
panel te lo avisa arriba de todo. Para cambiarla, creá un archivo `.env.local`:

```bash
cp .env.example .env.local
```

y editá `ADMIN_PASSWORD`.

### Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el servidor de desarrollo |
| `npm run build` | Compila para producción |
| `npm start` | Sirve la versión compilada |
| `npm test` | Corre las 46 pruebas automáticas |
| `npm run typecheck` | Verifica los tipos de TypeScript |
| `npm run demo:pdf` | Regenera los PDF de prueba de `public/demo/` |
| `npm run probar-pdf -- ruta/al/archivo.pdf 10` | Diagnostica un PDF real desde la terminal |

Ese último comando es la herramienta clave cuando llegue el PDF real del
cliente: muestra boleta por boleta qué leyó, con qué estrategia y qué problemas
detectó, sin tocar la base de datos.

---

## 2. Cómo cargar una fecha

**Nueva fecha** en el menú lateral.

1. **Nombre o número de la fecha** — ej.: `Fecha 13 — Torneo Apertura`.
2. **Cantidad de partidos** — tiene que coincidir con la de las boletas. Si no
   coincide, el sistema lo detecta y marca todas las boletas para revisión en
   lugar de asignar los pronósticos corridos.
3. **Partidos** — equipo local y visitante de cada uno, en el mismo orden en que
   aparecen en las boletas.

Podés crear la fecha sin resultados y sin PDF, y completarlos después.

---

## 3. Cómo cargar el PDF

En **Nueva fecha**, paso 3: arrastrá el PDF o elegilo, y apretá
**"Procesar boletas"**. También se puede subir más tarde desde
**Boletas → Subir PDF**.

Mientras procesa vas viendo el avance real, etapa por etapa (analizando el PDF,
extrayendo el texto página por página, detectando boletas, identificando
participantes, extrayendo pronósticos, validando, buscando duplicados). No es
una barra decorativa: cada evento lo emite el servidor cuando esa etapa
efectivamente ocurrió.

**Ojo:** al procesar un PDF se reemplazan *todas* las boletas de esa fecha,
incluidas las correcciones manuales. El sistema pide confirmación antes.

### Si el PDF es grande (arriba del tope sincrónico)

Desde **Boletas → Subir PDF**, si elegís un archivo más grande que el tope
mostrado (con Supabase configurado), el panel cambia solo a la carga por
partes: sube el archivo directo a Storage y un worker aparte lo procesa,
mostrando progreso real ("Página 721 de 1800") y sin perder el avance si se
corta. Ver la sección 11 más abajo para la arquitectura completa y cómo
arrancar el worker.

### Qué tipo de PDF acepta

El PDF tiene que tener **capa de texto**: el que exporta el programa que genera
las boletas. Ese es el caso normal.

Si el PDF es un **escaneo o una foto**, el sistema lo detecta, corta el
procesamiento y lo dice con todas las letras. **No hace OCR a propósito**: un
OCR sin verificar sobre marcas de lápiz confundiría 1 con 2 o con X, y ese error
se propagaría a un ranking que parecería correcto. Para esos casos están la
carga manual (**Boletas → Cargar a mano**) o volver a exportar el PDF desde el
programa de origen. La arquitectura deja el punto de enganche listo por si más
adelante querés sumar un OCR verificado (ver sección 9).

---

## 4. Cómo cargar los resultados

**Resultados** en el menú lateral.

Cada partido tiene tres botones grandes con el símbolo **y** la palabra:
**1 LOCAL**, **X EMPATE**, **2 VISITANTE**. Están así a propósito: el error de
carga más caro es confundir 1 con 2, y ese error afecta a todas las boletas.

Los partidos que dejes sin cargar **no se computan para nadie** y el sistema lo
avisa arriba del ranking. Podés cargar resultados parciales el sábado y
completarlos el domingo.

### Regla de desempate

Al final de esa misma pantalla. Por defecto el sistema **no desempata**: los
que empatan comparten la posición y aparecen todos. Si el reglamento del Prode
tiene una regla, se puede elegir:

- **Sin desempate** (recomendado): 1º, 2º, 2º, 4º…
- **Por partido clave**: gana quien acertó un partido determinado.
- **Por número de boleta**: gana el número más bajo (orden de entrega).

El sistema nunca inventa un criterio por su cuenta.

---

## 5. Cómo ejecutar la corrección

**No hay que ejecutar nada.** La corrección se recalcula sola cada vez que
cambia un resultado o una boleta: el ranking es siempre una función de los datos
guardados, no algo congelado que haya que regenerar. Guardás los resultados y el
ranking ya está listo.

---

## 6. Cómo revisar errores

**Revisión** en el menú lateral (con un contador rojo si hay pendientes).

Cada boleta problemática muestra el código del problema, la página del PDF, el
partido afectado y el fragmento de texto exacto que lo provocó.

Lo que el sistema detecta:

| Código | Significa |
|---|---|
| `NOMBRE_NO_DETECTADO` | No se encontró el participante |
| `NOMBRE_DUDOSO` | El nombre se dedujo sin etiqueta explícita (aviso) |
| `CANTIDAD_PRONOSTICOS` | Se leyeron más o menos pronósticos que partidos |
| `PRONOSTICO_AMBIGUO` | Tres o más opciones marcadas en el mismo partido (no es un doble válido) |
| `PRONOSTICO_DOBLE` | Doble marcado (dos opciones, ej. "1/X") — aviso, **no bloquea**: acierta si el resultado oficial es cualquiera de las dos |
| `PRONOSTICO_FALTANTE` | Un partido quedó sin marca legible |
| `DUPLICADO_BOLETA` | Boleta idéntica repetida (¿hoja escaneada dos veces?) |
| `DUPLICADO_PARTICIPANTE` | El mismo participante en varias boletas |
| `DUPLICADO_NUMERO` | Número de boleta repetido (aviso) |
| `PARTIDO_DESCONOCIDO` | Los equipos leídos no coinciden con los cargados (aviso) |
| `SIN_CAPA_TEXTO` | Páginas sin texto legible |
| `SEGMENTO_SIN_DATOS` | Un bloque del PDF sin ningún pronóstico |

Los **errores** bloquean el ranking; los **avisos** no, pero conviene mirarlos.

Al abrir una boleta se puede **Corregir a mano** (nombre, número y cada
pronóstico). Cuando la corrección resuelve un problema de verdad —por ejemplo,
escribís el pronóstico del partido 4 que estaba ilegible— ese problema
desaparece solo y la boleta vuelve al ranking. Los problemas que necesitan una
decisión humana (un duplicado, por ejemplo) **no** desaparecen: hay que apretar
**Dar por revisada** a conciencia, y queda registrado.

---

## 7. Cómo consultar el ranking

**Ranking**: posición, participante, boleta, aciertos, errores y porcentaje.
Los empates comparten posición y aparecen marcados como tales. Debajo hay una
tabla aparte con las boletas excluidas por revisión, para que nadie quede
invisible.

**Ganadores**: el podio en grande, con los empates explicados.

**Historial**: todas las fechas con su podio; se abre cualquiera para ver su
ranking completo.

### Auditoría

Hacé clic en cualquier participante, en cualquier pantalla. El detalle muestra:

- aciertos, errores y porcentaje;
- una frase que explica el puntaje: *"Obtuvo 9 de 10 aciertos posibles. Acertó:
  #1 River Plate vs Racing Club (1); … Falló: #10 Godoy Cruz vs Instituto (marcó
  2, salió 1)"*;
- la tabla partido por partido con pronóstico, resultado real y ✅/❌;
- **el texto exacto del PDF** del que se dedujo cada marca;
- qué estrategia de lectura se usó y si alguien la editó a mano.

Ningún número aparece sin poder mostrar de dónde salió.

---

## 8. Cómo exportar

Botones **CSV** y **Excel** arriba a la derecha en **Ranking**.

- **CSV**: separado por punto y coma y con BOM UTF-8, así Excel en español lo
  abre en columnas y con los acentos bien, sin pasar por el asistente de
  importación. Incluye resultados oficiales, ranking con una columna por partido
  y la lista de boletas a revisar.
- **Excel (.xlsx)**: tres hojas — *Ranking* (con los aciertos pintados de verde
  y los errores de rojo), *Detalle por partido* (una fila por pronóstico, con la
  evidencia leída del PDF) y *Requieren revisión*.

---

## 9. Qué tecnologías se usaron y por qué

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 15** (App Router) + React 19 + TypeScript | Frontend y backend en un solo proyecto; es el camino nativo de Vercel |
| Estilos | **Tailwind CSS 4** | Sin build extra ni librería de componentes que después haya que pelear |
| Lectura de PDF | **pdfjs-dist** (build legacy, en el servidor) | Es el motor de PDF de Mozilla. Devuelve cada fragmento de texto **con sus coordenadas**, que es lo único que permite distinguir una marca bajo la columna "X" de una bajo la columna "2" |
| Generación de PDF de prueba | **pdf-lib** | Para fabricar boletas de prueba con el mismo formato que las reales |
| Excel | **exceljs** | Genera .xlsx reales con formato, sólo en el servidor |
| Base de datos | **Supabase (Postgres) vía API REST**, o archivos JSON, o memoria | Ver abajo |
| Pruebas | **Vitest** | 46 pruebas, incluida una que procesa un PDF real de punta a punta |
| PDFs grandes | **Supabase Storage** (subida resumible por chunks) + worker Node aparte (`tsx`) | Vercel no acepta cuerpos de más de ~4,5 MB ni procesos de más de 60s; el PDF se sube directo a Storage y un proceso fuera de Vercel lo procesa por partes |
| Sesión | Cookie firmada con HMAC-SHA256 (Web Crypto) | Sin dependencias ni servicio externo de autenticación |

**Sin servicios externos de IA ni de OCR.** Todo el análisis del PDF corre en el
propio servidor, con reglas deterministas y auditables. No hay ninguna clave de
API de terceros en el proyecto, ni tuya ni de nadie: no hay nada que el cliente
pueda usar para acceder a servicios privados.

### Arquitectura

```
src/
  lib/
    tipos.ts            Modelo de dominio
    correccion.ts       Motor de corrección (función pura, sin efectos)
    servicio.ts         Lógica de negocio y validaciones
    exportar.ts         CSV y Excel
    auth.ts             Sesión (Web Crypto, sirve en edge y en Node)
    datos-demo.ts       Datos ficticios (origen único, compartido con el generador de PDF)
    pdf/
      extraer.ts        PDF -> texto con coordenadas (no interpreta nada)
      analizar.ts       Texto -> boletas (estrategias + validación, incluidos los dobles)
      procesar.ts       Orquestador: extraer + analizar (PDF chico o combinado)
      combinar.ts       Junta las páginas de varios chunks en un solo documento
    almacen/
      tipos.ts          Contrato de persistencia
      archivo.ts        Archivos JSON (desarrollo)
      memoria.ts        En memoria (demo sin base de datos)
      supabase.ts       Postgres vía REST (producción)
      trabajos.ts       Trabajos de PDF grande + Storage (sólo con Supabase)
  app/
    api/                Rutas del backend (incluida api/fechas/[id]/subida/*)
    (panel)/            Pantallas del panel
    ingresar/           Login
  components/           Interfaz (incluido subida-grande.tsx)
  middleware.ts         Puerta: protege páginas y API
worker/
  index.ts              Worker de PDFs grandes (corre aparte, no en Vercel)
  env.ts                Carga .env/.env.local para el worker
```

Las capas están separadas de verdad: el motor de corrección no sabe que existe
un PDF, el lector de PDF no sabe que existe una base de datos, y ninguna ruta de
API habla directamente con el almacenamiento.

### Cómo lee las boletas (y por qué no asume un formato)

El analizador **no da por sentado ningún formato**. Prueba varias formas de
partir el documento en boletas (por el rótulo "Boleta N° …", por "Participante:",
una por página, por columnas verticales, por bloques separados con espacio en
blanco) y varias formas de leer los pronósticos:

- **grilla de columnas** — encabezado `1 X 2` y una marca bajo la elegida
  (lo más común); se resuelve por posición horizontal;
- **línea final** — cada renglón termina en `1`, `X` o `2`;
- **numerado** — `3) X`, `Partido 3: 2`;
- **secuencia** — una tira `1 X 2 1 …`.

Después puntúa cada combinación por cuántas boletas quedan limpias y se queda
con la que mejor explica el documento. La estrategia elegida y las descartadas
quedan a la vista en el Dashboard.

> Una nota sobre precisión: durante el desarrollo, los modos "línea final" y
> "numerado" leían la marca `X` de la grilla como si fuera el pronóstico, y
> devolvían `X` en los diez partidos **con toda confianza**. La detección lo
> destapó y ahora, cuando existe un encabezado de columnas, esos modos se
> desactivan y manda la lectura por posición. Además hay una red de seguridad
> que penaliza cualquier boleta larga con un único valor repetido. Este es el
> tipo de error que el sistema está construido para no cometer en silencio.

---

## 10. Qué falta configurar para ponerla online

### Paso 1 — Base de datos (obligatorio en Vercel)

En Vercel el disco es de sólo lectura, así que el motor de archivos no sirve.
Sin base de datos configurada, la app cae en el motor **en memoria**: la demo
funciona, pero todo se pierde cuando el servidor se reinicia (y el panel lo
avisa en amarillo).

Para que los datos persistan:

1. Creá un proyecto gratuito en <https://supabase.com>.
2. SQL Editor → pegá y ejecutá [`supabase/schema.sql`](supabase/schema.sql).
3. Project Settings → API → copiá *Project URL* y la clave *service_role*.

### Paso 2 — Subir a GitHub y desplegar

```bash
cd prode-corrector
git init
git add .
git commit -m "Corrector de Prode"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

En <https://vercel.com> → *Add New Project* → importá el repositorio.
**Importante:** si subís toda la carpeta `dropshipping`, poné
`prode-corrector` como *Root Directory* en Vercel. Si subís sólo esta carpeta,
dejalo vacío. El resto (framework, comandos) lo detecta solo.

### Paso 3 — Variables de entorno en Vercel

*Settings → Environment Variables*:

| Variable | Valor | Obligatoria |
|---|---|---|
| `ADMIN_PASSWORD` | La contraseña del panel | **Sí** |
| `SESSION_SECRET` | Cadena aleatoria larga | **Sí** |
| `STORAGE_DRIVER` | `supabase` | Sí, para que persista |
| `SUPABASE_URL` | Project URL | Con `supabase` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave *service_role* (secreta) | Con `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | Igual a `SUPABASE_URL` | Para PDFs grandes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave *anon*/*publishable* (pública, no es secreta) | Para PDFs grandes |
| `PRODE_PDF_BUCKET` | `prode-pdfs` | No (ese es el default) |
| `MAX_CHUNK_MB` | `45` | No |
| `DEMO_MODE` | `on` / `off` | No (por defecto `on`) |
| `PROCESAMIENTO_HABILITADO` | `on` / `off` | No (por defecto `on`) |
| `MAX_PDF_MB` | Tope del PDF sincrónico (chico) | No |

Generá el secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Sin `ADMIN_PASSWORD` en producción el panel queda cerrado a propósito**: es
preferible que nadie entre a que quede abierto con la clave de desarrollo.

### Paso 4 — Tener en cuenta

- **PDF chico (hasta `MAX_PDF_MB`, ~4,5 MB en Vercel / 25 MB en local):** se
  sube y procesa en la misma petición, con progreso en vivo. No hace falta
  nada más.
- **PDF grande (arriba de eso, hasta cientos de MB):** con Supabase configurado,
  el botón de subir cambia solo a la carga por partes (ver sección 11, "PDFs
  grandes"). **Este camino necesita el worker corriendo aparte** (`npm run
  worker`): sin él, el archivo queda subido pero nadie lo procesa. El worker
  NO corre en Vercel — es un proceso Node de larga duración, y las funciones
  de Vercel tienen tope de tiempo (60s en el plan gratuito) y de tamaño de
  archivo (~4,5 MB) que un PDF de 250 MB no respeta bajo ningún ajuste.
- **Tiempo de proceso del camino chico:** el límite del plan gratuito de
  Vercel es 60 s por petición. El PDF de prueba de 10 páginas tarda ~200 ms,
  así que hay margen amplio para PDFs chicos con muchas más boletas.

### Cómo retirar la demo más adelante

- `PROCESAMIENTO_HABILITADO=off` → el panel sigue consultable pero deja de
  aceptar PDF nuevos.
- `DEMO_MODE=off` → no se vuelven a crear los datos ficticios.
- **Configuración → Borrar datos de demostración** → los elimina sin tocar las
  fechas reales.
- Cambiar `ADMIN_PASSWORD` → cierra todas las sesiones abiertas.

---

## 11. PDFs grandes: arquitectura y cómo correr el worker

Objetivo: procesar un PDF de 250 MB o más **sin que pase por una función de
Vercel** (tienen tope de ~4,5 MB de cuerpo y 60 s de ejecución en el plan
gratuito, y no hay forma de subir eso "legítimamente" sin engañar al límite).

```
Navegador                    Vercel (sólo coordina)         Supabase
──────────                   ──────────────────────         ────────
1. Parte el PDF en                                          
   pedazos (pdf-lib,         2. Crea el registro del   ---> prode_trabajos
   en el propio                 trabajo y firma una          (fila con el
   navegador)                   URL de subida por chunk      progreso)
      |                              |
      +---- sube cada chunk directo a Storage (URL firmada) --->  Storage
      |                                                           (bucket
      +---- avisa "chunk N listo" (sólo metadata) ---> Vercel     prode-pdfs)
      |
3. Avisa "encolar"  ---> Vercel marca el trabajo "pendiente"

                                                    4. El WORKER (aparte,
                                                       fuera de Vercel) va
                                                       descargando los
                                                       chunks de a uno,
                                                       extrayendo el texto
                                                       y guardando el
                                                       progreso después de
                                                       CADA chunk.

5. El navegador consulta el progreso (polling) ---> Vercel lee prode_trabajos

6. Cuando terminan todos los chunks, el worker corre el analizador UNA sola
   vez sobre el documento completo y guarda las boletas -> prode_boletas.
```

### Por qué el límite de 50 MB no se puede evitar

El plan **gratuito** de Supabase Storage rechaza cualquier archivo de más de
**50 MB** — es un tope de la plataforma, no algo que se pueda subir con una
opción de configuración. Por eso el PDF se parte en pedazos de hasta 45 MB
cada uno (`MAX_CHUNK_MB`) antes de subirlo: un PDF de 250 MB son ~6 chunks.
Esto es gratis siempre que el PDF completo no supere el 1 GB de Storage que
incluye el plan gratuito de Supabase (o el 500 MB de tamaño de base de datos,
si guardás muchos PDFs a la vez sin borrarlos).

### El worker: qué es y por qué no corre en Vercel

Es un script de Node (`worker/index.ts`) que corre aparte, no dentro de la
app de Next.js. Reutiliza el mismo motor de lectura de PDF y el mismo motor de
corrección que la carga chica — no hay dos lectores de boletas, uno solo,
compartido (`analizarYConstruir` en `src/lib/pdf/procesar.ts`).

```bash
npm run worker         # corre para siempre, revisando cada 5s si hay trabajos
npm run worker:once    # procesa un solo trabajo pendiente y termina (útil para probar)
```

Necesita las mismas `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del `.env`
del proyecto (las lee de `.env.local` o `.env` en la raíz).

**Dónde correrlo:**
- **Para la demo / uso personal:** en tu computadora, en una terminal aparte
  mientras usás el panel. Si lo cerrás, los trabajos quedan "pendientes" y
  siguen ahí: al volver a abrirlo, retoma solo.
- **Para que ande sin que dependa de tu computadora:** cualquier host que
  corra un proceso Node de larga duración (un VPS, Railway, Render, Fly.io,
  un servidor propio). Esto **no es gratis garantizado**: estos servicios
  suelen tener un plan gratuito limitado (se duerme sin uso, hay tope de
  horas, etc.) — es la parte de la demo que, para producción real 24/7,
  probablemente necesite un plan pago de *hosting del worker* (no de
  Supabase). Te aviso esto en vez de ocultarlo: es la única pieza de todo el
  sistema que no puedo garantizar 100% gratis en un despliegue "siempre
  encendido".

### Qué pasa si el worker se corta a la mitad

Cada chunk se marca `extraido` en `prode_trabajos.chunks` recién cuando su
texto ya se guardó. Si el proceso se cae (o lo cerrás) después del chunk 4 de
10, al volver a arrancar (`npm run worker`) busca ese mismo trabajo, ve que
los chunks 1-4 ya están `extraido` y sigue directo por el 5. Nunca vuelve a
descargar ni a leer un chunk ya procesado.

### Límites honestos de este camino

- **Resumibilidad de la SUBIDA** (no del procesamiento): es por chunk, no
  byte a byte. Si se corta la subida de un chunk de 45 MB a la mitad, ese
  chunk se reintenta entero (hasta 3 veces); no hace falta resubir el PDF
  completo, sólo ese pedazo.
- **Un worker procesa un trabajo por vez.** Para esta demo alcanza. Si en el
  futuro hace falta paralelismo (varios PDFs grandes a la vez), habría que
  correr más de un proceso worker o agregarle *locking* — no está hecho
  todavía, y agregarlo sin necesidad real sería complejidad de más.

---

## Privacidad y seguridad

- **Todo está detrás de la contraseña.** El middleware protege las páginas, las
  rutas de API **y** los PDF de `public/demo/`. Sin sesión, `/api` responde 401.
- **Cookie de sesión** firmada con HMAC-SHA256, `httpOnly`, `sameSite=lax` y
  `secure` en producción. No es legible desde JavaScript.
- **Freno a la fuerza bruta:** 8 intentos fallidos y 10 minutos de bloqueo. La
  comparación de la contraseña es en tiempo constante.
- **Nada se cachea:** todas las respuestas con datos llevan `no-store, private`,
  y el sitio va con `noindex`.
- **En Supabase, RLS activo sin políticas:** la clave pública no puede leer
  nada. Sólo la `service_role`, que vive únicamente en el servidor.
- **Ninguna variable empieza con `NEXT_PUBLIC_`**, así que ningún secreto llega
  al navegador.
- Los PDF **no se guardan**: se procesan en memoria y se descarta el archivo.
  Sólo queda el texto extraído de cada boleta, que es lo que permite auditarla.

---

## Datos de demostración

Al arrancar sin ninguna fecha cargada, el sistema crea dos fechas ficticias
(Fecha 11 y Fecha 12) marcadas con la etiqueta **DEMO** en todo el panel, para
que no se vea vacío en una presentación. Son 27 boletas ficticias, incluidos
casos problemáticos, y **no se mezclan con las reales**: viven en fechas propias
y las de demostración ni siquiera aceptan que se les suba un PDF.

En `public/demo/` hay dos PDF de prueba, descargables desde **Configuración**:

| Archivo | Contenido |
|---|---|
| `boletas-fecha-12.pdf` | 14 boletas correctas, 2 por página |
| `boletas-fecha-12-con-errores.pdf` | Las 14 anteriores + 5 casos especiales |

El segundo trae una boleta incompleta (9 pronósticos), una con un **doble**
válido en el partido 4 (dos marcas: cuenta como acierto si el resultado
oficial es cualquiera de las dos), una sin nombre, un participante repetido y
una boleta duplicada idéntica. Sirve para mostrarle al cliente, en vivo, qué
hace el sistema con cada caso: el doble se procesa solo (aviso, no bloquea);
los otros cuatro sí quedan en revisión.

Para probar de punta a punta: **Nueva fecha** → 10 partidos → cargá los equipos
(River-Racing, Boca-Independiente, Talleres-Belgrano, San Lorenzo-Huracán,
Estudiantes-Gimnasia LP, Rosario Central-Newells, Vélez-Argentinos,
Lanús-Banfield, Defensa y Justicia-Tigre, Godoy Cruz-Instituto), resultados
`1 X 2 1 1 X 1 2 X 1`, y subí el PDF.

---

## Pruebas

```bash
npm test
```

46 pruebas que cubren, entre otras cosas, los casos difíciles: todos aciertan,
todos fallan, empate múltiple, boleta incompleta, pronóstico ilegible, dobles
(acierta con cualquiera de las dos opciones), boleta duplicada, participante
duplicado, número duplicado, resultados faltantes, desempate configurado,
corrección manual, validaciones de entrada, exportación CSV/Excel, y el
procesamiento real del PDF de `public/demo` verificando que cada uno de los
pronósticos leídos coincide exactamente con el que se usó para generar ese PDF.

No incluyen una prueba automática del worker de PDFs grandes (necesita
Supabase real): para probarlo a mano, usá `npm run worker:once` después de
subir un PDF grande desde el panel.
