// scripts/update-squad-api.js
//
// Busca o elenco na API (sports.bzzoiro.com) e escreve data/elenco.json.
// O token fica numa variável de ambiente (BZZOIRO_TOKEN) — configurada como
// "secret" do repositório no GitHub, nunca aparece no código nem no navegador.
//
// Regras aplicadas (conforme combinado):
// - date_of_birth nulo -> jogador ignorado (não entra no elenco.json)
// - availability "injured" -> marcado como lesionado no app
// - qualquer outro availability (available, suspended, etc.) -> sem marcação
// - jersey_number -> número do jogador

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
  const candidates = ["results", "data", "squad", "players", "player"];
  for (const key of candidates) {
    if (raw && Array.isArray(raw[key])) return raw[key];
  }
  return null;
}

async function main() {
  const res = await fetch(`https://sports.bzzoiro.com/api/v2/teams/${TEAM_ID}/squad/`, {
    headers: { Authorization: `Token ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `API respondeu ${res.status} ${res.statusText}` + (body ? ` — ${body.slice(0, 300)}` : "")
    );
  }
  const raw = await res.json();
  const list = extractList(raw);

  if (!list) {
    const keys = raw && typeof raw === "object" ? Object.keys(raw).join(", ") : typeof raw;
    throw new Error(
      `Não achei a lista de jogadores na resposta. Formato recebido tem as chaves: [${keys}]`
    );
  }

  const player = list
    .filter((p) => !!p.date_of_birth) // ignora quem não tem data de nascimento
    .map((p) => ({
      name: p.short_name || p.name,
      number: p.jersey_number != null ? String(p.jersey_number) : "00",
      position: POSITION_MAP[p.position] || p.position,
      injured: p.availability === "injured",
    }));

  console.log(`Elenco: ${player.length} jogadores (de ${list.length} recebidos da API).`);

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/elenco.json", JSON.stringify({ player }, null, 2));
  console.log("Salvo em data/elenco.json");
}

main().catch((err) => {
  console.error("Falhou:", err.message);
  process.exit(1);
});
