import { describe, expect, it } from 'vitest';
import {
  passwordResetEmail,
  registrationApprovedEmail,
  spotOpenedEmail,
  teamsPublishedEmail,
} from './templates';

describe('e-mails transacionais (§14)', () => {
  it('o link de recuperação vai em texto puro, não só no botão', () => {
    const message = passwordResetEmail({
      to: 'atleta@exemplo.com',
      name: 'Dricco',
      token: 'abc123token',
    });

    // Metade do grupo lê e-mail com imagens e estilos bloqueados: um link que
    // só existe dentro de um botão HTML simplesmente não chega.
    expect(message.text).toContain('redefinir-senha?token=abc123token');
    expect(message.html).toContain('redefinir-senha?token=abc123token');
    expect(message.subject).toContain('Recuperar acesso');
  });

  it('avisa que o link expira e que ignorar é seguro', () => {
    const message = passwordResetEmail({ to: 'a@b.com', name: 'Alguém', token: 't' });

    expect(message.text).toContain('1 hora');
    expect(message.text).toMatch(/n[ãa]o foi voc[êe]/i);
  });

  it('codifica o token na URL', () => {
    const message = passwordResetEmail({
      to: 'a@b.com',
      name: 'Alguém',
      token: 'tok/com+simbolos=',
    });

    expect(message.text).toContain(encodeURIComponent('tok/com+simbolos='));
    expect(message.text).not.toContain('tok/com+simbolos=');
  });

  it('o aviso de vaga liberada explica o que aconteceu e como sair', () => {
    const message = spotOpenedEmail({
      to: 'a@b.com',
      name: 'Guto',
      eventTitle: 'Encontro de quarta',
      eventDate: 'quarta-feira, 22/07/2026',
      eventId: 'evt-1',
    });

    expect(message.text).toContain('Encontro de quarta');
    expect(message.text).toContain('lista de espera');
    expect(message.text).toContain('cancele');
    expect(message.subject).toContain('Vaga liberada');
  });

  it('nenhum e-mail vaza nota, afinidade ou valor', () => {
    const messages = [
      passwordResetEmail({ to: 'a@b.com', name: 'X', token: 't' }),
      registrationApprovedEmail({ to: 'a@b.com', name: 'X' }),
      spotOpenedEmail({
        to: 'a@b.com',
        name: 'X',
        eventTitle: 'E',
        eventDate: 'd',
        eventId: '1',
      }),
      teamsPublishedEmail({
        to: 'a@b.com',
        name: 'X',
        eventTitle: 'E',
        eventDate: 'd',
        eventId: '1',
      }),
    ];

    for (const message of messages) {
      const body = `${message.subject} ${message.text} ${message.html ?? ''}`;
      expect(body).not.toMatch(/nota oficial|avalia[çc][ãa]o oficial|afinidade|R\$|equil[íi]brio/i);
    }
  });

  it('todo e-mail tem corpo em texto puro', () => {
    const message = teamsPublishedEmail({
      to: 'a@b.com',
      name: 'X',
      eventTitle: 'E',
      eventDate: 'd',
      eventId: '1',
    });

    expect(message.text.trim().length).toBeGreaterThan(20);
  });
});
