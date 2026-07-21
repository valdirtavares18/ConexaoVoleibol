import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, PageHeader } from '@/components/ui/primitives';
import { AthleteForm, EMPTY_ATHLETE } from '../athlete-form';

export const metadata: Metadata = { title: 'Cadastrar atleta' };

export default function NovoAtletaPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <Link href="/admin/atletas" className="hover:underline">
            ← Atletas
          </Link>
        }
        title="Cadastrar atleta"
        description="Cria um perfil sem conta de acesso. O vínculo com uma conta pode ser feito depois."
      />

      <Callout tone="info" title="Perfil sem conta">
        O atleta já participa de jogos, entra nos times, recebe avaliação e tem financeiro — mesmo
        sem nunca ter criado uma conta. Se ele se cadastrar depois usando o mesmo e-mail ou
        telefone, o sistema propõe o vínculo em vez de criar um perfil repetido.
      </Callout>

      <AthleteForm initial={EMPTY_ATHLETE} />
    </div>
  );
}
