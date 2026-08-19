// scripts/update-squad-api.js
//
// Busca o elenco e os próximos jogos na API (sports.bzzoiro.com) e escreve
// data/elenco.json. O token fica numa variável de ambiente (BZZOIRO_TOKEN)
// — configurada como "secret" do repositório no GitHub, nunca aparece no
// código nem no navegador.
//
// Regras aplicadas pro elenco (conforme combinado):
// - date_of_birth nulo -> jogador ignorado (não entra no elenco.json)
// - availability "injured" -> marcado como lesionado no app
// - qualquer outro availability (available, suspended, etc.) -> sem marcação
// - jersey_number -> número do jogador
//
// Pros próximos jogos: pega as partidas com status "notstarted", identifica
// qual time é o adversário (o que não é o Atlético-MG) e monta uma lista
// ordenada por data, que alimenta o seletor de "Adversário" no app.

const fs = require("fs");

const TEAM_ID = 155; // Atlético-MG
const TOKEN = (process.env.BZZOIRO_TOKEN || "").trim();

if (!TOKEN) {
  console.error("Faltou a variável de ambiente BZZOIRO_TOKEN (configure como secret no GitHub).");
  process.exit(1);
}

// Mapa de códigos de posição -> palavra em inglês que o app já reconhece.
// Só confirmei "M" = Midfielder pelo seu exemplo; se a API usar outros
// códigos além de G/D/M/F, me diga quais que eu ajusto esse mapa.
const POSITION_MAP = {
  G: "Goalkeeper",
  GK: "Goalkeeper",
  D: "Defender",
  M: "Midfielder",
  F: "Forward",
  FW: "Forward",
};

// A API pode devolver o array direto, ou (mais comum, típico de Django REST
// Framework, que é o que o esquema "Authorization: Token" sugere) um objeto
// com paginação tipo {count, next, previous, results:[...]}. Tenta reconhecer
// os formatos mais prováveis automaticamente.
function extractList(raw) {
  if (Array.isArray(raw)) return raw;
  const candidates = ["results", "data", "squad", "fixtures", "players", "player"];
  for (const key of candidates) {
    if (raw && Array.isArray(raw[key])) return raw[key];
  }
  return null;
}

async function fetchApi(path) {
  const res = await fetch(`https://sports.bzzoiro.com/api/v2/${path}`, {
    headers: { Authorization: `Token ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `API (${path}) respondeu ${res.status} ${res.statusText}` + (body ? ` — ${body.slice(0, 300)}` : "")
    );
  }
  return res.json();
}

async function getSquad() {
  const raw = await fetchApi(`teams/${TEAM_ID}/squad/`);
  const list = extractList(raw);
  if (!list) {
    const keys = raw && typeof raw === "object" ? Object.keys(raw).join(", ") : typeof raw;
    throw new Error(`Não achei a lista de jogadores na resposta. Chaves recebidas: [${keys}]`);
  }
  return list
    .filter((p) => !!p.date_of_birth) // ignora quem não tem data de nascimento
    .map((p) => ({
      name: p.short_name || p.name,
      number: p.jersey_number != null ? String(p.jersey_number) : "00",
      position: POSITION_MAP[p.position] || p.position,
      injured: p.availability === "injured",
    }));
}

async function getUpcomingOpponents() {
  const raw = await fetchApi(`teams/${TEAM_ID}/fixtures/`);
  const list = extractList(raw);
  if (!list) return [];

  return list
    .filter((f) => f.status === "notstarted")
    .map((f) => {
      const isHome = f.home_team_id === TEAM_ID;
      return {
        id: isHome ? f.away_team_id : f.home_team_id,
        name: isHome ? f.away_team : f.home_team,
        date: f.event_date,
      };
    })
    .filter((o) => o.name)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function main() {
  const player = await getSquad();
  console.log(`Elenco: ${player.length} jogadores.`);

  let opponents = [];
  try {
    opponents = await getUpcomingOpponents();
    console.log(`Próximos jogos: ${opponents.length} adversários encontrados.`);
    opponents.forEach((o) => console.log(`  - ${o.name} (${o.date})`));
  } catch (err) {
    console.log("Não consegui buscar os próximos jogos (seguindo só com o elenco):", err.message);
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/elenco.json", JSON.stringify({ player, opponents }, null, 2));
  console.log("Salvo em data/elenco.json");
}

main().catch((err) => {
  console.error("Falhou:", err.message);
  process.exit(1);
});
