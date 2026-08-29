"""
Lectura de boletas que son una IMAGEN, no texto.

Por que existe: hay boletas de Prode que no se llenan escribiendo "1", "X" o "2"
sino pintando un circulo de color en una de tres casillas de cada fila. El PDF de
esas boletas no tiene ni una letra: son fotos o capturas de pantalla. Ni pdfjs ni
PyMuPDF encuentran ahi nada que leer, y el OCR tampoco, porque un circulo de
color no es texto.

Como se lee, sin saber de antemano ni el color, ni el tamano, ni donde estan las
casillas:

  1. En cada pagina se buscan MANCHAS MACIZAS DE COLOR. "Maciza" es la palabra
     clave: la imagen se divide en bloquecitos y un bloque solo cuenta si esta
     casi entero pintado, asi que los trazos finos de las letras desaparecen y
     los circulos quedan.

  2. Las manchas de TODAS las paginas se juntan y se miran sus posiciones X. Con
     decenas de boletas aparecen picos nitidos: son las columnas de la grilla.
     Lo mismo con la Y para las filas.

  3. De todos los tríos de columnas posibles se elige el que forma la grilla:
     tiene que ser compacto (las tres casillas de un partido estan pegadas),
     parejo (misma separacion entre casillas) y -esta es la clave- NO puede
     estar marcado siempre. Los escudos de los equipos y las cajitas del horario
     tambien son manchas macizas de color, pero aparecen en TODAS las boletas,
     en todas las filas. Una casilla de pronostico, en cambio, esta pintada en
     unas boletas y vacia en otras. Eso las separa sin mirar colores.

  4. Cada mancha queda asignada a (fila, columna) = (partido, pronostico). Dos
     manchas en la misma fila son un doble, que es jugada valida.

Si el documento no tiene esta forma, el detector dice que no encontro grilla y el
worker sigue por el camino de siempre. Nunca inventa un pronostico: si en una
fila no hay ninguna mancha, ese partido queda sin pronostico y vale 0.
"""

import numpy as np

try:
    import pymupdf
except ImportError:  # pragma: no cover - el que llama ya avisa
    pymupdf = None

# --- Parametros ------------------------------------------------------------
# Resolucion de trabajo. Un circulo de marca mide alrededor de 25 px aca: dato
# suficiente para reconocerlo y barato de procesar.
DPI = 110
# Lado del bloque con el que se "engruesa" la imagen. Es el filtro que separa una
# mancha maciza de un trazo de letra: un bloque solo cuenta si esta casi lleno.
BLOQUE = 4
SOLIDEZ = 0.72
# Cuanto tiene que despegarse del fondo un pixel para ser parte de una marca.
CONTRASTE_MIN = 45
# Tamano admisible de una mancha, como fraccion del ancho de la pagina.
ANCHO_MIN_REL = 0.012
ANCHO_MAX_REL = 0.100
# Que tan "redonda" y llena tiene que ser.
PROPORCION_MIN = 0.40
PROPORCION_MAX = 2.50
RELLENO_MIN = 0.50
# Separacion minima entre dos picos distintos, en fraccion de pagina.
SEPARACION_X = 0.025
SEPARACION_Y = 0.018
# Un pico chiquito comparado con el mas alto no es una columna.
PICO_MIN_REL = 0.05
# Las tres casillas de un partido estan pegadas: no pueden abarcar mas que esto.
ANCHO_GRILLA_MAX = 0.40
# Una casilla de pronostico NO puede estar pintada en (casi) todas las boletas:
# eso seria parte del diseno, no una eleccion del participante.
OCUPACION_MAX = 0.92
# ...ni puede estar practicamente siempre vacia.
OCUPACION_MIN = 0.02
# Cuanto tiene que cambiar una columna entre boletas para ser de pronosticos.
VARIABILIDAD_MIN = 0.06
# Lo mismo para una fila: una banda del diseno se repite igual en cada boleta.
VARIABILIDAD_FILA_MIN = 0.08
# Cuantas paginas hacen falta para que las estadisticas signifiquen algo.
PAGINAS_MINIMAS = 4
# Topes para el corte de "casilla marcada": ni tan bajo que cualquier borde
# cuente, ni tan alto que solo valga una casilla pintada entera.
TINTA_MIN = 0.025
TINTA_MAX = 0.35
# Una casilla ademas tiene que tener tinta comparable a la mas marcada de su
# fila: separa la marca de verdad del resto que deja una cruz mal dibujada.
RELATIVO_FILA = 0.40
# Cuanto tiene que mejorar el ajuste de la grilla para aceptarlo en una pagina.
MEJORA_MINIMA_AJUSTE = 1.05
# Que parte de la casilla se mira para contar la tinta. Menos de 1 para no
# tocar los bordes; no tan chico que una marca corrida se quede afuera.
VENTANA_REL = 0.65
# Un partido admite un pronostico o un doble: nunca tres casillas.
MAX_MARCAS_FILA = 2


