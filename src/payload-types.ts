/* tslint:disable */
/* eslint-disable */
/**
 * This file was automatically generated by Payload.
 * DO NOT MODIFY IT BY HAND. Instead, modify your source Payload config,
 * and re-run `payload generate:types` to regenerate this file.
 */

export interface Config {
  auth: {
    usuarios: UsuarioAuthOperations;
  };
  collections: {
    usuarios: Usuario;
    medidores: Medidore;
    consumos: Consumo;
    gastos_extraordinarios: GastosExtraordinario;
    'payload-jobs': PayloadJob;
    'payload-locked-documents': PayloadLockedDocument;
    'payload-preferences': PayloadPreference;
    'payload-migrations': PayloadMigration;
  };
  collectionsJoins: {
    usuarios: {
      medidores: 'medidores';
    };
    medidores: {
      consumos: 'consumos';
    };
  };
  collectionsSelect: {
    usuarios: UsuariosSelect<false> | UsuariosSelect<true>;
    medidores: MedidoresSelect<false> | MedidoresSelect<true>;
    consumos: ConsumosSelect<false> | ConsumosSelect<true>;
    gastos_extraordinarios: GastosExtraordinariosSelect<false> | GastosExtraordinariosSelect<true>;
    'payload-jobs': PayloadJobsSelect<false> | PayloadJobsSelect<true>;
    'payload-locked-documents': PayloadLockedDocumentsSelect<false> | PayloadLockedDocumentsSelect<true>;
    'payload-preferences': PayloadPreferencesSelect<false> | PayloadPreferencesSelect<true>;
    'payload-migrations': PayloadMigrationsSelect<false> | PayloadMigrationsSelect<true>;
  };
  db: {
    defaultIDType: string;
  };
  globals: {
    variables: Variable;
  };
  globalsSelect: {
    variables: VariablesSelect<false> | VariablesSelect<true>;
  };
  locale: null;
  user: Usuario & {
    collection: 'usuarios';
  };
  jobs: {
    tasks: {
      'email-nuevo-consumo': TaskEmailNuevoConsumo;
      'email-nuevo-gasto-extra': TaskEmailNuevoGastoExtra;
      inline: {
        input: unknown;
        output: unknown;
      };
    };
    workflows: unknown;
  };
}
export interface UsuarioAuthOperations {
  forgotPassword: {
    email: string;
    password: string;
  };
  login: {
    email: string;
    password: string;
  };
  registerFirstUser: {
    email: string;
    password: string;
  };
  unlock: {
    email: string;
    password: string;
  };
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "usuarios".
 */
export interface Usuario {
  id: string;
  titulo: string;
  medidores?: {
    docs?: (string | Medidore)[] | null;
    hasNextPage?: boolean | null;
  } | null;
  rol: 'SUPERADMINISTRADOR' | 'ADMINISTRADOR' | 'CLIENTE';
  datos_personales?: {
    /**
     * Nombre completo
     */
    nombre?: string | null;
    /**
     * Apellido completo
     */
    apellido?: string | null;
    /**
     * Sin guiones ni puntos
     */
    cuit: number;
    /**
     * Domicilio real del cliente
     */
    domicilio?: string | null;
    /**
     * Telefono/Celular del cliente
     */
    telefono: number;
    /**
     * Fecha de nacimiento del cliente
     */
    nacimiento?: string | null;
  };
  confirmado?: boolean | null;
  activo?: boolean | null;
  desarrollador?: boolean | null;
  observaciones?: string | null;
  updatedAt: string;
  createdAt: string;
  email: string;
  resetPasswordToken?: string | null;
  resetPasswordExpiration?: string | null;
  salt?: string | null;
  hash?: string | null;
  loginAttempts?: number | null;
  lockUntil?: string | null;
  password?: string | null;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "medidores".
 */
export interface Medidore {
  id: string;
  titulo: string;
  consumos?: {
    docs?: (string | Consumo)[] | null;
    hasNextPage?: boolean | null;
  } | null;
  /**
   * Direccion de instalacion del medidor
   */
  direccion: string;
  /**
   * Lectura inicial del medidor
   */
  lectura_inicial: number;
  /**
   * Identificador del medidor
   */
  numero_medidor: string;
  usuario?: (string | null) | Usuario;
  observaciones?: string | null;
  activo?: boolean | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "consumos".
 */
export interface Consumo {
  id: string;
  medidor: string | Medidore;
  /**
   * Numero obtenido de la lectura
   */
  lectura: number;
  /**
   * Fecha en que se realizo la lectura
   */
  fecha_lectura: string;
  estado: 'ADEUDADO' | 'PAGADO';
  /**
   * Periodo (numero de mes) correspondiente a la lectura
   */
  periodo: string;
  periodo_normalizado?: string | null;
  nro_comprobante?: number | null;
  datos_facturacion?: {
    precio_final?: number | null;
    precio_base?: number | null;
    consumo_base?: number | null;
    precio_litro?: number | null;
    consumo_real?: number | null;
    precio_regular?: number | null;
    dia_primer_vencimiento?: number | null;
    precio_primer_vencimiento?: number | null;
    dia_segundo_vencimiento?: number | null;
    precio_segundo_vencimiento?: number | null;
    fecha_pago?: string | null;
    id_pago_mp?: string | null;
    meses_vencido?: number | null;
  };
  precio_final?: number | null;
  consumo_real?: number | null;
  titulo: string;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "gastos_extraordinarios".
 */
export interface GastosExtraordinario {
  id: string;
  medidor: string | Medidore;
  tipo: 'costo_conexion' | 'costo_reconexion' | 'costo_cambio_titular' | 'Extensión de red' | 'Otros';
  monto?: number | null;
  estado: 'ADEUDADO' | 'PAGADO';
  observaciones?: string | null;
  titulo: string;
  id_pago_mp?: string | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-jobs".
 */
export interface PayloadJob {
  id: string;
  /**
   * Input data provided to the job
   */
  input?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  taskStatus?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  completedAt?: string | null;
  totalTried?: number | null;
  /**
   * If hasError is true this job will not be retried
   */
  hasError?: boolean | null;
  /**
   * If hasError is true, this is the error that caused it
   */
  error?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  /**
   * Task execution log
   */
  log?:
    | {
        executedAt: string;
        completedAt: string;
        taskSlug: 'inline' | 'email-nuevo-consumo' | 'email-nuevo-gasto-extra';
        taskID: string;
        input?:
          | {
              [k: string]: unknown;
            }
          | unknown[]
          | string
          | number
          | boolean
          | null;
        output?:
          | {
              [k: string]: unknown;
            }
          | unknown[]
          | string
          | number
          | boolean
          | null;
        state: 'failed' | 'succeeded';
        error?:
          | {
              [k: string]: unknown;
            }
          | unknown[]
          | string
          | number
          | boolean
          | null;
        id?: string | null;
      }[]
    | null;
  taskSlug?: ('inline' | 'email-nuevo-consumo' | 'email-nuevo-gasto-extra') | null;
  queue?: string | null;
  waitUntil?: string | null;
  processing?: boolean | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-locked-documents".
 */
export interface PayloadLockedDocument {
  id: string;
  document?:
    | ({
        relationTo: 'usuarios';
        value: string | Usuario;
      } | null)
    | ({
        relationTo: 'medidores';
        value: string | Medidore;
      } | null)
    | ({
        relationTo: 'consumos';
        value: string | Consumo;
      } | null)
    | ({
        relationTo: 'gastos_extraordinarios';
        value: string | GastosExtraordinario;
      } | null)
    | ({
        relationTo: 'payload-jobs';
        value: string | PayloadJob;
      } | null);
  globalSlug?: string | null;
  user: {
    relationTo: 'usuarios';
    value: string | Usuario;
  };
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-preferences".
 */
export interface PayloadPreference {
  id: string;
  user: {
    relationTo: 'usuarios';
    value: string | Usuario;
  };
  key?: string | null;
  value?:
    | {
        [k: string]: unknown;
      }
    | unknown[]
    | string
    | number
    | boolean
    | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-migrations".
 */
export interface PayloadMigration {
  id: string;
  name?: string | null;
  batch?: number | null;
  updatedAt: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "usuarios_select".
 */
export interface UsuariosSelect<T extends boolean = true> {
  titulo?: T;
  medidores?: T;
  rol?: T;
  datos_personales?:
    | T
    | {
        nombre?: T;
        apellido?: T;
        cuit?: T;
        domicilio?: T;
        telefono?: T;
        nacimiento?: T;
      };
  confirmado?: T;
  activo?: T;
  desarrollador?: T;
  observaciones?: T;
  updatedAt?: T;
  createdAt?: T;
  email?: T;
  resetPasswordToken?: T;
  resetPasswordExpiration?: T;
  salt?: T;
  hash?: T;
  loginAttempts?: T;
  lockUntil?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "medidores_select".
 */
export interface MedidoresSelect<T extends boolean = true> {
  titulo?: T;
  consumos?: T;
  direccion?: T;
  lectura_inicial?: T;
  numero_medidor?: T;
  usuario?: T;
  observaciones?: T;
  activo?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "consumos_select".
 */
export interface ConsumosSelect<T extends boolean = true> {
  medidor?: T;
  lectura?: T;
  fecha_lectura?: T;
  estado?: T;
  periodo?: T;
  periodo_normalizado?: T;
  nro_comprobante?: T;
  datos_facturacion?:
    | T
    | {
        precio_final?: T;
        precio_base?: T;
        consumo_base?: T;
        precio_litro?: T;
        consumo_real?: T;
        precio_regular?: T;
        dia_primer_vencimiento?: T;
        precio_primer_vencimiento?: T;
        dia_segundo_vencimiento?: T;
        precio_segundo_vencimiento?: T;
        fecha_pago?: T;
        id_pago_mp?: T;
        meses_vencido?: T;
      };
  precio_final?: T;
  consumo_real?: T;
  titulo?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "gastos_extraordinarios_select".
 */
export interface GastosExtraordinariosSelect<T extends boolean = true> {
  medidor?: T;
  tipo?: T;
  monto?: T;
  estado?: T;
  observaciones?: T;
  titulo?: T;
  id_pago_mp?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-jobs_select".
 */
export interface PayloadJobsSelect<T extends boolean = true> {
  input?: T;
  taskStatus?: T;
  completedAt?: T;
  totalTried?: T;
  hasError?: T;
  error?: T;
  log?:
    | T
    | {
        executedAt?: T;
        completedAt?: T;
        taskSlug?: T;
        taskID?: T;
        input?: T;
        output?: T;
        state?: T;
        error?: T;
        id?: T;
      };
  taskSlug?: T;
  queue?: T;
  waitUntil?: T;
  processing?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-locked-documents_select".
 */
export interface PayloadLockedDocumentsSelect<T extends boolean = true> {
  document?: T;
  globalSlug?: T;
  user?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-preferences_select".
 */
export interface PayloadPreferencesSelect<T extends boolean = true> {
  user?: T;
  key?: T;
  value?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "payload-migrations_select".
 */
export interface PayloadMigrationsSelect<T extends boolean = true> {
  name?: T;
  batch?: T;
  updatedAt?: T;
  createdAt?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "variables".
 */
export interface Variable {
  id: string;
  /**
   * Fecha de primer vencimiento del comprobante
   */
  primer_vencimiento: number;
  /**
   * Porcentaje de interes a aplicar en el primer vencimiento
   */
  interes_primer_vencimiento: number;
  /**
   * Fecha de segundo vencimiento del comprobante
   */
  segundo_vencimiento: number;
  /**
   * Porcentaje de interes a aplicar en el segundo vencimiento
   */
  interes_segundo_vencimiento: number;
  /**
   * Consumo en m3
   */
  consumo_base: number;
  /**
   * Precio en pesos argentinos para el consumo base.
   */
  precio_base: number;
  /**
   * Porcentaje de interes mensual a aplicar luego del ultimo vencimiento
   */
  interes_mensual: number;
  /**
   * Ingrese el monto a cobrar para conexión como Gasto Extraordinario
   */
  costo_conexion: number;
  /**
   * Ingrese el monto a cobrar para reconexión como Gasto Extraordinario
   */
  costo_reconexion: number;
  /**
   * Ingrese el monto a cobrar para cambio de titular como Gasto Extraordinario
   */
  costo_cambio_titular: number;
  nro_comprobante_inicial?: number | null;
  ultimo_nro_comprobante_usado?: number | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "variables_select".
 */
export interface VariablesSelect<T extends boolean = true> {
  primer_vencimiento?: T;
  interes_primer_vencimiento?: T;
  segundo_vencimiento?: T;
  interes_segundo_vencimiento?: T;
  consumo_base?: T;
  precio_base?: T;
  interes_mensual?: T;
  costo_conexion?: T;
  costo_reconexion?: T;
  costo_cambio_titular?: T;
  nro_comprobante_inicial?: T;
  ultimo_nro_comprobante_usado?: T;
  updatedAt?: T;
  createdAt?: T;
  globalType?: T;
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "TaskEmail-nuevo-consumo".
 */
export interface TaskEmailNuevoConsumo {
  input: {
    consumoId: string;
  };
  output: {
    mensaje?: string | null;
  };
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "TaskEmail-nuevo-gasto-extra".
 */
export interface TaskEmailNuevoGastoExtra {
  input: {
    gastoId: string;
  };
  output: {
    mensaje?: string | null;
  };
}
/**
 * This interface was referenced by `Config`'s JSON-Schema
 * via the `definition` "auth".
 */
export interface Auth {
  [k: string]: unknown;
}


declare module 'payload' {
  export interface GeneratedTypes extends Config {}
}