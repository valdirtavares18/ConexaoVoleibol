import 'server-only';

/**
 * Envio de e-mail (§20 — recuperação de acesso).
 *
 * Abstração fina com dois transportes:
 *
 *  - **Resend**, quando `RESEND_API_KEY` está definida. Escolhido por ser o
 *    provedor com o menor caminho até o primeiro e-mail entregue: uma chave, um
 *    `fetch`, sem SDK. Trocar por outro provedor é implementar `Transport`.
 *  - **Log**, caso contrário. Em desenvolvimento o e-mail aparece no terminal,
 *    com o link clicável — assim o fluxo inteiro é testável sem configurar nada.
 *
 * O envio **nunca** derruba a operação que o originou: um provedor fora do ar
 * não pode impedir alguém de trocar a própria senha. Falhas são registradas e
 * o resultado é devolvido ao chamador, que decide o que dizer ao usuário.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Corpo em texto puro. Sempre presente — é o fallback universal. */
  text: string;
  html?: string;
}

export interface SendResult {
  sent: boolean;
  /** `true` quando não há provedor configurado (desenvolvimento). */
  loggedOnly: boolean;
  error?: string;
}

interface Transport {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? 'CVA Gestão <nao-responda@cva.local>';
}

const logTransport: Transport = {
  name: 'log',
  async send(message) {
    // Não é `console.log` decorativo: em desenvolvimento este é o único lugar
    // onde o link de recuperação aparece.
    console.warn(
      [
        '',
        '─────────────────────────────────────────────',
        ' E-MAIL (nenhum provedor configurado)',
        '─────────────────────────────────────────────',
        ` Para:    ${message.to}`,
        ` Assunto: ${message.subject}`,
        '',
        message.text,
        '─────────────────────────────────────────────',
        '',
      ].join('\n'),
    );

    return { sent: true, loggedOnly: true };
  },
};

const resendTransport: Transport = {
  name: 'resend',
  async send(message) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        return {
          sent: false,
          loggedOnly: false,
          error: `Resend respondeu ${response.status}: ${detail.slice(0, 200)}`,
        };
      }

      return { sent: true, loggedOnly: false };
    } catch (error) {
      return {
        sent: false,
        loggedOnly: false,
        error: error instanceof Error ? error.message : 'falha desconhecida',
      };
    }
  },
};

function transport(): Transport {
  return process.env.RESEND_API_KEY ? resendTransport : logTransport;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const result = await transport().send(message);

  if (!result.sent) {
    console.error(`Falha ao enviar e-mail para ${message.to}: ${result.error}`);
  }

  return result;
}