def _pagina_a_arreglo(pagina):
    """Pagina renderizada como arreglo (alto, ancho, 3) de enteros."""
    pix = pagina.get_pixmap(dpi=DPI)
    datos = np.frombuffer(pix.samples, dtype=np.uint8)
    datos = datos.reshape(pix.height, pix.width, pix.n)
    return datos[:, :, :3].astype(np.int16)


def _mascara_marca(rgb):
    """
    Pixeles que se despegan del fondo de la pagina.

    No se pide color: al principio si, y fallaba. En el PDF real hay boletas
    marcadas con puntos GRISES, sin nada de color, y quedaban invisibles. Lo que
    define una marca no es el tono sino el contraste: algo mucho mas claro (o
    mucho mas oscuro) que el fondo. Asi sirve igual para una planilla negra con
    puntos de color que para una hoja blanca marcada a lapicera.
    """
    gris = rgb[:, :, 0] * 0.30 + rgb[:, :, 1] * 0.59 + rgb[:, :, 2] * 0.11
    fondo = float(np.median(gris))
    return np.abs(gris - fondo) >= CONTRASTE_MIN


def _bloques(mascara):
    """Reduce la mascara a bloques. Un bloque vale si esta casi lleno."""
    alto, ancho = mascara.shape
    hh, ww = alto // BLOQUE, ancho // BLOQUE
    if hh == 0 or ww == 0:
        return np.zeros((0, 0), dtype=bool)
    recorte = mascara[: hh * BLOQUE, : ww * BLOQUE]
    return recorte.reshape(hh, BLOQUE, ww, BLOQUE).mean(axis=(1, 3)) >= SOLIDEZ


def _componentes(solido):
    """Componentes conexas (8 vecinos) de la matriz de bloques."""
    if solido.size == 0:
        return []
    alto, ancho = solido.shape
    visto = np.zeros_like(solido, dtype=bool)
    vecinos = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
    salida = []
    for py, px in np.argwhere(solido):
        if visto[py, px]:
            continue
        pila = [(int(py), int(px))]
        visto[py, px] = True
        celdas = 0
        x0 = x1 = int(px)
        y0 = y1 = int(py)
        while pila:
            y, x = pila.pop()
            celdas += 1
            x0, x1 = min(x0, x), max(x1, x)
            y0, y1 = min(y0, y), max(y1, y)
            for dy, dx in vecinos:
                ny, nx = y + dy, x + dx
                if 0 <= ny < alto and 0 <= nx < ancho and solido[ny, nx] and not visto[ny, nx]:
                    visto[ny, nx] = True
                    pila.append((ny, nx))
        salida.append({"celdas": celdas, "x0": x0, "x1": x1, "y0": y0, "y1": y1})
    return salida


