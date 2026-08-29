# Corrector de Prode

Plataforma web para corregir automáticamente las boletas de una fecha del Prode:
se sube el PDF con todas las boletas, se cargan los resultados oficiales y el
sistema extrae cada boleta, la valida, compara pronóstico por pronóstico, arma
el ranking, el Top 3 y permite exportar todo.

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
| `npm test` | Corre las 43 pruebas automáticas |
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
| `PRONOSTICO_AMBIGUO` | Dos opciones marcadas en el mismo partido |
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
| Pruebas | **Vitest** | 43 pruebas, incluida una que procesa un PDF real de punta a punta |
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
      analizar.ts       Texto -> boletas (estrategias + validación)
      procesar.ts       Orquestador, duplicados, progreso
    almacen/
      tipos.ts          Contrato de persistencia
      archivo.ts        Archivos JSON (desarrollo)
      memoria.ts        En memoria (demo sin base de datos)
      supabase.ts       Postgres vía REST (producción)
  app/
    api/                Rutas del backend
    (panel)/            Pantallas del panel
    ingresar/           Login
  components/           Interfaz
  middleware.ts         Puerta: protege páginas y API
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
| `SUPABASE_SERVICE_ROLE_KEY` | Clave *service_role* | Con `supabase` |
| `DEMO_MODE` | `on` / `off` | No (por defecto `on`) |
| `PROCESAMIENTO_HABILITADO` | `on` / `off` | No (por defecto `on`) |
| `MAX_PDF_MB` | Tope de tamaño de PDF | No |

Generá el secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Sin `ADMIN_PASSWORD` en producción el panel queda cerrado a propósito**: es
preferible que nadie entre a que quede abierto con la clave de desarrollo.

### Paso 4 — Tener en cuenta

- **Tamaño del PDF:** Vercel no acepta cuerpos de petición de más de ~4,5 MB en
  funciones serverless. La app lo detecta sola y avisa antes de subir. En local
  el tope es de 25 MB. Si los PDF reales pesan más, la salida es subirlos a
  Supabase Storage y procesarlos desde ahí (el punto de enganche está aislado en
  `procesarPdf`).
- **Tiempo de proceso:** el límite del plan gratuito es de 60 s por petición.
  El PDF de prueba de 10 páginas tarda ~200 ms, así que hay margen amplio.

### Cómo retirar la demo más adelante

- `PROCESAMIENTO_HABILITADO=off` → el panel sigue consultable pero deja de
  aceptar PDF nuevos.
- `DEMO_MODE=off` → no se vuelven a crear los datos ficticios.
- **Configuración → Borrar datos de demostración** → los elimina sin tocar las
  fechas reales.
- Cambiar `ADMIN_PASSWORD` → cierra todas las sesiones abiertas.

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
| `boletas-fecha-12-con-errores.pdf` | Las 14 anteriores + 5 casos problemáticos |

El segundo trae una boleta incompleta (9 pronósticos), una con doble marca en el
mismo partido, una sin nombre, un participante repetido y una boleta duplicada
idéntica. Sirve para mostrarle al cliente, en vivo, qué hace el sistema cuando
algo no cierra.

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

43 pruebas que cubren, entre otras cosas, los casos difíciles: todos aciertan,
todos fallan, empate múltiple, boleta incompleta, pronóstico ilegible, boleta
duplicada, participante duplicado, número duplicado, resultados faltantes,
desempate configurado, corrección manual, validaciones de entrada, exportación
CSV/Excel, y el procesamiento real del PDF de `public/demo` verificando que cada
uno de los pronósticos leídos coincide exactamente con el que se usó para
generar ese PDF.
