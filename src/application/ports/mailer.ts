export interface EmailMessage {
  to: string;
  /** Nombre de la plantilla que lo generó: clave estable para la bitácora y los tags. */
  template: string;
  subject: string;
  html: string;
  text?: string;
  /** Adjuntos (p. ej. el .ics de la sesión); contenido en texto. */
  attachments?: { filename: string; content: string }[];
}

/** Contenido de un email sin destinatario (el servicio decide a quién). */
export type EmailContent = Omit<EmailMessage, "to">;

export interface Mailer {
  send(msg: EmailMessage): Promise<void>;
}