def _manchas_de_pagina(rgb):
    """Manchas macizas de color de una pagina, en pixeles."""
    alto, ancho, _ = rgb.shape
    solido = _bloques(_mascara_marca(rgb))
    encontradas = []
    for m in _componentes(solido):
        anc = (m["x1"] - m["x0"] + 1) * BLOQUE
        alt = (m["y1"] - m["y0"] + 1) * BLOQUE
        if anc < ANCHO_MIN_REL * ancho or anc > ANCHO_MAX_REL * ancho:
            continue
        proporcion = alt / max(anc, 1)
        if proporcion < PROPORCION_MIN or proporcion > PROPORCION_MAX:
            continue
        relleno = m["celdas"] / max(1, (m["x1"] - m["x0"] + 1) * (m["y1"] - m["y0"] + 1))
        if relleno < RELLENO_MIN:
            continue
        encontradas.append(
            {
                "cx": (m["x0"] + m["x1"] + 1) / 2 * BLOQUE,
                "cy": (m["y0"] + m["y1"] + 1) / 2 * BLOQUE,
            }
        )
    return encontradas


def _picos(valores, total, separacion_rel, maximo=16):
    """
    Posiciones donde se amontonan los valores.

    Se usa un histograma con picos en vez de ir encadenando valores cercanos: al
    encadenar, una sola mancha a mitad de camino junta dos columnas distintas en
    una sola, y la grilla se pierde. Eso paso de verdad con estas boletas.
    """
    if not valores:
        return []
    cajones = 400
    indices = np.clip((np.array(valores) / max(total, 1) * cajones).astype(int), 0, cajones - 1)
    histograma = np.bincount(indices, minlength=cajones).astype(float)
    suave = np.convolve(histograma, np.ones(3) / 3, mode="same")
    if suave.max() <= 0:
        return []

    separacion = max(1, int(separacion_rel * cajones))
    elegidos = []
    for i in np.argsort(suave)[::-1]:
        if suave[i] < PICO_MIN_REL * suave.max() or len(elegidos) >= maximo:
            break
        if all(abs(int(i) - j) >= separacion for j in elegidos):
            elegidos.append(int(i))
    if not elegidos:
        return []

    # Centro fino: la mediana de los valores que caen en cada pico.
    centros = sorted(e / cajones * total for e in elegidos)
    asignados = {c: [] for c in centros}
    for v in valores:
        asignados[min(centros, key=lambda c: abs(c - v))].append(v)
    return [
        (float(np.median(vs)), len(vs)) for c, vs in sorted(asignados.items()) if vs
    ]


def _variabilidad(columna, tolerancia, por_pagina, filas, tolerancia_fila):
    """
    Cuanto cambia esa columna de una boleta a otra.

    Es LA prueba que separa una casilla de pronostico de un adorno del diseno.
    Para cada casilla (fila, columna) se mira en que fraccion `p` de las boletas
    esta pintada:

      · un escudo o una cajita de horario esta en todas  -> p = 1
      · una casilla que nadie usa nunca                  -> p = 0
      · una casilla de pronostico                        -> p intermedio

    `min(p, 1-p)` vale 0 en los dos primeros casos y sube en el tercero. Se
    promedia sobre las filas que alguna vez aparecen. Sin colores, sin plantilla
    y sin suponer donde esta la grilla.

    Devuelve (variabilidad, ocupacion_media).
    """
    if not filas or not por_pagina:
        return 0.0, 1.0
    cuenta = np.zeros(len(filas))
    for manchas in por_pagina.values():
        vistas = set()
        for m in manchas:
            if abs(m["cx"] - columna) > tolerancia:
                continue
            distancias = [abs(m["cy"] - f) for f in filas]
            i = int(np.argmin(distancias))
            if distancias[i] <= tolerancia_fila:
                vistas.add(i)
        for i in vistas:
            cuenta[i] += 1
    p = cuenta / len(por_pagina)
    usadas = p[p > 0.02]
    if usadas.size == 0:
        return 0.0, 0.0
    return float(np.mean(np.minimum(usadas, 1 - usadas))), float(np.mean(p))


