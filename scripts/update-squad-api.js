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

import fs from "fs";

const TEAM_ID = 155; // Atlético-MG
const TOKEN = process.env.BZZOIRO_TOKEN;

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

async function main() {
  const res = await fetch(`https://sports.bzzoiro.com/api/v2/teams/${TEAM_ID}/squad/`, {
    headers: { Authorization: `Token ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`API respondeu ${res.status} ${res.statusText}`);
  }
  const raw = await res.json();

  const player = raw
    .filter((p) => !!p.date_of_birth) // ignora quem não tem data de nascimento
    .map((p) => ({
      name: p.short_name || p.name,
      number: p.jersey_number != null ? String(p.jersey_number) : "00",
      position: POSITION_MAP[p.position] || p.position,
      injured: p.availability === "injured",
    }));

  console.log(`Elenco: ${player.length} jogadores (de ${raw.length} recebidos da API).`);

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/elenco.json", JSON.stringify({ player }, null, 2));
  console.log("Salvo em data/elenco.json");
}

main().catch((err) => {
  console.error("Falhou:", err.message);
  process.exit(1);
});
