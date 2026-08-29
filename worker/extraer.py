"""
Rescate de paginas que pdfjs no pudo leer.

El camino normal del worker es pdfjs (Node), que devuelve el texto con
coordenadas y es el que esta afinado contra las boletas de texto. Este script se
ocupa SOLO de las paginas que ese camino dejo vacias, en tres escalones:

  1. PyMuPDF sobre la capa de texto. Es mucho mas tolerante que pdfjs con PDFs
     raros: fuentes rotas, codificaciones inusuales, documentos de impresoras
     viejas.

  2. Si la pagina no tiene texto es una imagen (un escaneo, una foto, una
     captura de pantalla). Entonces se buscan las MARCAS de la grilla mirando la
     imagen (worker/marcas.py): asi se llenan las boletas graficas, con un
     circulo o una cruz en una de tres casillas.

  3. OCR (worker/ocr.py) para los textos. Si se reconocio la grilla alcanza con
     leer la franja de abajo, que es donde va el nombre del participante, y eso
     es mucho mas rapido que leer la pagina entera. Si no se reconocio la
     grilla, se lee toda la pagina: puede ser una boleta de texto escaneada.

Todo lo que se encuentra se devuelve en el MISMO formato que usa pdfjs: pedazos
de texto con su posicion. Las marcas se transcriben como si la boleta tuviera
escrito un encabezado "1 X 2" y una marca en la casilla elegida, que es
exactamente lo que la boleta dice en el papel. Asi el analizador de siempre
-probado, con sus dobles y sus empates- lee estas boletas sin cambiarle una
linea.

Uso:
    python worker/extraer.py <archivo.pdf> <paginas> [--grilla <archivo.json>]

    <paginas>  "1,4,7" o "todas"
    --grilla   archivo donde recordar la grilla detectada, para poder reusarla
               con un PDF partido en pedazos donde a un pedazo le tocan pocas
               paginas (con pocas boletas no se puede deducir la grilla).

Salida: una linea JSON en la salida estandar. Los errores NO se tiran como
excepcion, se devuelven en el JSON: una pagina ilegible no puede detener el
procesamiento de las demas.

COORDENADAS: PyMuPDF usa el origen arriba a la izquierda con la Y creciendo
hacia abajo; pdfjs usa el sistema del PDF, con la Y creciendo hacia arriba. El
analizador esta escrito para el segundo, asi que aca se invierte la Y. Si esto
se cambiara, las boletas se leerian dadas vuelta.
"""

import json
import os
import re
import sys

MIN_CARACTERES_PAGINA = 12
# Etiquetas del encabezado de columnas que se transcribe para cada boleta grafica.
ETIQUETAS = ["1", "X", "2"]
MARCA = "●"  # circulo relleno
# Se escribe en la casilla del medio de un partido que quedo SIN marcar. No es
# un pronostico -no coincide con ninguna marca- pero deja constancia de que ese
# renglon existe. Sin el, un partido en blanco no dejaba rastro y todos los
# pronosticos de abajo se corrian un lugar.
SIN_MARCAR = "–"
# Palabras que en una boleta anuncian el nombre, no son el nombre.
ETIQUETAS_NOMBRE = {"nombre", "participante", "jugador", "socio", "apellido"}
RE_HORA = re.compile(r"^\d{1,2}[:.]\d{2}$")


def palabras_a_items(palabras, alto_pagina):
    """Convierte las palabras de PyMuPDF (x0,y0,x1,y1,texto,...) al formato del worker."""
    items = []
    for palabra in palabras:
        x0, y0, x1, y1, texto = palabra[0], palabra[1], palabra[2], palabra[3], palabra[4]
        texto = (texto or "").strip()
        if not texto:
            continue
        items.append(
            {
                "texto": texto,
                "x": round(float(x0), 2),
                # Y invertida: de "hacia abajo" (PyMuPDF) a "hacia arriba" (PDF/pdfjs).
                "y": round(float(alto_pagina) - float(y1), 2),
                "ancho": round(float(x1) - float(x0), 2),
                "alto": round(float(y1) - float(y0), 2),
            }
        )
    return items


def caracteres(items):
    return sum(len(i["texto"]) for i in items)


def _es_etiqueta(texto):
    limpio = re.sub(r"[^a-zA-ZáéíóúñÁÉÍÓÚÑ]", "", texto).lower()
    return limpio in ETIQUETAS_NOMBRE


