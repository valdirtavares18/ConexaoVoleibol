import 'server-only';

import type { EmailMessage } from './mailer';

/**
 * Mensagens transacionais do CVA.
 *
 * Texto puro primeiro, HTML como enfeite: metade do grupo lê e-mail no celular
 * com imagens bloqueadas, e um e-mail que só funciona em HTML simplesmente não
 * chega. O link vai **em texto visível**, nunca escondido atrás de um botão.
 */

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

function layout(title: string, body: string, action?: { label: string; href: string }): string {
  return `
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f6f8fc;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d9dfeb;border-radius:12px;overflow:hidden">
    <div style="background:#071426;padding:20px 24px">
      <p style="margin:0;color:#eebe1e;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase">
        Conexão Voleibol Alegrete
      </p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700">${title}</h1>
    </div>
    <div style="padding:24px;color:#101828;font-size:15px;line-height:1.6">
      ${body}
      ${
        action
          ? `<p style="margin:24px 0 8px">
               <a href="${action.href}" style="display:inline-block;background:#0c1b3d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${action.label}</a>
             </p>
             <p style="margin:0;color:#5a6785;font-size:13px;word-break:break-all">
               Se o botão não funcionar, copie este endereço:<br>${action.href}
             </p>`
          : ''
      }
    </div>
    <div style="padding:14px 24px;border-top:1px solid #d9dfeb;color:#5a6785;font-size:12px">
      Você recebeu este e-mail porque faz parte do grupo CVA. Não responda a esta mensagem.
    </div>
  </div>
</div>`.trim();
}

export function passwordResetEmail(params: { to: string; name: string; token: string }): EmailMessage {
  const href = `${appUrl()}/redefinir-senha?token=${encodeURIComponent(params.token)}`;

  return {
    to: params.to,
    subject: 'Recuperar acesso — CVA Gestão',
    text: [
      `Olá, ${params.name}.`,
      '',
      'Recebemos um pedido para redefinir a sua senha no CVA Gestão.',
      'Abra o endereço abaixo para escolher uma nova senha:',
      '',
      href,
      '',
      'O link vale por 1 hora e só pode ser usado uma vez.',
      'Se não foi você que pediu, ignore este e-mail: nada muda.',
    ].join('\n'),
    html: layout(
      'Recuperar acesso',
      `<p style="margin:0 0 12px">Olá, <strong>${params.name}</strong>.</p>
       <p style="margin:0 0 12px">Recebemos um pedido para redefinir a sua senha.</p>
       <p style="margin:0;color:#5a6785;font-size:13px">
         O link vale por <strong>1 hora</strong> e só pode ser usado uma vez.
         Se não foi você que pediu, ignore este e-mail — nada muda.
       </p>`,
      { label: 'Escolher nova senha', href },
    ),
  };
}

export function registrationApprovedEmail(params: { to: string; name: string }): EmailMessage {
  const href = `${appUrl()}/app`;

  return {
    to: params.to,
    subject: 'Seu cadastro foi aprovado — CVA Gestão',
    text: [
      `Olá, ${params.name}.`,
      '',
      'Seu cadastro no Conexão Voleibol Alegrete foi aprovado.',
      'Agora você já pode confirmar presença nos encontros e ver os times.',
      '',
      href,
    ].join('\n'),
    html: layout(
      'Cadastro aprovado',
      `<p style="margin:0 0 12px">Olá, <strong>${params.name}</strong>.</p>
       <p style="margin:0">
         Seu cadastro foi aprovado. Já dá para confirmar presença nos encontros
         e acompanhar os times publicados.
       </p>`,
      { label: 'Abrir o CVA Gestão', href },
    ),
  };
}

export function spotOpenedEmail(params: {
  to: string;
  name: string;
  eventTitle: string;
  eventDate: string;
  eventId: string;
}): EmailMessage {
  const href = `${appUrl()}/app/eventos/${params.eventId}`;

  return {
    to: params.to,
    subject: `Vaga liberada — ${params.eventTitle}`,
    text: [
      `Olá, ${params.name}.`,
      '',
      `Abriu uma vaga no encontro "${params.eventTitle}" (${params.eventDate}) e você`,
      'era o primeiro da lista de espera. Sua presença já está confirmada.',
      '',
      'Se não puder ir, cancele para liberar a vaga para o próximo:',
      href,
    ].join('\n'),
    html: layout(
      'Você entrou no encontro',
      `<p style="margin:0 0 12px">Olá, <strong>${params.name}</strong>.</p>
       <p style="margin:0 0 12px">
         Abriu uma vaga em <strong>${params.eventTitle}</strong> (${params.eventDate}) e você
         era o primeiro da lista de espera. Sua presença já está confirmada.
       </p>
       <p style="margin:0;color:#5a6785;font-size:13px">
         Se não puder ir, cancele para liberar a vaga para o próximo da fila.
       </p>`,
      { label: 'Ver o encontro', href },
    ),
  };
}

export function teamsPublishedEmail(params: {
  to: string;
  name: string;
  eventTitle: string;
  eventDate: string;
  eventId: string;
}): EmailMessage {
  const href = `${appUrl()}/app/times`;

  return {
    to: params.to,
    subject: `Times publicados — ${params.eventTitle}`,
    text: [
      `Olá, ${params.name}.`,
      '',
      `Os times de "${params.eventTitle}" (${params.eventDate}) já estão publicados.`,
      '',
      href,
    ].join('\n'),
    html: layout(
      'Times publicados',
      `<p style="margin:0 0 12px">Olá, <strong>${params.name}</strong>.</p>
       <p style="margin:0">
         Os times de <strong>${params.eventTitle}</strong> (${params.eventDate}) já estão
         publicados.
       </p>`,
      { label: 'Ver os times', href },
    ),
  };
}