def _elegir_columnas(picos_x, ancho, por_pagina, filas, tolerancia_fila):
    """
    Elige las tres columnas que forman la grilla de pronosticos.

    Los escudos de los equipos y las cajitas de horario tambien dejan manchas
    macizas alineadas en columna, asi que hay mas columnas candidatas que las
    tres buenas. Se eligen las que ademas de estar pegadas y parejas cambian de
    una boleta a otra (ver _variabilidad).
    """
    candidatas = [(c, n) for c, n in picos_x if n >= max(3, PAGINAS_MINIMAS)]
    if len(candidatas) < 3:
        return None
    total = sum(n for _, n in candidatas)
    tolerancia = SEPARACION_X / 2 * ancho

    estadisticas = {
        c: _variabilidad(c, tolerancia, por_pagina, filas, tolerancia_fila)
        for c, _ in candidatas
    }
    vivas = [
        (c, n)
        for c, n in candidatas
        if estadisticas[c][0] >= VARIABILIDAD_MIN
        and OCUPACION_MIN <= estadisticas[c][1] <= OCUPACION_MAX
    ]
    if len(vivas) < 3:
        return None

    mejor = None
    for i in range(len(vivas)):
        for j in range(i + 1, len(vivas)):
            for k in range(j + 1, len(vivas)):
                trio = [vivas[i], vivas[j], vivas[k]]
                extension = trio[2][0] - trio[0][0]
                if extension <= 0 or extension > ANCHO_GRILLA_MAX * ancho:
                    continue
                d1 = trio[1][0] - trio[0][0]
                d2 = trio[2][0] - trio[1][0]
                simetria = abs(d1 - d2) / max(d1, d2, 1)
                if simetria > 0.6:
                    continue
                # La variabilidad pesa mucho mas que la cantidad de manchas: en
                # las boletas reales los escudos dejan MAS manchas que las
                # casillas, y sin este peso ganaban ellos.
                variabilidad = sum(estadisticas[c][0] for c, _ in trio) / 3
                peso = sum(n for _, n in trio) / max(total, 1)
                puntaje = variabilidad * 4 + peso - simetria * 1.5 - (extension / ancho) * 1.5
                if mejor is None or puntaje > mejor[0]:
                    mejor = (puntaje, [c for c, _ in trio])
    return mejor[1] if mejor else None


def _filas_de_partido(candidatas, columnas, por_pagina, tolerancia_col, tolerancia_fila):
    """
    Se queda con las filas que son de verdad un partido.

    Entre las filas detectadas se cuelan bandas del diseno: el titulo, la fecha,
    fecha, el renglon del NOMBRE. Se reconocen porque en ellas aparecen las tres
    casillas marcadas a la vez, en casi todas las boletas: eso no es un
    pronostico -nadie juega 1, X y 2 al mismo tiempo- sino un adorno que cruza
    la pagina de lado a lado. Sacarlas importa mucho: una fila de mas al
    principio corre todos los pronosticos un partido y arruina el ranking.
    """
    if not candidatas or not por_pagina:
        return list(candidatas)

    def medir(fila):
        """(cobertura, columnas_marcadas_a_la_vez) de una fila."""
        paginas_con_marca = 0
        columnas_totales = 0
        for manchas in por_pagina.values():
            vistas = set()
            for m in manchas:
                if abs(m["cy"] - fila) > tolerancia_fila:
                    continue
                distancias = [abs(m["cx"] - c) for c in columnas]
                col = int(np.argmin(distancias))
                if distancias[col] <= tolerancia_col:
                    vistas.add(col)
            if vistas:
                paginas_con_marca += 1
                columnas_totales += len(vistas)
        return (
            paginas_con_marca / len(por_pagina),
            columnas_totales / max(paginas_con_marca, 1),
        )

    medidas = [medir(f) for f in candidatas]
    cobertura_tipica = float(np.median([c for c, _ in medidas])) or 1.0
    juntas_tipicas = float(np.median([j for _, j in medidas])) or 1.0
    tope_juntas = max(1.75, juntas_tipicas * 1.35)
    piso_cobertura = cobertura_tipica * 0.55

    def es_partido(i):
        cobertura, juntas = medidas[i]
        return cobertura >= piso_cobertura and juntas <= tope_juntas

    # Se recorta SOLO por los extremos. Las bandas del diseno estan arriba o
    # abajo de la grilla, nunca entre dos partidos, y descartar una fila del
    # medio correria todos los pronosticos siguientes.
    desde, hasta = 0, len(candidatas) - 1
    while desde < hasta and not es_partido(desde):
        desde += 1
    while hasta > desde and not es_partido(hasta):
        hasta -= 1
    return list(candidatas[desde : hasta + 1])


