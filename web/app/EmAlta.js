import BotaoGerar from "./BotaoGerar";

const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Ranking da última busca do robô: os que ainda não viraram vídeo são os
// próximos da fila, na ordem em que aparecem.
export default function EmAlta({ produtos }) {
  if (!produtos.length) {
    return (
      <p className="vazio">
        O ranking aparece aqui depois da primeira busca do robô.
      </p>
    );
  }
  const atualizado = new Date(produtos[0].atualizado_em).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <section>
      <p className="pequeno">
        Última busca: {atualizado}. O robô transforma em vídeo, de cima para baixo, os que ainda não
        viraram vídeo. Pontuação = vendas + comissão + desconto.
      </p>
      <ol className="ranking">
        {produtos.map((p) => (
          <li key={p.item_id} className={`produto ${p.ja_usado ? "usado" : ""}`}>
            <span className="posicao">{p.posicao}º</span>
            {p.imagem_url ? (
              <img src={p.imagem_url} alt="" loading="lazy" />
            ) : (
              <span className="sem-foto" aria-hidden="true">🛍️</span>
            )}
            <div className="dados">
              <a href={p.link_afiliado} target="_blank" rel="noreferrer" className="nome">
                {p.nome}
              </a>
              <p className="meta">
                <strong>{brl(p.preco)}</strong>
                {p.desconto >= 10 && <span className="tag">-{Math.round(p.desconto)}%</span>}
                {p.comissao > 0 && (
                  <span className="tag verde">
                    {Math.round(p.comissao * 100)}% · ~{brl(p.preco * p.comissao)}/venda
                  </span>
                )}
              </p>
              <p className="meta pequeno">
                {Number(p.vendas).toLocaleString("pt-BR")} vendidos · ⭐ {String(p.nota).replace(".", ",")}
                {p.tema && ` · ${p.tema}`} · {String(p.pontuacao).replace(".", ",")} pts
              </p>
            </div>
            <div className="estado">
              {p.ja_usado ? (
                <span className="chip">Vídeo feito</span>
              ) : (
                <BotaoGerar item={p.item_id} rotulo="Gerar vídeo deste" className="botao" />
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
