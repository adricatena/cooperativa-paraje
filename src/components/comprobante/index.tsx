import type { Consumo, Medidore, Usuario } from '@/payload-types'
import { round } from '@/utils/math'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { useMemo } from 'react'

const styles = StyleSheet.create({
  bloque: {
    width: '100%',
    borderWidth: '1px',
    borderColor: 'mediumseagreen',
    borderRadius: '5px',
    color: 'mediumseagreen',
    backgroundColor: 'honeydew',
  },
  titulo: {
    color: 'mediumseagreen',
    fontSize: 15,
  },
  subtitulo: {
    color: 'mediumseagreen',
    fontSize: 12,
  },
  texto: {
    color: 'mediumseagreen',
    fontSize: 10,
  },
})

const BLOQUE_TITULO = [
  styles.bloque,
  {
    padding: 5,
  },
  styles.subtitulo,
]

type Props = {
  consumo: Consumo
}
export function Comprobante({ consumo }: Props) {
  const createdAt = useMemo(() => new Date(consumo.createdAt), [])
  const createdAtMonth = useMemo(() => `${createdAt.getMonth() + 1}/${createdAt.getFullYear()}`, [])

  const importeNeto = useMemo(
    () => round((consumo.datos_facturacion?.precio_final ?? 0) / 1.21),
    [],
  )
  const importeIva = useMemo(
    () => round(((consumo.datos_facturacion?.precio_final ?? 0) * 100 - importeNeto * 100) / 100),
    [],
  )

  return (
    <Document>
      <Page
        size="A5"
        orientation="landscape"
        style={{
          backgroundColor: 'white',
          padding: 20,
          fontSize: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          fontWeight: 800,
        }}
      >
        <View
          style={[
            styles.bloque,
            {
              display: 'flex',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 20,
              gap: 5,
            },
          ]}
        >
          <Text style={styles.titulo}>
            COOPERATIVA DE AGUA Y SERVICIOS PUBLICOS PARAJE LA VIRGEN
          </Text>
          <Text style={styles.subtitulo}>
            Paraje La Virgen - Dpto. Diamante - C.P. 3101 - Entre Rios
          </Text>
          <Text style={[styles.texto, { fontSize: 8 }]}>
            I.V.A. RESPONSABLE INSCRIPTO - C.U.I.T.: 30-70834541-1 - Ing. Brutos: Exento - INIC. DE
            ACTIVIDADES: 17/03/2003 Matricula N° 24404
          </Text>
        </View>
        <View>
          <Text style={[...BLOQUE_TITULO]}>LIQUIDACIÓN DE SERVICIOS PUBLICOS</Text>
          <View
            style={[
              {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 5,
              },
            ]}
          >
            <Text style={[styles.texto]}>Comprobante Tipo: B (Cód. 18)</Text>
            <Text style={[styles.texto]}>Número: {consumo.nro_comprobante}</Text>
            <Text style={[styles.texto]}>
              Fecha de Emisión: {new Date(consumo.createdAt).toLocaleDateString('es-AR')}
            </Text>
          </View>
        </View>
        <View>
          <Text style={[...BLOQUE_TITULO]}>USUARIO</Text>
          <View
            style={{
              marginTop: 5,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={[styles.texto]}>
              Nombre:{(consumo.medidor as Medidore).titulo.split('-')[1]}
            </Text>
            <Text style={[styles.texto]}>
              CUIT/CUIL:{' '}
              {((consumo.medidor as Medidore).usuario as Usuario)?.datos_personales?.cuit}
            </Text>
            <Text style={[styles.texto]}>CONSUMIDOR FINAL</Text>
            <View style={[{ display: 'flex', flexDirection: 'row', gap: 10 }]}></View>
          </View>
        </View>
        <View>
          <Text style={[...BLOQUE_TITULO]}>MEDIDOR</Text>
          <View style={[{ marginTop: 5 }]}>
            <Text style={[styles.texto]}>Direccion: {(consumo.medidor as Medidore).direccion}</Text>
            <Text style={[styles.texto]}>
              Número de Medidor: {(consumo.medidor as Medidore).numero_medidor}
            </Text>
          </View>
        </View>
        <View>
          <Text style={[...BLOQUE_TITULO]}>CONSUMO</Text>
          <View
            style={[
              {
                marginTop: 5,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              },
            ]}
          >
            <View>
              <Text style={[styles.texto]}>Periodo: {consumo.periodo_normalizado}</Text>
              <Text style={[styles.texto]}>
                Lectura previa: {consumo.lectura - (consumo.consumo_real ?? 0)}
              </Text>
              <Text style={[styles.texto]}>Lectura actual: {consumo.lectura}</Text>
              <Text style={[styles.texto]}>Consumo: {consumo.consumo_real}</Text>
              <Text style={[styles.texto]}>
                Consumo base: {consumo.datos_facturacion?.consumo_base}
              </Text>
              <Text style={[styles.texto]}>
                Precio base: ${consumo.datos_facturacion?.precio_base}
              </Text>
              <Text style={[styles.texto]}>
                Precio por litro: $
                {(consumo.datos_facturacion?.precio_base ?? 0) /
                  (consumo.datos_facturacion?.consumo_base ?? 1)}{' '}
                por litro
              </Text>
              <Text style={[styles.texto]}>
                Precio regular: ${consumo.datos_facturacion?.precio_regular}
              </Text>
            </View>
            <View>
              <Text style={[styles.texto]}>
                Fecha 1er vencimiento: {consumo.datos_facturacion?.dia_primer_vencimiento}/
                {createdAtMonth}
              </Text>
              <Text style={[styles.texto]}>
                Precio 1er vencimiento: ${consumo.datos_facturacion?.precio_primer_vencimiento}
              </Text>
              <Text style={[styles.texto]}>
                Fecha 2do vencimiento: {consumo.datos_facturacion?.dia_segundo_vencimiento}/
                {createdAtMonth}
              </Text>
              <Text style={[styles.texto]}>
                Precio 2do vencimiento: ${consumo.datos_facturacion?.precio_segundo_vencimiento}
              </Text>
            </View>
            <View>
              <Text style={[styles.texto]}>
                Meses vencido: {consumo.datos_facturacion?.meses_vencido ?? 0}
              </Text>
              <Text style={[styles.texto]}>Precio final: ${consumo.precio_final}</Text>
              <Text style={[styles.texto]}>Importe neto: ${importeNeto}</Text>
              <Text style={[styles.texto]}>Alicuota IVA: %21</Text>
              <Text style={[styles.texto]}>Importe IVA: ${importeIva}</Text>
              <Text style={[styles.texto]}>
                Fecha de pago:{' '}
                {new Date(consumo.datos_facturacion?.fecha_pago ?? '').toLocaleDateString('es-AR')}
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