def _filas_por_periodo(valores, alto):
    """
    Encuentra las filas como una REJILLA REGULAR, no como picos sueltos.

    Los partidos de una boleta estan a distancias iguales, y eso es informacion
    que conviene usar: buscar cada fila por separado deja huecos (un partido que
    nadie marco) y tambien filas de mas (dos marcas apenas desalineadas se leen
    como dos filas). Las dos cosas corren los partidos de lugar y arruinan el
    ranking.

    Se mide primero cada cuanto se repiten las marcas -la autocorrelacion da ese
    periodo-, despues donde empieza la rejilla, y por ultimo hasta donde llega
    (solo se conservan las posiciones que de verdad tienen marcas).
    """
    if len(valores) < 6:
        return sorted(set(valores))

    largo = int(alto) + 1
    histograma = np.zeros(largo)
    for v in valores:
        indice = int(round(v))
        if 0 <= indice < largo:
            histograma[indice] += 1
    suave = np.convolve(histograma, np.ones(5) / 5, mode="same")

    centrado = suave - suave.mean()
    autocorrelacion = np.correlate(centrado, centrado, mode="full")[len(centrado) - 1 :]
    minimo, maximo = int(alto * 0.02), int(alto * 0.16)
    if maximo <= minimo:
        return sorted(set(valores))
    paso = float(np.argmax(autocorrelacion[minimo:maximo]) + minimo)
    tolerancia = max(paso * 0.25, 3.0)

    def masa(punto):
        desde = max(0, int(punto - tolerancia))
        hasta = min(largo, int(punto + tolerancia) + 1)
        return float(suave[desde:hasta].sum())

    mejor = None
    for fase in np.arange(0, paso, max(1.0, paso / 24)):
        puntos = np.arange(fase, alto, paso)
        total = sum(masa(p) for p in puntos)
        if mejor is None or total > mejor[0]:
            mejor = (total, float(fase))

    puntos = list(np.arange(mejor[1], alto, paso))
    masas = [masa(p) for p in puntos]
    if not masas or max(masas) <= 0:
        return sorted(set(valores))
    umbral = max(masas) * 0.15
    usados = [i for i, m in enumerate(masas) if m >= umbral]
    if not usados:
        return sorted(set(valores))
    return [puntos[i] for i in range(min(usados), max(usados) + 1)]


def _integral(mascara):
    """Imagen integral: permite medir el promedio de cualquier rectangulo de una."""
    acumulada = np.cumsum(np.cumsum(mascara.astype(np.float32), axis=0), axis=1)
    return np.pad(acumulada, ((1, 0), (1, 0)))


def _promedios(integral, x0, y0, x1, y1):
    """Promedio de cada rectangulo (arreglos de enteros, mismos tamanos)."""
    total = (
        integral[y1, x1] - integral[y0, x1] - integral[y1, x0] + integral[y0, x0]
    )
    return total / np.maximum((y1 - y0) * (x1 - x0), 1)


