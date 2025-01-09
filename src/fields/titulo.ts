import type { Field } from 'payload'

type FieldTituloArgs = { defaultValue: string }
export const fieldTitulo = ({ defaultValue }: FieldTituloArgs): Field => ({
  type: 'text',
  name: 'titulo',
  label: 'Titulo',
  required: true,
  defaultValue,
  admin: {
    hidden: true,
  },
})
