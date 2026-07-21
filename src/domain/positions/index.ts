/**
 * Posições e fundamentos do voleibol usados pelo CVA.
 *
 * As posições padrão vivem aqui como semente; a tabela `positions` no banco é a
 * fonte de verdade em runtime, permitindo configuração futura sem alterar código
 * (`docs/product-spec.md` §5).
 */

export const POSITION_CODES = [
  'levantador',
  'ponteiro',
  'central',
  'oposto',
  'libero',
  'coringa',
] as const;

export type PositionCode = (typeof POSITION_CODES)[number];

export interface PositionDefinition {
  code: PositionCode;
  name: string;
  shortName: string;
  description: string;
  /** Ordem de exibição e critério de desempate para "raridade" no gerador. */
  sortOrder: number;
}

export const DEFAULT_POSITIONS: readonly PositionDefinition[] = [
  {
    code: 'levantador',
    name: 'Levantador',
    shortName: 'LEV',
    description: 'Organiza o jogo e distribui as bolas de ataque.',
    sortOrder: 1,
  },
  {
    code: 'ponteiro',
    name: 'Ponteiro',
    shortName: 'PON',
    description: 'Ataca pelas entradas de rede e participa do passe.',
    sortOrder: 2,
  },
  {
    code: 'central',
    name: 'Central',
    shortName: 'CEN',
    description: 'Bloqueio no meio da rede e ataque de velocidade.',
    sortOrder: 3,
  },
  {
    code: 'oposto',
    name: 'Oposto',
    shortName: 'OPO',
    description: 'Principal ponta de ataque, oposto ao levantador.',
    sortOrder: 4,
  },
  {
    code: 'libero',
    name: 'Líbero',
    shortName: 'LIB',
    description: 'Especialista em passe e defesa, não ataca nem bloqueia.',
    sortOrder: 5,
  },
  {
    code: 'coringa',
    name: 'Coringa',
    shortName: 'COR',
    description: 'Joga bem em mais de uma função conforme a necessidade do time.',
    sortOrder: 6,
  },
] as const;

export const POSITION_BY_CODE: Readonly<Record<PositionCode, PositionDefinition>> =
  Object.freeze(
    Object.fromEntries(DEFAULT_POSITIONS.map((p) => [p.code, p])) as Record<
      PositionCode,
      PositionDefinition
    >,
  );

/** Posições que cada time precisa cobrir por padrão. Configurável em `club_settings`. */
export const DEFAULT_REQUIRED_POSITIONS: readonly PositionCode[] = ['levantador'];

// ---------------------------------------------------------------------------
// Fundamentos
// ---------------------------------------------------------------------------

export const SKILL_CODES = [
  'saque',
  'recepcao',
  'levantamento',
  'ataque',
  'bloqueio',
  'defesa',
  'cobertura',
  'posicionamento',
  'regularidade',
  'condicionamento',
  'comunicacao',
] as const;

export type SkillCode = (typeof SKILL_CODES)[number];

export interface SkillDefinition {
  code: SkillCode;
  name: string;
  /** Peso dentro da média ponderada de fundamentos (§2.3 do doc do algoritmo). */
  defaultWeight: number;
  /** Descrição objetiva de cada nível, exibida na autoavaliação. */
  levels: Readonly<Record<1 | 2 | 3 | 4 | 5, string>>;
}

