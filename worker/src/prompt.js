// Prompt para gerar a versão com IA do vídeo (YouTube Create / Gemini),
// seguindo o modelo aprovado: 10s, 3 cenas, música instrumental, sem textos.
import { nomeCurto } from "./descricao.js";

// Por tema: clima do vídeo, cenário, uso, resultado e trilha.
const CENARIOS = {
  natal: {
    clima: "tranquilo e acolhedor",
    cenario: "sobre uma bancada bonita, com decoração natalina",
    uso: "Mostre mãos adultas usando o produto com calma, no clima de preparação para o Natal. Destaque os formatos e detalhes.",
    resultado: "Mostre o resultado final em um ambiente natalino aconchegante, com aparência caprichada.",
    musica: "Música natalina instrumental suave, com piano delicado e sinos leves",
  },
  cozinha: {
    clima: "tranquilo e acolhedor",
    cenario: "sobre uma bancada de cozinha clara, organizada e bonita",
    uso: "Mostre mãos adultas usando o produto no preparo de uma receita. Destaque os formatos e detalhes.",
    resultado: "Mostre a receita pronta, servida de forma bonita, com aparência deliciosa e caprichada.",
    musica: "Música instrumental leve e aconchegante, com violão suave e piano",
  },
  beleza: {
    clima: "delicado e sofisticado",
    cenario: "sobre uma penteadeira elegante, com luz suave e flores",
    uso: "Mostre mãos adultas usando o produto na rotina de beleza. Destaque a textura, os formatos e os detalhes.",
    resultado: "Mostre o produto organizado na penteadeira, com acabamento bonito e sofisticado.",
    musica: "Música instrumental suave e elegante, com piano e batida leve",
  },
  casa: {
    clima: "tranquilo e acolhedor",
    cenario: "em um ambiente de casa aconchegante e bem decorado",
    uso: "Mostre mãos adultas usando o produto no dia a dia da casa. Destaque os formatos e detalhes.",
    resultado: "Mostre o ambiente pronto, organizado e acolhedor, com o produto em destaque.",
    musica: "Música instrumental tranquila, com piano e violão suaves",
  },
  tecnologia: {
    clima: "moderno e elegante",
    cenario: "sobre uma mesa moderna, com iluminação ambiente em tons de azul e roxo",
    uso: "Mostre mãos adultas usando o produto e seus recursos. Destaque o design e os detalhes.",
    resultado: "Mostre o produto em uso no dia a dia, com aparência moderna e premium.",
    musica: "Música eletrônica instrumental suave e moderna",
    luz: "Iluminação suave e moderna",
  },
  infantil: {
    clima: "delicado e acolhedor",
    cenario: "em um quarto de bebê delicado, com tons claros",
    uso: "Mostre mãos adultas preparando e usando o produto com cuidado. Destaque os formatos e detalhes.",
    resultado: "Mostre o produto pronto para uso no quarto, com aparência fofa e caprichada.",
    musica: "Música instrumental de ninar, com caixinha de música suave",
  },
  pet: {
    clima: "alegre e acolhedor",
    cenario: "em um cantinho de casa aconchegante",
    uso: "Mostre um cachorro ou gato usando o produto com tranquilidade. Destaque os formatos e detalhes.",
    resultado: "Mostre o pet feliz e confortável com o produto.",
    musica: "Música instrumental leve e alegre, com violão e assobio suave",
  },
  fitness: {
    clima: "leve e motivador",
    cenario: "em um espaço de treino iluminado e moderno",
    uso: "Mostre uma pessoa adulta usando o produto durante o treino. Destaque os formatos e detalhes.",
    resultado: "Mostre o produto em destaque após o treino, transmitindo energia e bem-estar.",
    musica: "Música instrumental animada e motivadora",
  },
  moda: {
    clima: "elegante e sofisticado",
    cenario: "sobre uma superfície elegante, com tecidos e luz suave",
    uso: "Mostre uma pessoa adulta usando o produto, com movimentos elegantes. Destaque o caimento e os detalhes.",
    resultado: "Mostre o produto compondo um look bonito e sofisticado.",
    musica: "Música instrumental elegante e moderna, com batida leve",
  },
  geral: {
    clima: "tranquilo e acolhedor",
    cenario: "sobre uma bancada bonita e bem iluminada",
    uso: "Mostre mãos adultas usando o produto no dia a dia. Destaque os formatos e detalhes.",
    resultado: "Mostre o resultado final, com aparência bonita e caprichada.",
    musica: "Música instrumental suave e acolhedora, com piano delicado",
  },
};

export function gerarPrompt(produto, tema) {
  const c = CENARIOS[tema] || CENARIOS.geral;
  const nome = nomeCurto(produto.nome, 20);
  return [
    `Crie um vídeo vertical de 10 segundos, ${c.clima}, mostrando o produto "${nome}".`,
    "",
    `Cena 1 (0–3s): Mostre o produto ${c.cenario}.`,
    "",
    `Cena 2 (3–7s): ${c.uso}`,
    "",
    `Cena 3 (7–10s): ${c.resultado}`,
    "",
    `Áudio: ${c.musica}, sem falas. ${c.luz || "Iluminação quente"}, movimentos lentos e transições suaves. ` +
      "Preserve o formato, as cores e os detalhes originais do produto. " +
      "Sem crianças, legendas ou textos na tela.",
  ].join("\n");
}
