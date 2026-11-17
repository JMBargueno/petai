import { z } from 'zod';
import { CONTACT_SOURCES, CONTACT_TYPES } from '../contact-types';

const required = (name: string) =>
  z.string({ error: (issue) => (issue.input === undefined ? `${name} es obligatorio` : `${name} debe ser un texto`) });

// Caracteres de control: en campos de una línea se cambian por espacios; en el mensaje se conservan \n y \r.
const CONTROL = /[\u0000-\u001f\u007f]/g;
const CONTROL_EXCEPT_NEWLINES = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g;

/** Texto obligatorio, saneado y acotado en longitud. */
const field = (name: string, min: number, max: number, multiline = false) =>
  required(name)
    .transform((s) => (multiline ? s.replace(CONTROL_EXCEPT_NEWLINES, '') : s.replace(CONTROL, ' ')).trim())
    .pipe(
      z
        .string()
        .min(min, min <= 1 ? `${name} es obligatorio` : `${name} debe tener al menos ${min} caracteres`)
        .max(max, `${name} no puede superar los ${max} caracteres`),
    );

/** Formulario de contacto público. `website` es un honeypot: los humanos lo dejan vacío. */
export const contactSchema = z.object({
  name: field('name', 1, 100),
  email: required('email')
    .trim()
    .toLowerCase()
    .max(254, 'email demasiado largo')
    .refine((v) => z.email().safeParse(v).success, 'email no es válido'),
  subject: field('subject', 1, 150),
  message: field('message', 10, 5000, true),
  // Opcionales para no romper clientes antiguos: sin tipo ⇒ «otro»; sin origen ⇒ la web.
  type: z.enum(CONTACT_TYPES, { error: 'type no es válido' }).default('other'),
  source: z.enum(CONTACT_SOURCES, { error: 'source no es válido' }).default('web'),
  website: z.string().max(500).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;
