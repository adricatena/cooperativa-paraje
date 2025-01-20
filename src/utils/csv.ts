import 'client-only'

// Función para convertir array de objetos a CSV
function convertToCSV(arr: any[]) {
  const array = [Object.keys(arr[0]), ...arr.map((item) => Object.values(item))]
  return array
    .map((row) =>
      row
        .map((value) => {
          // Convertir a string
          let strValue = String(value)

          if (typeof value === 'boolean') {
            strValue = value ? 'SI' : 'NO'
          }

          // Verificar si es un número con punto decimal
          if (typeof value === 'number' && strValue.includes('.')) {
            strValue = strValue.replace('.', ',')
          }

          // Si contiene comas, envolver en comillas
          if (strValue.includes(',')) {
            return `"${strValue}"`
          }

          return strValue
        })
        .join(';'),
    )
    .join('\n')
}

// Método 1: Usando Blob y createObjectURL
export function downloadCSV(data: any[], filename: string) {
  // Crear el contenido del CSV
  const csvContent = convertToCSV(data)

  // Agregar BOM para soporte de caracteres especiales
  const BOM = '\uFEFF'

  // Crear Blob
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

  // Crear URL del blob
  const url = window.URL.createObjectURL(blob)

  // Crear link temporal
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename || 'download.csv')

  // Añadir al DOM (necesario para Firefox)
  document.body.appendChild(link)

  // Simular click y remover
  link.click()
  document.body.removeChild(link)

  // Liberar URL
  window.URL.revokeObjectURL(url)
}