def _leer_celdas(integral, filas, columnas, ancho_ventana, alto_ventana):
    """
    Tinta de cada casilla de una pagina, ajustando la grilla a ESA pagina.

    Hace falta porque las boletas son capturas de pantalla y no todas estan
    encuadradas igual: algunas vienen corridas o un poco mas chicas. Con la
    grilla del documento aplicada tal cual, en esas paginas las ventanas caen
    entre casillas y la boleta se lee cualquier cosa.

    Se prueban corrimientos y escalas chicos y se elige el ajuste que deja mas
    tinta DENTRO de las casillas. El rango es corto a proposito: menos de lo que
    mide una fila, para que no pueda "engancharse" un partido mas arriba o mas
    abajo, que seria peor que no ajustar nada.
    """
    alto_pag = integral.shape[0] - 1
    ancho_pag = integral.shape[1] - 1
    fila_ref = np.array(filas, dtype=float)
    columna_ref = np.array(columnas, dtype=float)
    centro_y = float(fila_ref.mean())
    centro_x = float(columna_ref.mean())

    paso_fila = float(np.median(np.diff(fila_ref))) if len(fila_ref) > 1 else alto_pag
    limite_y = paso_fila * 0.45
    limite_x = max(ancho_ventana * 0.5, 4.0)

    def medir(escala, desplazamiento_y, desplazamiento_x):
        ys = centro_y + escala * (fila_ref - centro_y) + desplazamiento_y
        xs = centro_x + escala * (columna_ref - centro_x) + desplazamiento_x
        medio_alto = alto_ventana * escala / 2
        medio_ancho = ancho_ventana * escala / 2
        y0 = np.clip(np.round(ys - medio_alto), 0, alto_pag).astype(int)
        y1 = np.clip(np.round(ys + medio_alto), 0, alto_pag).astype(int)
        x0 = np.clip(np.round(xs - medio_ancho), 0, ancho_pag).astype(int)
        x1 = np.clip(np.round(xs + medio_ancho), 0, ancho_pag).astype(int)
        return _promedios(integral, x0[None, :], y0[:, None], x1[None, :], y1[:, None])

    def puntuar(medidas):
        # Lo que distingue una grilla bien puesta no es cuanta tinta agarra sino
        # el CONTRASTE dentro de cada fila: una casilla cargada y las otras
        # vacias. Sumar tinta a secas hacia que el ajuste se corriera hacia los
        # nombres de los equipos, que tienen mucha mas tinta que un punto.
        return float((medidas.max(axis=1) - np.median(medidas, axis=1)).sum())

    base = medir(1.0, 0.0, 0.0)
    mejor_valor = puntuar(base)
    mejor = base

    for escala in np.linspace(0.92, 1.08, 5):
        for desplazamiento_y in np.linspace(-limite_y, limite_y, 9):
            for desplazamiento_x in np.linspace(-limite_x, limite_x, 5):
                medidas = medir(escala, float(desplazamiento_y), float(desplazamiento_x))
                valor = puntuar(medidas)
                # Solo se acepta mover la grilla si mejora CLARAMENTE. Sin este
                # margen, las paginas que ya estaban bien se corrian por ruido.
                if valor > mejor_valor * MEJORA_MINIMA_AJUSTE:
                    mejor_valor = valor
                    mejor = medidas
    return mejor


def _umbral_tinta(valores):
    """
    Desde cuanta tinta una casilla cuenta como marcada.

    No se fija un numero a mano porque depende de como sea la marca: un circulo
    relleno pinta media casilla y una cruz mucho menos, asi que un valor fijo
    serviria para unas boletas y no para otras.

    Las casillas vacias dan casi exactamente cero y las marcadas se reparten
    bastante por encima, asi que entre los dos grupos queda un valle. El corte
    va ahi: se avanza desde cero mientras la cantidad de casillas siga bajando y
    se para justo antes de que vuelva a subir.

    (Se probo el metodo de Otsu, que es lo habitual para binarizar, y aca elige
    mal: como la mayoria de las casillas estan vacias, parte en dos al grupo de
    las marcadas y se pierden las marcas mas chicas.)
    """
    datos = np.array([v for v in valores if np.isfinite(v)])
    if datos.size == 0:
        return TINTA_MIN
    cajones = 60
    tope = 0.6
    histograma, bordes = np.histogram(datos, bins=cajones, range=(0.0, tope))
    i = 1
    while i < cajones - 1 and histograma[i] >= histograma[i + 1]:
        i += 1
    return float(min(max(float(bordes[i]), TINTA_MIN), TINTA_MAX))


