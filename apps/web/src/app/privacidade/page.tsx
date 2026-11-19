import Link from 'next/link'
import { contactEmail } from '@/lib/contact'
import { adsConfig } from '@/lib/ads'

// Lê CONTACT_EMAIL em tempo de execução (ver lib/contact.ts).
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Política de privacidade — Rei do FPS',
  description:
    'Quais dados o Rei do FPS trata, para quê, por quanto tempo e como exercer seus direitos (LGPD).',
}

const H2 = { fontFamily: 'var(--font-plex), "IBM Plex Sans", sans-serif' }

export default function PrivacidadePage() {
  const CONTACT = contactEmail()
  // a política descreve o que o site faz AGORA: com anúncios ligados, diz isso
  const ADS = adsConfig() !== null
  return (
    <article className="max-w-3xl mx-auto space-y-8" style={{ padding: '40px 16px' }}>
      <header className="pb-6 border-b border-border">
        <h1 className="text-4xl mb-2" style={H2}>Política de privacidade</h1>
        <p className="text-secondary">Versão de 19/11/2026 · Lei Geral de Proteção de Dados (Lei 13.709/2018)</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>Resumo</h2>
        <p>
          O Rei do FPS não tem cadastro, login nem formulário. Não vendemos dados.{' '}
          {ADS
            ? <>Mostramos anúncios do Google, e os cookies de publicidade só são usados se você aceitar.</>
            : <>Não usamos cookies de publicidade.</>}{' '}
          Tratamos só o mínimo técnico para o site funcionar e para saber quantos cliques vão para as lojas.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>O que tratamos</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Registros de acesso do servidor</strong> (endereço IP, data/hora, página pedida,
            navegador). Base legal: legítimo interesse e o Marco Civil da Internet (art. 15). Guardados
            por até 6 meses, para segurança e diagnóstico.
          </li>
          <li>
            <strong>Cliques em links de loja</strong> (<span className="num-mono">/go/…</span>): qual
            oferta, página de origem, parâmetros UTM, navegador e um resumo (hash) do IP — o IP em si não
            é guardado nessa tabela. Base legal: legítimo interesse (medir e receber comissão
            de afiliado).
          </li>
          <li>
            <strong>Preferências no seu navegador</strong> (tema claro/escuro e o &quot;meu PC&quot;
            detectado) ficam no armazenamento local do <em>seu</em> navegador e nunca são enviadas para
            nós.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>Lojas e links de afiliado</h2>
        <p>
          Ao clicar em uma oferta você sai do Rei do FPS e vai para o site da loja, que tem a própria
          política de privacidade e pode usar cookies próprios para atribuir a compra. A comissão não
          muda o preço para você nem a ordem do ranking.
        </p>
      </section>

      {ADS && (
        <section className="space-y-2">
          <h2 className="text-2xl" style={H2}>Anúncios</h2>
          <p>
            Alguns espaços do site mostram anúncios do Google AdSense, sempre marcados como
            &quot;publicidade&quot;. Nada do Google carrega antes da sua escolha no aviso de cookies:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Aceitar</strong> — o Google pode usar cookies para mostrar anúncios do seu interesse. Base legal: consentimento.</li>
            <li><strong>Só o essencial</strong> — os anúncios continuam, mas não personalizados (sem perfil de interesse).</li>
          </ul>
          <p>
            A escolha fica guardada no seu navegador e pode ser mudada a qualquer momento em
            &quot;preferências de cookies&quot;, no rodapé. Conteúdo patrocinado aparece com o selo
            &quot;Patrocinado&quot;. Nem anúncios nem patrocínio mudam o ranking ou a escolha do Rei.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>Com quem compartilhamos</h2>
        <p>
          Com ninguém para fins comerciais. Os dados ficam em servidor contratado (hospedagem) que atua
          como operador.{ADS ? ' Com anúncios ligados, o Google recebe os dados técnicos que o próprio anúncio usa (conforme a sua escolha de cookies).' : ''} Só os divulgamos por obrigação legal ou ordem judicial.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>Seus direitos</h2>
        <p>
          Você pode pedir confirmação, acesso, correção, anonimização ou eliminação dos seus dados, e
          informação sobre compartilhamento (LGPD, art. 18).{' '}
          {CONTACT ? (
            <>Escreva para <a href={`mailto:${CONTACT}`} style={{ color: 'var(--accent)' }}>{CONTACT}</a>.</>
          ) : (
            <>O canal de contato do encarregado está sendo configurado e será publicado aqui.</>
          )}
        </p>
      </section>

      <p className="text-sm text-secondary pt-4 border-t border-border">
        Veja também os <Link href="/termos" style={{ color: 'var(--accent)' }}>termos de uso</Link> e{' '}
        <Link href="/como-medimos" style={{ color: 'var(--accent)' }}>como medimos o FPS</Link>.
      </p>
    </article>
  )
}
