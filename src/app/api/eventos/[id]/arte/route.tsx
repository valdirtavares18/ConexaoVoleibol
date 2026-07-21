import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { getActor } from '@/server/context';
import { requireActive } from '@/server/policies';
import { getEvent } from '@/server/services/events';
import { formatEventDate } from '@/server/services/sharing';
import { getPublishedFormation } from '@/server/services/team-formation';

/**
 * Arte compartilhável dos times (§14 e §10.10).
 *
 * Gera um PNG 1080×1350 (proporção de story/feed) com a identidade do CVA e os
 * três times. Renderizado sob demanda pelo `ImageResponse` do Next — sem
 * biblioteca de imagem, sem headless browser.
 *
 * A imagem contém **apenas** o que a mensagem de texto já contém: evento, data,
 * local, nomes dos times e dos atletas. Nada de notas, afinidades ou valores.
 * Os dados vêm de `getPublishedFormation`, que não devolve esses campos.
 *
 * Exige sessão ativa: a arte lista nomes de pessoas e não deve ficar acessível
 * a quem tiver o link do evento.
 */

export const runtime = 'nodejs';

const NAVY = '#071426';
const NAVY_LIGHT = '#0c1b3d';
const GOLD = '#eebe1e';
const BLUE_100 = '#dbe6f8';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const actor = await getActor();
  try {
    requireActive(actor);
  } catch {
    return NextResponse.json({ erro: 'Acesso não autorizado.' }, { status: 403 });
  }

  const [event, formation] = await Promise.all([
    getEvent(db, { actor, eventId: id }),
    getPublishedFormation(db, id),
  ]);

  if (!event || !formation) {
    return NextResponse.json({ erro: 'Times ainda não publicados.' }, { status: 404 });
  }

  const accents = [GOLD, '#2563b8', '#eeeee2'];

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1350,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: NAVY,
          color: '#fff',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Faixas diagonais da identidade, em baixa intensidade (§15.2). */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage: `repeating-linear-gradient(-60deg, transparent 0 44px, rgba(238,190,30,0.10) 44px 52px)`,
          }}
        />

        {/* Cabeçalho */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '56px 64px 32px',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', color: GOLD, fontSize: 26, letterSpacing: 4 }}>
            ★ ★ ★
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              color: GOLD,
              fontWeight: 700,
              letterSpacing: 3,
              marginTop: 10,
            }}
          >
            CONEXÃO VOLEIBOL ALEGRETE
          </div>
          <div style={{ display: 'flex', fontSize: 62, fontWeight: 800, marginTop: 14 }}>
            {event.title}
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: BLUE_100, marginTop: 12 }}>
            {formatEventDate(event.eventDate)}
            {event.startTime ? ` · ${event.startTime.slice(0, 5)}` : ''}
          </div>
          {event.venueName ? (
            <div style={{ display: 'flex', fontSize: 26, color: BLUE_100, marginTop: 4 }}>
              {event.venueName}
            </div>
          ) : null}
        </div>

        {/* Times */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            padding: '0 64px',
            position: 'relative',
            flex: 1,
          }}
        >
          {formation.teams.map((team, index) => (
            <div
              key={team.index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: NAVY_LIGHT,
                borderRadius: 20,
                borderLeft: `10px solid ${accents[index % accents.length]}`,
                padding: '22px 28px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: 34,
                  fontWeight: 800,
                  color: accents[index % accents.length],
                  marginBottom: 12,
                }}
              >
                {team.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 28px' }}>
                {team.members.map((member) => (
                  <div
                    key={member.id}
                    style={{ display: 'flex', fontSize: 28, width: 400 }}
                  >
                    {member.displayName}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Rodapé com o confronto inicial */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '28px 64px 56px',
            position: 'relative',
          }}
        >
          {formation.teams.length >= 3 ? (
            <div style={{ display: 'flex', fontSize: 30, color: '#fff' }}>
              Começam jogando: {formation.teams[0]?.name} × {formation.teams[1]?.name}
            </div>
          ) : null}
          {formation.teams.length >= 3 ? (
            <div style={{ display: 'flex', fontSize: 26, color: BLUE_100, marginTop: 6 }}>
              Aguardando: {formation.teams[2]?.name}
            </div>
          ) : null}
          <div style={{ display: 'flex', fontSize: 22, color: GOLD, marginTop: 18 }}>
            Desde 2023 · Apenas vôlei e amizades
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1350,
      headers: {
        // Privado: a arte lista nomes. Não deve ficar em cache compartilhado.
        'Cache-Control': 'private, max-age=60',
      },
    },
  );
}