def analizar(documento, numeros):
    """
    Busca la grilla de marcas en las paginas indicadas (numeradas desde 1).

    Devuelve:
      {
        "grilla": True/False,
        "columnas": [x1, xX, x2]   en puntos PDF (origen arriba a la izquierda)
        "filas":    [y1, y2, ...]  en puntos PDF, de arriba hacia abajo
        "paginas":  {numero: [(fila, columna), ...]},
        "motivo":   por que no se pudo, si no se pudo
      }
    """
    if pymupdf is None:
        return {"grilla": False, "motivo": "PyMuPDF no disponible"}
    if len(numeros) < PAGINAS_MINIMAS:
        return {
            "grilla": False,
            "motivo": f"hacen falta al menos {PAGINAS_MINIMAS} paginas para reconocer la grilla",
        }

    por_pagina = {}
    todas = []
    ancho = alto = None
    for n in numeros:
        try:
            rgb = _pagina_a_arreglo(documento.load_page(n - 1))
        except Exception:  # noqa: BLE001 - una pagina rota no frena el analisis
            por_pagina[n] = []
            continue
        if ancho is None:
            ancho, alto = rgb.shape[1], rgb.shape[0]
        manchas = _manchas_de_pagina(rgb)
        por_pagina[n] = manchas
        todas.extend(manchas)

    if not todas or ancho is None:
        return {"grilla": False, "motivo": "no se encontraron marcas"}

    # Filas primero (con TODAS las manchas): sirven para medir la ocupacion de
    # cada columna candidata, que es lo que separa una casilla de un escudo.
    picos_y = _picos([m["cy"] for m in todas], alto, SEPARACION_Y, maximo=40)
    filas_previas = [c for c, _ in picos_y]
    if len(filas_previas) < 2:
        return {"grilla": False, "motivo": "no se distinguen filas"}
    tolerancia_fila = max(
        float(np.median(np.diff(sorted(filas_previas)))) * 0.45, alto * 0.008
    )

    picos_x = _picos([m["cx"] for m in todas], ancho, SEPARACION_X, maximo=16)
    columnas = _elegir_columnas(picos_x, ancho, por_pagina, filas_previas, tolerancia_fila)
    if not columnas:
        return {"grilla": False, "motivo": "no se distingue una grilla de tres casillas"}

    separacion = min(columnas[1] - columnas[0], columnas[2] - columnas[1])
    tolerancia_col = max(separacion * 0.45, ANCHO_MIN_REL * ancho)

    # Ahora si, las filas de la grilla: solo con las manchas que caen en las
    # tres casillas, sin las bandas del diseno y rellenando los huecos internos.
    en_grilla = [m for m in todas if min(abs(m["cx"] - c) for c in columnas) <= tolerancia_col]
    candidatas = _filas_por_periodo([m["cy"] for m in en_grilla], alto)
    if len(candidatas) >= 2:
        tolerancia_fila = max(
            float(np.median(np.diff(sorted(candidatas)))) * 0.45, alto * 0.008
        )
    filas = _filas_de_partido(
        candidatas, columnas, por_pagina, tolerancia_col, tolerancia_fila
    )
    if len(filas) < 2:
        return {"grilla": False, "motivo": "no se distinguen filas de la grilla"}
    tolerancia_fila = max(float(np.median(np.diff(filas))) * 0.45, alto * 0.008)

    # --- Segunda pasada: cuanta tinta hay DENTRO de cada casilla -------------
    #
    # Las manchas sirvieron para encontrar la grilla, no para decidir. Decidir
    # con ellas dejaba afuera las boletas marcadas con una CRUZ: una X son
    # cuatro trazos finos, no una mancha maciza, y el filtro que borra las
    # letras se la llevaba puesta. Midiendo la tinta de la casilla da lo mismo
    # como este hecha la marca: circulo, cruz, tilde o garabato.
    asignadas, umbral = _medir_paginas(documento, numeros, filas, columnas, separacion)

    escala = 72.0 / DPI
    return {
        "grilla": True,
        "columnas": [c * escala for c in columnas],
        "filas": [f * escala for f in filas],
        "paginas": asignadas,
        "umbral": umbral,
        "motivo": "",
    }


