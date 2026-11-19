import Link from 'next/link'

export const metadata = {
  title: 'Termos de uso — Rei do FPS',
  description: 'Condições de uso do Rei do FPS: estimativas, preços, links de afiliado e responsabilidades.',
}

const H2 = { fontFamily: 'var(--font-plex), "IBM Plex Sans", sans-serif' }

export default function TermosPage() {
  return (
    <article className="max-w-3xl mx-auto space-y-8" style={{ padding: '40px 16px' }}>
      <header className="pb-6 border-b border-border">
        <h1 className="text-4xl mb-2" style={H2}>Termos de uso</h1>
        <p className="text-secondary">Versão de 18/11/2026</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>1. O que o Rei do FPS é</h2>
        <p>
          Um comparador gratuito de builds de PC gamer para o mercado brasileiro. Não vendemos peças,
          não somos loja e não intermediamos pagamentos. A compra acontece sempre no site da loja.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>2. FPS são estimativas</h2>
        <p>
          Todo número de FPS é uma <strong>estimativa</strong> com banda de confiança, calculada a partir
          de fontes públicas — não é medição na sua máquina. O resultado real varia com drivers,
          configurações, temperatura e versão do jogo.{' '}
          <Link href="/como-medimos" style={{ color: 'var(--accent)' }}>Veja o método</Link>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>3. Preços e disponibilidade</h2>
        <p>
          Preços marcados como <strong>amostra</strong> são ilustrativos e não são oferta de venda. Preços
          de loja mostram data e hora da última verificação e podem mudar a qualquer momento. Vale sempre o
          preço exibido pela loja no momento da compra.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>4. Compatibilidade</h2>
        <p>
          A checagem de compatibilidade cobre as regras descritas no site (soquete, RAM, dimensões,
          potência e outras). Confira a ficha técnica do fabricante antes de comprar; não respondemos por
          incompatibilidades fora dessas regras ou por dados errados de terceiros.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>5. Links de afiliado</h2>
        <p>
          Alguns links são de afiliado: se você comprar por eles, recebemos comissão da loja. O preço para
          você não muda e a comissão nunca altera o ranking.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>6. Uso aceitável</h2>
        <p>
          É proibido sobrecarregar o site ou a API com requisições automatizadas, tentar burlar limites
          de acesso ou gerar cliques artificiais em links de loja.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl" style={H2}>7. Mudanças</h2>
        <p>
          Podemos atualizar estes termos; a data da versão fica no topo. O tratamento de dados está na{' '}
          <Link href="/privacidade" style={{ color: 'var(--accent)' }}>política de privacidade</Link>.
        </p>
      </section>
    </article>
  )
}