def nombre_del_participante(items):
    """
    Nombre escrito al lado de la palabra NOMBRE.

    Se busca la etiqueta y se toma lo que este a su derecha en el mismo renglon.
    Es lo mas confiable: en la franja de abajo tambien caen el horario y los
    equipos del ultimo partido, y quedarse con "todo lo que hay abajo" mezclaba
    esos textos con el nombre.
    """
    if not items:
        return ""

    # Se comparan los CENTROS de cada texto, no su borde de abajo: el nombre
    # suele venir en un recuadro mas alto que la etiqueta, y comparando bordes
    # quedaba fuera del mismo renglon por unos pocos puntos.
    def centro(i):
        return i["y"] + i["alto"] / 2

    etiquetas = [i for i in items if _es_etiqueta(i["texto"])]
    if etiquetas:
        # La etiqueta mas abajo de todas (la Y del PDF crece hacia arriba).
        etiqueta = min(etiquetas, key=centro)
        candidatos = [
            i
            for i in items
            if abs(centro(i) - centro(etiqueta)) <= max(etiqueta["alto"], i["alto"], 6) * 1.2
            and i["x"] + i["ancho"] > etiqueta["x"] + etiqueta["ancho"] * 0.5
            and not _es_etiqueta(i["texto"])
        ]
    else:
        # Sin etiqueta: se toma el renglon de mas abajo.
        mas_abajo = min(items, key=centro)
        candidatos = [
            i
            for i in items
            if abs(centro(i) - centro(mas_abajo)) <= max(mas_abajo["alto"], i["alto"], 6) * 1.2
        ]

    candidatos.sort(key=lambda i: i["x"])
    palabras = []
    for i in candidatos:
        texto = i["texto"].strip(" /|-:")
        if not texto or RE_HORA.match(texto):
            continue
        palabras.append(texto)
    return " ".join(palabras).strip()[:60]


def _items_de_grilla(grilla, numero, alto_pagina, nombre):
    """
    Transcribe la grilla detectada de una pagina al formato de pdfjs.

    Se escribe, de arriba hacia abajo: el renglon del participante, el
    encabezado de columnas "1 X 2" y una marca en cada casilla elegida. No se
    inventa ningun pronostico: solo se ponen en palabras las casillas que el
    detector encontro pintadas en la imagen.
    """
    columnas = grilla["columnas"]
    filas = grilla["filas"]
    celdas = grilla["paginas"].get(str(numero), grilla["paginas"].get(numero, []))
    if not filas or not columnas:
        return []

    paso = (filas[-1] - filas[0]) / max(len(filas) - 1, 1) if len(filas) > 1 else 20.0
    espacio = min(paso, filas[0]) if filas[0] > 0 else paso
    y_encabezado = filas[0] - espacio * 0.45
    y_participante = filas[0] - espacio * 0.9

    def item(texto, x, y_arriba, ancho, alto):
        return {
            "texto": texto,
            "x": round(float(x - ancho / 2), 2),
            "y": round(float(alto_pagina - y_arriba - alto / 2), 2),
            "ancho": round(float(ancho), 2),
            "alto": round(float(alto), 2),
        }

    items = []
    if nombre:
        texto = f"Participante: {nombre}"
        items.append(item(texto, columnas[1], y_participante, len(texto) * 4.5, 9))

    for j, x in enumerate(columnas):
        items.append(item(ETIQUETAS[j], x, y_encabezado, 6, 8))

    marcadas = {fila for fila, _ in celdas}
    for fila, columna in celdas:
        if 0 <= fila < len(filas) and 0 <= columna < len(columnas):
            items.append(item(MARCA, columnas[columna], filas[fila], 8, 8))
    for fila, y in enumerate(filas):
        if fila not in marcadas:
            items.append(item(SIN_MARCAR, columnas[1], y, 6, 6))

    return items