def releer(documento, numeros, grilla_previa):
    """
    Vuelve a medir las casillas usando una grilla ya conocida.

    Sirve cuando un PDF grande se procesa por pedazos y a un pedazo le tocan
    muy pocas boletas: con dos o tres no se puede deducir donde estan las
    casillas, pero la plantilla es la misma que la del pedazo anterior. Las
    marcas se vuelven a medir en cada pagina: no se copia ningun pronostico.
    """
    columnas_pt = grilla_previa.get("columnas") or []
    filas_pt = grilla_previa.get("filas") or []
    if len(columnas_pt) < 3 or len(filas_pt) < 2:
        return {"grilla": False, "motivo": "la grilla previa no sirve"}

    escala = DPI / 72.0
    columnas = [c * escala for c in columnas_pt]
    filas = [f * escala for f in filas_pt]
    separacion = min(columnas[1] - columnas[0], columnas[2] - columnas[1])

    asignadas, umbral = _medir_paginas(documento, numeros, filas, columnas, separacion)
    return {
        "grilla": True,
        "columnas": list(columnas_pt),
        "filas": list(filas_pt),
        "paginas": asignadas,
        "umbral": umbral,
        "motivo": "",
        "reusada": True,
    }


def _medir_paginas(documento, numeros, filas, columnas, separacion):
    """Decide, casilla por casilla y pagina por pagina, cuales estan marcadas."""
    ancho_ventana = max(separacion * VENTANA_REL, 6.0)
    alto_ventana = max(float(np.median(np.diff(filas))) * VENTANA_REL, 6.0)

    tinta = {}
    for n in numeros:
        try:
            rgb = _pagina_a_arreglo(documento.load_page(n - 1))
        except Exception:  # noqa: BLE001
            continue
        integral = _integral(_mascara_marca(rgb))
        tinta[n] = _leer_celdas(integral, filas, columnas, ancho_ventana, alto_ventana)

    umbral = _umbral_tinta([float(v) for m in tinta.values() for v in m.ravel()])

    asignadas = {}
    for n, medidas in tinta.items():
        celdas = []
        for i in range(medidas.shape[0]):
            fila = medidas[i]
            tope = float(fila.max())
            if tope < umbral:
                continue
            candidatas = [
                j
                for j in range(medidas.shape[1])
                # Se pide tinta suficiente Y que sea comparable a la casilla mas
                # marcada de la fila. Lo segundo es por las cruces hechas a mano,
                # que se salen de su casilla y ensucian la de al lado: el resto
                # que se cuela nunca llega a la mitad de la marca de verdad.
                if fila[j] >= umbral and fila[j] >= tope * RELATIVO_FILA
            ]
            # Un partido admite como mucho un doble. Si dieran tres, no es que
            # el participante jugo las tres: es que la marca ensucio la casilla
            # de al lado. Se conservan las dos con mas tinta, que es la lectura
            # mas probable, en vez de descartar la fila entera.
            if len(candidatas) > MAX_MARCAS_FILA:
                candidatas = sorted(candidatas, key=lambda j: -fila[j])[:MAX_MARCAS_FILA]
            celdas.extend((i, j) for j in sorted(candidatas))
        asignadas[n] = celdas
    return asignadas, umbral
