import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotAuthenticatedError } from '@/domain/shared/errors';
import {
  canViewAffinity,
  canViewOfficialEvaluation,
  requireActive,
  requireAdmin,
  requireAffinityWrite,
  requireAttendanceResponse,
  requireAuthenticated,
  requireFinanceAccess,
  requireOfficialEvaluationEdit,
  requireOfficialEvaluationView,
  restrictAthletePatch,
  sanitizeAthlete,
  sanitizeFormation,
  visibleAffinities,
  type Actor,
  type AffinityRecord,
  type AthleteRecord,
} from './index';

const ATLETA: Actor = {
  userId: 'u-atleta',
  athleteId: 'a-1',
  roles: ['atleta'],
  status: 'ativo',
};

const OUTRO_ATLETA: Actor = {
  userId: 'u-outro',
  athleteId: 'a-2',
  roles: ['atleta'],
  status: 'ativo',
};

/** Administrador que também é atleta — os papéis não são exclusivos (§4). */
const ADMIN_ATLETA: Actor = {
  userId: 'u-admin',
  athleteId: 'a-3',
  roles: ['admin', 'atleta'],
  status: 'ativo',
};

const PENDENTE: Actor = {
  userId: 'u-pendente',
  athleteId: null,
  roles: ['atleta'],
  status: 'aguardando_aprovacao',
};

const athlete: AthleteRecord = {
  id: 'a-1',
  fullName: 'Atleta Um',
  nickname: 'Um',
  avatarUrl: null,
  phone: '55999990001',
  email: 'um@exemplo.com',
  birthDate: '1995-03-10',
  shirtNumber: 7,
  uniformSize: 'M',
  joinedAt: '2024-02-01',
  status: 'ativo',
  athleteNotes: 'Prefiro jogar de ponteiro.',
  adminNotes: 'Costuma cancelar em cima da hora.',
  healthRestrictions: 'Tendinite no ombro direito.',
};

describe('portões básicos', () => {
  it('nega tudo sem ator', () => {
    expect(() => requireAuthenticated(null)).toThrow(NotAuthenticatedError);
    expect(() => requireAdmin(null)).toThrow(NotAuthenticatedError);
    expect(() => requireFinanceAccess(null)).toThrow(NotAuthenticatedError);
  });

  it('bloqueia conta aguardando aprovação com mensagem específica', () => {
    expect(() => requireActive(PENDENTE)).toThrow(ForbiddenError);
    try {
      requireActive(PENDENTE);
    } catch (error) {
      expect((error as ForbiddenError).message).toContain('aguardando aprovação');
    }
  });

  it('reconhece administrador que também é atleta', () => {
    expect(() => requireAdmin(ADMIN_ATLETA)).not.toThrow();
    expect(requireAdmin(ADMIN_ATLETA).athleteId).toBe('a-3');
  });
});

describe('financeiro — atleta recebe erro de autorização (§23.7)', () => {
  it('nega acesso a atleta comum', () => {
    expect(() => requireFinanceAccess(ATLETA)).toThrow(ForbiddenError);
  });

  it('a negativa é erro de permissão, não resposta vazia', () => {
    try {
      requireFinanceAccess(ATLETA);
      throw new Error('deveria ter negado');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).code).toBe('SEM_PERMISSAO');
      expect((error as ForbiddenError).details.resource).toBe('financeiro');
    }
  });

  it('permite administrador', () => {
    expect(() => requireFinanceAccess(ADMIN_ATLETA)).not.toThrow();
  });
});

describe('avaliação oficial — §7 e §23.2', () => {
  it('o atleta não vê a própria avaliação oficial por padrão', () => {
    expect(canViewOfficialEvaluation(ATLETA, 'a-1')).toBe(false);
    expect(() => requireOfficialEvaluationView(ATLETA, 'a-1')).toThrow(ForbiddenError);
  });

  it('a configuração do clube pode liberar a visão da própria avaliação', () => {
    expect(
      canViewOfficialEvaluation(ATLETA, 'a-1', { selfOfficialEvaluationVisible: true }),
    ).toBe(true);
  });

  it('nunca libera a avaliação oficial de terceiros, mesmo com a configuração ativa', () => {
    expect(
      canViewOfficialEvaluation(ATLETA, 'a-2', { selfOfficialEvaluationVisible: true }),
    ).toBe(false);
  });

  it('administrador vê a avaliação oficial de qualquer atleta', () => {
    expect(canViewOfficialEvaluation(ADMIN_ATLETA, 'a-1')).toBe(true);
  });

  it('atleta não consegue alterar a avaliação oficial', () => {
    expect(() => requireOfficialEvaluationEdit(ATLETA)).toThrow(ForbiddenError);
    expect(() => requireOfficialEvaluationEdit(ADMIN_ATLETA)).not.toThrow();
  });
});