def fuera_de_la_grilla(items, columnas, tolerancia):
    """
    Saca los textos que caen dentro de las casillas.

    El OCR de una boleta grafica suele "ver" letras sueltas encima de las
    marcas. Si quedaran, el analizador las leeria como pronosticos escritos y se
    mezclarian con los detectados. Los textos de afuera si se conservan.
    """
    if not columnas:
        return items
    return [
        i
        for i in items
        if min(abs(i["x"] + i["ancho"] / 2 - c) for c in columnas) > tolerancia
    ]


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "uso: extraer.py <pdf> <paginas|todas>"}))
        return 0

    ruta, seleccion = sys.argv[1], sys.argv[2]
    ruta_grilla = None
    if "--grilla" in sys.argv:
        indice = sys.argv.index("--grilla")
        if indice + 1 < len(sys.argv):
            ruta_grilla = sys.argv[indice + 1]

    try:
        import pymupdf
    except ImportError:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "PyMuPDF no esta instalado (pip install pymupdf).",
                    "instalable": True,
                }
            )
        )
        return 0

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import marcas
        import ocr
    except ImportError as e:  # pragma: no cover
        print(json.dumps({"ok": False, "error": f"faltan modulos del worker: {e}"}))
        return 0

    try:
        documento = pymupdf.open(ruta)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"No se pudo abrir el PDF: {e}"}))
        return 0

    grilla = None
    try:
        if seleccion.strip().lower() == "todas":
            numeros = list(range(1, documento.page_count + 1))
        else:
            numeros = []
            for parte in seleccion.split(","):
                parte = parte.strip()
                if parte.isdigit():
                    n = int(parte)
                    if 1 <= n <= documento.page_count:
                        numeros.append(n)

        # --- Primera vuelta: texto de verdad ---------------------------------
        salida = {}
        sin_texto = []
        for numero in numeros:
            try:
                pagina = documento.load_page(numero - 1)
                items = palabras_a_items(pagina.get_text("words"), pagina.rect.height)
                if caracteres(items) >= MIN_CARACTERES_PAGINA:
                    salida[numero] = {
                        "numero": numero,
                        "ancho": round(float(pagina.rect.width), 2),
                        "alto": round(float(pagina.rect.height), 2),
                        "origen": "pymupdf",
                        "items": items,
                    }
                else:
                    sin_texto.append(numero)
            except Exception as e:  # noqa: BLE001 - una pagina rota no frena al resto
                salida[numero] = {
                    "numero": numero, "ancho": 0, "alto": 0,
                    "origen": "error", "items": [], "error": str(e),
                }

        # --- Segunda vuelta: paginas que son imagen --------------------------
        if sin_texto:
            grilla = marcas.analizar(documento, sin_texto)
            if grilla.get("grilla") and ruta_grilla:
                try:
                    with open(ruta_grilla, "w", encoding="utf-8") as f:
                        json.dump(grilla, f)
                except OSError:
                    pass
            elif not grilla.get("grilla") and ruta_grilla and os.path.exists(ruta_grilla):
                # Un pedazo del PDF con muy pocas boletas no alcanza para deducir
                # la grilla: se reusa la del pedazo anterior, que es la misma
                # plantilla. Las casillas marcadas se vuelven a medir aca.
                try:
                    with open(ruta_grilla, encoding="utf-8") as f:
                        previa = json.load(f)
                    if previa.get("grilla"):
                        grilla = marcas.releer(documento, sin_texto, previa)
                except (OSError, ValueError):
                    pass

        hay_grilla = bool(grilla and grilla.get("grilla"))
        franja_desde = None
        if hay_grilla:
            filas = grilla["filas"]
            paso = (filas[-1] - filas[0]) / max(len(filas) - 1, 1) if len(filas) > 1 else 20.0
            franja_desde = filas[-1] + paso * 0.3

        for numero in sin_texto:
            try:
                pagina = documento.load_page(numero - 1)
                alto = float(pagina.rect.height)

                if hay_grilla:
                    # Solo la franja de abajo: es donde va el nombre, y leer una
                    # tira fina en vez de la pagina entera es varias veces mas
                    # rapido con miles de boletas.
                    desde = min(franja_desde, alto * 0.86)
                    clip = pymupdf.Rect(0, desde, pagina.rect.width, alto)
                    items_ocr = ocr.leer(pagina, clip)
                else:
                    items_ocr = ocr.leer(pagina)

                origen = "ocr" if items_ocr else "sin-texto"
                items = list(items_ocr)

                if hay_grilla:
                    columnas = grilla["columnas"]
                    separacion = (
                        min(columnas[1] - columnas[0], columnas[2] - columnas[1])
                        if len(columnas) >= 3
                        else 10.0
                    )
                    items = fuera_de_la_grilla(items, columnas, separacion * 0.55)
                    nombre = nombre_del_participante(items_ocr)
                    marcadas = _items_de_grilla(grilla, numero, alto, nombre)
                    if marcadas:
                        items.extend(marcadas)
                        origen = "marcas+ocr" if items_ocr else "marcas"

                salida[numero] = {
                    "numero": numero,
                    "ancho": round(float(pagina.rect.width), 2),
                    "alto": round(alto, 2),
                    "origen": origen,
                    "items": items,
                }
            except Exception as e:  # noqa: BLE001
                salida[numero] = {
                    "numero": numero, "ancho": 0, "alto": 0,
                    "origen": "error", "items": [], "error": str(e),
                }
    finally:
        documento.close()

    print(
        json.dumps(
            {
                "ok": True,
                "paginas": [salida[n] for n in numeros if n in salida],
                "motorOcr": ocr.motor_disponible(),
                "grilla": bool(grilla and grilla.get("grilla")),
                "grillaMotivo": (grilla or {}).get("motivo", ""),
                "aviso": ocr.aviso(),
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
