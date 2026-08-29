import type { Boleta, Fecha } from "../tipos";

/**
 * Contrato de persistencia. Toda la app habla con esta interfaz, nunca con una
 * base de datos concreta: cambiar de motor es cambiar STORAGE_DRIVER.
 */
export interface Almacen {
  /** Identificador legible del motor, para mostrarlo en Configuración. */
  readonly nombre: string;
  /** false => los datos se pierden al reiniciar el proceso. */
  readonly persistente: boolean;
  /** Explicación en castellano de qué implica este motor. */
  readonly descripcion: string;

  listarFechas(): Promise<Fecha[]>;
  obtenerFecha(id: string): Promise<Fecha | null>;
  guardarFecha(fecha: Fecha): Promise<void>;
  borrarFecha(id: string): Promise<void>;

  listarBoletas(fechaId: string): Promise<Boleta[]>;
  obtenerBoleta(fechaId: string, boletaId: string): Promise<Boleta | null>;
  reemplazarBoletas(fechaId: string, boletas: Boleta[]): Promise<void>;
  guardarBoleta(boleta: Boleta): Promise<void>;
  borrarBoleta(fechaId: string, boletaId: string): Promise<void>;

  /**
   * Banderas de configuración que tienen que sobrevivir a un reinicio.
   * Se usa, por ejemplo, para recordar que el administrador borró los datos de
   * demostración y no volver a crearlos solos. Cadena vacía o null = sin valor.
   */
  leerBandera(clave: string): Promise<string | null>;
  escribirBandera(clave: string, valor: string): Promise<void>;
}