describe('afinidades — privacidade (§8.3 e §23.3)', () => {
  const minha: AffinityRecord = {
    id: 'af-1',
    fromAthleteId: 'a-1',
    toAthleteId: 'a-2',
    type: 'pessoal',
    intensity: 2,
    rigidity: 'preferencia_flexivel',
    note: null,
  };

  const contraMim: AffinityRecord = {
    id: 'af-2',
    fromAthleteId: 'a-2',
    toAthleteId: 'a-1',
    type: 'pessoal',
    intensity: -3,
    rigidity: 'preferencia_flexivel',
    note: null,
  };

  it('o atleta vê apenas o que ele mesmo cadastrou', () => {
    expect(canViewAffinity(ATLETA, minha)).toBe(true);
    expect(canViewAffinity(ATLETA, contraMim)).toBe(false);
  });

  it('o alvo de uma preferência negativa nunca fica sabendo', () => {
    const visiveis = visibleAffinities(ATLETA, [minha, contraMim]);
    expect(visiveis).toEqual([minha]);
    // Nem o registro, nem sequer a existência dele, chegam ao alvo.
    expect(visiveis.some((a) => a.toAthleteId === 'a-1')).toBe(false);
  });

  it('atleta não consulta afinidades de terceiros', () => {
    const deTerceiros: AffinityRecord = { ...minha, id: 'af-3', fromAthleteId: 'a-9' };
    expect(canViewAffinity(OUTRO_ATLETA, deTerceiros)).toBe(false);
  });

  it('administrador vê todas as relações', () => {
    expect(visibleAffinities(ADMIN_ATLETA, [minha, contraMim])).toHaveLength(2);
  });

  it('só administrador cria restrição obrigatória', () => {
    expect(() =>
      requireAffinityWrite(ATLETA, {
        fromAthleteId: 'a-1',
        rigidity: 'restricao_obrigatoria',
      }),
    ).toThrow(ForbiddenError);

    expect(() =>
      requireAffinityWrite(ADMIN_ATLETA, {
        fromAthleteId: 'a-1',
        rigidity: 'restricao_obrigatoria',
      }),
    ).not.toThrow();
  });

  it('atleta não cadastra preferência em nome de outro', () => {
    expect(() =>
      requireAffinityWrite(ATLETA, {
        fromAthleteId: 'a-2',
        rigidity: 'preferencia_flexivel',
      }),
    ).toThrow(ForbiddenError);
  });
});

describe('sanitização de atleta — o campo some do payload (§20)', () => {
  it('remove observações internas e contato ao serializar para terceiros', () => {
    const visto = sanitizeAthlete(OUTRO_ATLETA, athlete);

    expect(visto).not.toHaveProperty('adminNotes');
    expect(visto).not.toHaveProperty('healthRestrictions');
    expect(visto).not.toHaveProperty('phone');
    expect(visto).not.toHaveProperty('email');
    expect(visto.fullName).toBe('Atleta Um');
  });

  it('o próprio atleta vê seus dados, menos a observação interna do admin', () => {
    const visto = sanitizeAthlete(ATLETA, athlete);

    expect(visto).toHaveProperty('phone');
    expect(visto).toHaveProperty('healthRestrictions');
    expect(visto).not.toHaveProperty('adminNotes');
  });

  it('administrador vê tudo', () => {
    const visto = sanitizeAthlete(ADMIN_ATLETA, athlete);
    expect(visto).toHaveProperty('adminNotes', 'Costuma cancelar em cima da hora.');
  });

  it('sem ator, expõe apenas o mínimo', () => {
    const visto = sanitizeAthlete(null, athlete);
    expect(Object.keys(visto).sort()).toEqual(
      ['avatarUrl', 'fullName', 'id', 'joinedAt', 'nickname', 'shirtNumber', 'status'].sort(),
    );
  });
});

describe('restrição de campos na edição', () => {
  it('descarta campos administrativos enviados por um atleta', () => {
    const patch = restrictAthletePatch(ATLETA, 'a-1', {
      nickname: 'Novo apelido',
      adminNotes: 'tentativa de escrita',
      shirtNumber: 99,
      healthRestrictions: 'tentativa',
    });

    expect(patch).toEqual({ nickname: 'Novo apelido' });
  });

  it('administrador mantém o patch completo', () => {
    const patch = restrictAthletePatch(ADMIN_ATLETA, 'a-1', {
      adminNotes: 'anotação legítima',
      shirtNumber: 99,
    });

    expect(patch).toEqual({ adminNotes: 'anotação legítima', shirtNumber: 99 });
  });

  it('atleta não edita cadastro de outro', () => {
    expect(() => restrictAthletePatch(ATLETA, 'a-2', { nickname: 'x' })).toThrow(
      ForbiddenError,
    );
  });
});

describe('formação publicada — nunca expõe notas nem afinidades (§10.10)', () => {
  const formation = {
    teams: [{ name: 'Time A', members: [{ id: 'a-1', displayName: 'Atleta Um' }] }],
    metrics: { diffPct: 2.8 },
    affinityOutcomes: [{ satisfied: false }],
    alerts: [{ code: 'atleta_provisorio' }],
    provenance: { seed: 42 },
  };

  it('atleta recebe apenas os times', () => {
    const visto = sanitizeFormation(ATLETA, formation);

    expect(visto).toEqual({ teams: formation.teams });
    expect(visto).not.toHaveProperty('metrics');
    expect(visto).not.toHaveProperty('affinityOutcomes');
    expect(visto).not.toHaveProperty('provenance');
  });

  it('administrador recebe a explicação completa', () => {
    expect(sanitizeFormation(ADMIN_ATLETA, formation)).toHaveProperty('metrics');
  });
});

describe('presenças', () => {
  it('atleta responde apenas por si', () => {
    expect(() => requireAttendanceResponse(ATLETA, 'a-1')).not.toThrow();
    expect(() => requireAttendanceResponse(ATLETA, 'a-2')).toThrow(ForbiddenError);
  });

  it('administrador confirma em nome de um perfil gerenciado', () => {
    expect(() => requireAttendanceResponse(ADMIN_ATLETA, 'a-99')).not.toThrow();
  });
});
