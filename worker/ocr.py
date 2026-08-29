"""
Lectura de texto en boletas que son una imagen.

Se usa para lo que la deteccion de marcas no puede darnos: el NOMBRE del
participante, que en las boletas graficas esta escrito abajo de la grilla.

Hay dos motores y se elige el que este disponible:

  RapidOCR   Es el preferido. Se instala con pip (`pip install
             rapidocr-onnxruntime`), no necesita nada del sistema ni permisos de
             administrador, anda igual en Windows y en Linux, y con los nombres
             de estas boletas -tipografias raras, letra chica- acierta mucho mas
             que la alternativa.

  Tesseract  Respaldo, a traves del propio PyMuPDF. Solo sirve si el binario
             esta instalado en la maquina y TESSDATA_PREFIX apunta a los datos
             de idioma.

Si no hay ninguno de los dos, no se rompe nada: las boletas se procesan igual y
los participantes quedan identificados por su pagina en vez de por su nombre.
"""

import numpy as np

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None

IDIOMAS_TESSERACT = ["spa+eng", "spa", "eng"]
# Resolucion de la franja que se pasa al OCR. Mas alto lee mejor y tarda mas;
# 250 alcanza para los nombres escritos a mano de estas boletas.
DPI = 250
# Confianza minima para creerle a RapidOCR.
CONFIANZA_MIN = 0.35

_motor = None
_estado = {"motor": None, "aviso": ""}


def _cargar_rapidocr():
    global _motor
    if _motor is not None:
        return _motor
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        return None
    try:
        _motor = RapidOCR()
    except Exception as e:  # noqa: BLE001 - sin OCR se sigue igual
        _estado["aviso"] = f"RapidOCR no arranco: {e}"
        return None
    return _motor


def motor_disponible():
    """Nombre del motor de OCR que se va a usar, o None."""
    if _estado["motor"] is not None:
        return _estado["motor"]
    if _cargar_rapidocr() is not None:
        _estado["motor"] = "rapidocr"
    else:
        _estado["motor"] = "tesseract"  # se confirma al primer uso
    return _estado["motor"]


def aviso():
    return _estado["aviso"]


def _items_desde_rapidocr(resultado, clip, escala, alto_pagina):
    items = []
    for caja, texto, confianza in resultado or []:
        texto = (texto or "").strip()
        if not texto or float(confianza) < CONFIANZA_MIN:
            continue
        xs = [p[0] for p in caja]
        ys = [p[1] for p in caja]
        x0 = clip.x0 + min(xs) * escala
        x1 = clip.x0 + max(xs) * escala
        y0 = clip.y0 + min(ys) * escala
        y1 = clip.y0 + max(ys) * escala
        items.append(
            {
                "texto": texto,
                "x": round(float(x0), 2),
                # Y invertida: el resto del sistema usa el eje del PDF, que
                # crece hacia arriba.
                "y": round(float(alto_pagina - y1), 2),
                "ancho": round(float(x1 - x0), 2),
                "alto": round(float(y1 - y0), 2),
            }
        )
    return items


def _con_rapidocr(pagina, clip):
    motor = _cargar_rapidocr()
    if motor is None:
        return None
    pix = pagina.get_pixmap(dpi=DPI, clip=clip)
    if pix.width < 8 or pix.height < 8:
        return []
    imagen = np.frombuffer(pix.samples, dtype=np.uint8)
    imagen = imagen.reshape(pix.height, pix.width, pix.n)[:, :, :3]
    try:
        resultado, _ = motor(imagen)
    except Exception as e:  # noqa: BLE001
        _estado["aviso"] = f"RapidOCR fallo: {e}"
        return None
    return _items_desde_rapidocr(resultado, clip, 72.0 / DPI, pagina.rect.height)


def _con_tesseract(pagina, clip):
    """Respaldo por PyMuPDF. Devuelve None si Tesseract no esta disponible."""
    if pymupdf is None:
        return None
    for idioma in IDIOMAS_TESSERACT:
        try:
            pix = pagina.get_pixmap(dpi=DPI, clip=clip)
            datos = pix.pdfocr_tobytes(language=idioma)
            with pymupdf.open("pdf", datos) as doc:
                hoja = doc.load_page(0)
                escala_x = clip.width / max(hoja.rect.width, 1)
                escala_y = clip.height / max(hoja.rect.height, 1)
                items = []
                for palabra in hoja.get_text("words"):
                    texto = (palabra[4] or "").strip()
                    if not texto:
                        continue
                    x0 = clip.x0 + palabra[0] * escala_x
                    x1 = clip.x0 + palabra[2] * escala_x
                    y0 = clip.y0 + palabra[1] * escala_y
                    y1 = clip.y0 + palabra[3] * escala_y
                    items.append(
                        {
                            "texto": texto,
                            "x": round(float(x0), 2),
                            "y": round(float(pagina.rect.height - y1), 2),
                            "ancho": round(float(x1 - x0), 2),
                            "alto": round(float(y1 - y0), 2),
                        }
                    )
                return items
        except Exception as e:  # noqa: BLE001 - se prueba el siguiente idioma
            _estado["aviso"] = f"Tesseract ({idioma}): {e}"
    return None


def leer(pagina, clip=None):
    """
    Texto de una pagina (o de un pedazo), con posiciones en coordenadas del PDF.

    Devuelve [] si no hay ningun motor de OCR disponible: es una limitacion que
    se informa, no un error que corte el procesamiento.
    """
    if clip is None:
        clip = pagina.rect

    items = _con_rapidocr(pagina, clip)
    if items is not None:
        _estado["motor"] = "rapidocr"
        return items

    items = _con_tesseract(pagina, clip)
    if items is not None:
        _estado["motor"] = "tesseract"
        return items

    _estado["motor"] = None
    if not _estado["aviso"]:
        _estado["aviso"] = (
            "No hay OCR instalado: las boletas se leen igual, pero sin el nombre del "
            "participante. Se instala con `pip install rapidocr-onnxruntime`."
        )
    return []
