// Descobre o "clima" do produto pelo nome. O tema define as cores do
// cenário, as luzinhas e o estilo da música.

const sem = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const TEMAS = {
  natal: {
    sazonal: true,
    palavras: ["natal", "natalin", "papai noel", "arvore", "pisca", "enfeite", "christmas", "panetone", "rena", "guirlanda"],
    fundo: ["#5a1414", "#14301f"], luz: ["#ffd58a", "#ffb347", "#fff2c9", "#ff6b5b"],
    musica: { bpm: 96, tom: 67, escala: "maior", timbre: "sino", guizo: true, batida: false },
  },
  cozinha: {
    palavras: ["cozinha", "panela", "faca", "liquidificador", "cortador", "forma", "assadeira", "garrafa", "copo", "pote", "air fryer", "utensilio", "biscoito", "bolo", "cafe", "xicara", "tabua", "frigideira"],
    fundo: ["#6b4426", "#2a1a10"], luz: ["#ffd9a0", "#ffc26b", "#fff0d6"],
    musica: { bpm: 100, tom: 65, escala: "maior", timbre: "dedilhado", guizo: false, batida: true },
  },
  beleza: {
    palavras: ["maquiagem", "batom", "pincel", "skincare", "cabelo", "escova", "secador", "unha", "perfume", "serum", "cilios", "base", "rimel", "chapinha", "creme"],
    fundo: ["#f2bfcc", "#7d3e57"], luz: ["#ffe1ea", "#ffc4d6", "#fff6f9"],
    musica: { bpm: 88, tom: 64, escala: "maior7", timbre: "sino", guizo: false, batida: true },
  },
  casa: {
    palavras: ["organizador", "luminaria", "decoracao", "cama", "travesseiro", "tapete", "cortina", "banheiro", "limpeza", "prateleira", "vaso", "almofada", "lencol", "abajur"],
    fundo: ["#e6d2bb", "#6e5843"], luz: ["#fff1d6", "#ffe0a8", "#ffffff"],
    musica: { bpm: 84, tom: 62, escala: "maior7", timbre: "dedilhado", guizo: false, batida: false },
  },
  tecnologia: {
    palavras: ["fone", "bluetooth", "carregador", "celular", "usb", "smartwatch", "cabo", "caixa de som", "mouse", "teclado", "led", "gamer", "camera", "suporte"],
    fundo: ["#0d1b3d", "#24104a"], luz: ["#6ec3ff", "#a98bff", "#5effe0"],
    musica: { bpm: 112, tom: 57, escala: "menor", timbre: "sintetizador", guizo: false, batida: true },
  },
  infantil: {
    palavras: ["bebe", "infantil", "crianca", "brinquedo", "mamadeira", "chupeta", "pelucia"],
    fundo: ["#ffe2a3", "#8fc7f2"], luz: ["#ffffff", "#ffe98a", "#ffc2e0"],
    musica: { bpm: 108, tom: 72, escala: "maior", timbre: "sino", guizo: false, batida: false },
  },
  pet: {
    palavras: ["pet", "cachorro", "gato", "coleira", "racao", "arranhador", "caminha"],
    fundo: ["#f5d6ab", "#9b6236"], luz: ["#fff3d9", "#ffd38a"],
    musica: { bpm: 104, tom: 65, escala: "maior", timbre: "dedilhado", guizo: false, batida: true },
  },
  fitness: {
    palavras: ["academia", "fitness", "treino", "yoga", "garrafa", "halter", "elastico", "corrida"],
    fundo: ["#18352a", "#0b100e"], luz: ["#9dffcf", "#e5ff8a", "#ffffff"],
    musica: { bpm: 118, tom: 57, escala: "menor", timbre: "sintetizador", guizo: false, batida: true },
  },
  moda: {
    palavras: ["vestido", "blusa", "bolsa", "tenis", "sandalia", "relogio", "brinco", "colar", "anel", "oculos", "carteira", "calca", "pulseira"],
    fundo: ["#2b2522", "#6b5140"], luz: ["#ffe2b0", "#f7c97c", "#ffffff"],
    musica: { bpm: 92, tom: 62, escala: "maior7", timbre: "sintetizador", guizo: false, batida: true },
  },
  geral: {
    palavras: [],
    fundo: ["#ffb39c", "#c2412a"], luz: ["#fff1e0", "#ffd2a8", "#ffffff"],
    musica: { bpm: 100, tom: 64, escala: "maior", timbre: "dedilhado", guizo: false, batida: true },
  },
};

export function detectarTema(nome) {
  const n = ` ${sem(nome)} `;
  let melhor = "geral";
  let pontos = 0;
  for (const [tema, cfg] of Object.entries(TEMAS)) {
    // Datas comemorativas mandam no clima: "forma de bolo de Natal" é Natal.
    const p = cfg.palavras.filter((w) => n.includes(` ${w}`)).length * (cfg.sazonal ? 3 : 1);
    if (p > pontos) {
      melhor = tema;
      pontos = p;
    }
  }
  return melhor;
}