export const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  {
    code: 'saque',
    name: 'Saque',
    defaultWeight: 1,
    levels: {
      1: 'Erro frequente; ainda busco consistência para colocar a bola em quadra.',
      2: 'Acerto a maioria dos saques, mas sem direção definida.',
      3: 'Saque seguro e com alguma direção escolhida.',
      4: 'Saque forte ou bem colocado, com pouca margem de erro.',
      5: 'Saque é uma arma: pressiono a recepção adversária com regularidade.',
    },
  },
  {
    code: 'recepcao',
    name: 'Recepção',
    defaultWeight: 1.25,
    levels: {
      1: 'Tenho dificuldade de controlar o passe em saques comuns.',
      2: 'Recebo saques fracos, mas perco o controle em saques fortes.',
      3: 'Passo a maioria das bolas para a zona do levantador.',
      4: 'Recepção constante, inclusive em saques fortes.',
      5: 'Recepção precisa sob pressão; sou referência do passe no time.',
    },
  },
  {
    code: 'levantamento',
    name: 'Levantamento',
    defaultWeight: 1,
    levels: {
      1: 'Levanto apenas em emergência e sem controle de altura.',
      2: 'Consigo levantar bolas fáceis para a entrada de rede.',
      3: 'Levanto com altura razoável e acerto o tempo do atacante.',
      4: 'Distribuo o jogo com boa leitura e variação.',
      5: 'Levantamento consistente, com variação de tempo e leitura de bloqueio.',
    },
  },
  {
    code: 'ataque',
    name: 'Ataque',
    defaultWeight: 1.25,
    levels: {
      1: 'Ataco apenas empurrando a bola para o outro lado.',
      2: 'Bato na bola, mas com pouco controle de direção.',
      3: 'Ataco com força ou colocação razoável na maioria das bolas.',
      4: 'Escolho a direção e uso o bloqueio a meu favor.',
      5: 'Finalizo com constância mesmo em bola difícil ou com bloqueio duplo.',
    },
  },
  {
    code: 'bloqueio',
    name: 'Bloqueio',
    defaultWeight: 1,
    levels: {
      1: 'Quase não subo para bloquear.',
      2: 'Subo, mas normalmente fora de tempo ou de posição.',
      3: 'Acompanho a bola e às vezes fecho o bloqueio.',
      4: 'Bloqueio bem posicionado e no tempo certo com frequência.',
      5: 'Leio o levantamento e sou decisivo na rede.',
    },
  },
  {
    code: 'defesa',
    name: 'Defesa',
    defaultWeight: 1.25,
    levels: {
      1: 'Reajo tarde às bolas atacadas.',
      2: 'Defendo bolas fracas e previsíveis.',
      3: 'Defendo com regularidade e levanto bolas jogáveis.',
      4: 'Chego em bolas difíceis e mantenho a jogada viva.',
      5: 'Defesa é meu ponto forte; salvo bolas que mudam o jogo.',
    },
  },
  {
    code: 'cobertura',
    name: 'Cobertura',
    defaultWeight: 0.75,
    levels: {
      1: 'Ainda não me posiciono para cobrir o atacante.',
      2: 'Cubro quando lembro, sem constância.',
      3: 'Faço cobertura na maioria das jogadas de ataque.',
      4: 'Cubro de forma automática e em boa posição.',
      5: 'Antecipo o bloqueio adversário e organizo a cobertura do time.',
    },
  },
  {
    code: 'posicionamento',
    name: 'Posicionamento',
    defaultWeight: 1,
    levels: {
      1: 'Me perco com facilidade na rotação e na função.',
      2: 'Entendo a minha posição, mas demoro a ocupar o espaço.',
      3: 'Me posiciono corretamente na maior parte do tempo.',
      4: 'Antecipo a jogada e ocupo o espaço certo sem ser avisado.',
      5: 'Organizo o posicionamento do time em quadra.',
    },
  },
  {
    code: 'regularidade',
    name: 'Regularidade',
    defaultWeight: 1,
    levels: {
      1: 'Meu rendimento oscila muito dentro de um mesmo jogo.',
      2: 'Tenho bons momentos, mas erro em sequência quando pressionado.',
      3: 'Mantenho um nível médio previsível.',
      4: 'Rendimento estável, com poucas quedas.',
      5: 'Jogo no mesmo nível do início ao fim, independentemente do placar.',
    },
  },
  {
    code: 'condicionamento',
    name: 'Condicionamento físico',
    defaultWeight: 0.75,
    levels: {
      1: 'Canso muito rápido e preciso sair cedo.',
      2: 'Aguento uma partida, mas caio de rendimento.',
      3: 'Aguento o encontro inteiro em ritmo normal.',
      4: 'Mantenho intensidade em várias partidas seguidas.',
      5: 'Fisicamente pronto para o encontro inteiro sem queda perceptível.',
    },
  },
  {
    code: 'comunicacao',
    name: 'Comunicação em quadra',
    defaultWeight: 0.5,
    levels: {
      1: 'Jogo calado.',
      2: 'Falo pouco e normalmente depois da jogada.',
      3: 'Chamo a bola e aviso o que é minha.',
      4: 'Oriento os companheiros durante a jogada.',
      5: 'Comando o time em quadra e mantenho o grupo conectado.',
    },
  },
] as const;

export const SKILL_BY_CODE: Readonly<Record<SkillCode, SkillDefinition>> = Object.freeze(
  Object.fromEntries(SKILL_DEFINITIONS.map((s) => [s.code, s])) as Record<
    SkillCode,
    SkillDefinition
  >,
);

export const DEFAULT_SKILL_WEIGHTS: Readonly<Record<SkillCode, number>> = Object.freeze(
  Object.fromEntries(SKILL_DEFINITIONS.map((s) => [s.code, s.defaultWeight])) as Record<
    SkillCode,
    number
  >,
);

/** Descrição objetiva de cada nível da **nota geral**, exibida na autoavaliação. */
export const OVERALL_LEVEL_DESCRIPTIONS: Readonly<Record<1 | 2 | 3 | 4 | 5, string>> =
  Object.freeze({
    1: 'Estou começando agora no vôlei.',
    2: 'Já jogo, mas ainda erro fundamentos básicos com frequência.',
    3: 'Jogo com regularidade e sustento o ritmo de uma partida do grupo.',
    4: 'Sou um dos atletas que puxam o nível do time.',
    5: 'Tenho experiência competitiva e resolvo jogos.',
  });
