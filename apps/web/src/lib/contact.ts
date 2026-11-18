/**
 * E-mail público de contato (encarregado LGPD + "avisa a gente").
 * Lido em tempo de execução de CONTACT_EMAIL (compose → pcb_web), para que
 * ligar/mudar o endereço seja só editar o .env e recriar o container — sem
 * rebuild. Vazio ⇒ as páginas escondem o link em vez de mostrar um e-mail que
 * devolve (o domínio ainda não tem MX).
 */
export function contactEmail(): string | undefined {
  const v = process.env.CONTACT_EMAIL?.trim()
  return v ? v : undefined
}
