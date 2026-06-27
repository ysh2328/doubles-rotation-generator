const sampleNames = [
  "Alex", "Blair", "Casey", "Drew", "Emery", "Finley",
  "Gray", "Harper"
];

const els = {
  players: document.getElementById("playersInput"),
  rounds: document.getElementById("roundsInput"),
  courts: document.getElementById("courtsInput"),
  sample: document.getElementById("sampleBtn"),
  generate: document.getElementById("generateBtn"),
  copy: document.getElementById("copyBtn"),
  csv: document.getElementById("csvBtn"),
  print: document.getElementById("printBtn"),
  status: document.getElementById("statusBox"),
  qualityText: document.getElementById("qualityText"),
  qualityBadge: document.getElementById("qualityBadge"),
  summary: document.getElementById("summaryGrid"),
  schedule: document.getElementById("scheduleView"),
  stats: document.getElementById("statsView"),
  scheduleTab: document.getElementById("scheduleTab"),
  statsTab: document.getElementById("statsTab")
};

let currentResult = null;

function parsePlayers(text) {
  const seen = new Set();
  return text
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function pairKey(a, b) {
  return [a, b].sort().join("|||");
}

function getPriorityWeights(priority) {
  if (priority === "partners") {
    return { partner: 34, opponent: 16, bye: 24, game: 12, repeatRound: 8 };
  }
  if (priority === "opponents") {
    return { partner: 18, opponent: 32, bye: 24, game: 12, repeatRound: 8 };
  }
  return { partner: 26, opponent: 24, bye: 24, game: 12, repeatRound: 8 };
}

function cloneCounts(source) {
  return new Map(source);
}

function countGet(map, key) {
  return map.get(key) || 0;
}

function addCount(map, key, amount = 1) {
  map.set(key, countGet(map, key) + amount);
}

function combinations(items, size) {
  const result = [];
  const combo = [];

  function walk(start) {
    if (combo.length === size) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i <= items.length - (size - combo.length); i += 1) {
      combo.push(items[i]);
      walk(i + 1);
      combo.pop();
    }
  }

  walk(0);
  return result;
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chooseByes(players, byeCount, gameCounts) {
  if (byeCount <= 0) return [];
  return players
    .slice()
    .sort((a, b) => {
      const byes = countGet(byeCount, b) - countGet(byeCount, a);
      if (byes !== 0) return byes;
      const games = countGet(gameCounts, b) - countGet(gameCounts, a);
      if (games !== 0) return games;
      return Math.random() - 0.5;
    })
    .slice(0, players.length % 4);
}

function pairingsForFour(group) {
  const [a, b, c, d] = group;
  return [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] }
  ];
}

function scorePairing(pairing, state, weights, roundPlayers) {
  const [a, b] = pairing.teamA;
  const [c, d] = pairing.teamB;
  const partnerPairs = [pairKey(a, b), pairKey(c, d)];
  const opponentPairs = [
    pairKey(a, c), pairKey(a, d), pairKey(b, c), pairKey(b, d)
  ];
  let score = 0;

  for (const key of partnerPairs) {
    const repeat = countGet(state.partnerCounts, key);
    score += repeat * repeat * weights.partner + repeat * 4;
  }

  for (const key of opponentPairs) {
    const repeat = countGet(state.opponentCounts, key);
    score += repeat * repeat * weights.opponent + repeat * 2;
  }

  for (const name of [a, b, c, d]) {
    score += countGet(state.gameCounts, name) * weights.game;
    if (roundPlayers.has(name)) score += weights.repeatRound * 100;
  }

  return score + Math.random();
}

function applyGame(pairing, state) {
  const [a, b] = pairing.teamA;
  const [c, d] = pairing.teamB;
  addCount(state.partnerCounts, pairKey(a, b));
  addCount(state.partnerCounts, pairKey(c, d));
  for (const key of [pairKey(a, c), pairKey(a, d), pairKey(b, c), pairKey(b, d)]) {
    addCount(state.opponentCounts, key);
  }
  for (const name of [a, b, c, d]) {
    addCount(state.gameCounts, name);
  }
}

function buildOneSchedule(players, roundCount, courtCount, priority) {
  const weights = getPriorityWeights(priority);
  const state = {
    partnerCounts: new Map(),
    opponentCounts: new Map(),
    byeCounts: new Map(),
    gameCounts: new Map()
  };
  const rounds = [];
  const maxGames = Math.min(courtCount, Math.floor(players.length / 4));
  const slotsPerRound = maxGames * 4;

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    let available = shuffle(players);
    const fixedByeCount = Math.max(0, players.length - slotsPerRound);
    const byes = available
      .slice()
      .sort((a, b) => {
        const byeDiff = countGet(state.byeCounts, a) - countGet(state.byeCounts, b);
        if (byeDiff !== 0) return byeDiff;
        const gameDiff = countGet(state.gameCounts, b) - countGet(state.gameCounts, a);
        if (gameDiff !== 0) return gameDiff;
        return Math.random() - 0.5;
      })
      .slice(0, fixedByeCount);

    for (const bye of byes) addCount(state.byeCounts, bye);
    const byeSet = new Set(byes);
    available = available.filter((name) => !byeSet.has(name));

    const games = [];
    const roundPlayers = new Set();
    for (let court = 1; court <= maxGames; court += 1) {
      const combos = combinations(available, 4);
      let best = null;

      for (const group of combos) {
        for (const pairing of pairingsForFour(group)) {
          const score = scorePairing(pairing, state, weights, roundPlayers);
          if (!best || score < best.score) {
            best = { pairing, group, score };
          }
        }
      }

      if (!best) break;
      applyGame(best.pairing, state);
      best.group.forEach((name) => roundPlayers.add(name));
      available = available.filter((name) => !roundPlayers.has(name));
      games.push({
        court,
        teamA: best.pairing.teamA,
        teamB: best.pairing.teamB
      });
    }

    rounds.push({ number: roundIndex + 1, byes, games });
  }

  return {
    players,
    rounds,
    stats: summarize(players, rounds, state),
    state
  };
}

function summarize(players, rounds, state) {
  const partnerRepeats = Array.from(state.partnerCounts.values()).filter((count) => count > 1);
  const opponentRepeats = Array.from(state.opponentCounts.values()).filter((count) => count > 1);
  const gameValues = players.map((name) => countGet(state.gameCounts, name));
  const byeValues = players.map((name) => countGet(state.byeCounts, name));
  const maxGames = Math.max(...gameValues);
  const minGames = Math.min(...gameValues);
  const maxByes = Math.max(...byeValues);
  const minByes = Math.min(...byeValues);
  const score = (
    partnerRepeats.reduce((sum, count) => sum + (count - 1) * 18, 0) +
    opponentRepeats.reduce((sum, count) => sum + (count - 1) * 10, 0) +
    (maxGames - minGames) * 22 +
    (maxByes - minByes) * 18
  );

  return {
    rounds: rounds.length,
    games: rounds.reduce((sum, round) => sum + round.games.length, 0),
    partnerRepeatPairs: partnerRepeats.length,
    opponentRepeatPairs: opponentRepeats.length,
    maxPartnerRepeat: partnerRepeats.length ? Math.max(...partnerRepeats) : 1,
    maxOpponentRepeat: opponentRepeats.length ? Math.max(...opponentRepeats) : 1,
    minGames,
    maxGames,
    minByes,
    maxByes,
    score
  };
}

function findBestSchedule(players, rounds, courts, attempts, priority) {
  let best = null;
  for (let i = 0; i < attempts; i += 1) {
    const result = buildOneSchedule(players, rounds, courts, priority);
    if (!best || result.stats.score < best.stats.score) {
      best = result;
    }
  }
  return best;
}

function getPriority() {
  return document.querySelector('input[name="priority"]:checked').value;
}

function getAttemptBudget(players, rounds, courts) {
  const size = players.length * Math.max(1, rounds) * Math.max(1, courts);
  if (size <= 80) return 180;
  if (size <= 180) return 120;
  return 70;
}

function generate() {
  const players = parsePlayers(els.players.value);
  const rounds = Number(els.rounds.value);
  const courts = Number(els.courts.value);
  const priority = getPriority();
  const attempts = getAttemptBudget(players, rounds, courts);

  if (players.length < 4) {
    setStatus("Add at least 4 players.", "bad");
    return;
  }
  if (rounds < 1 || courts < 1) {
    setStatus("Rounds and courts must be at least 1.", "bad");
    return;
  }

  currentResult = findBestSchedule(players, rounds, courts, attempts, priority);
  render(currentResult);
  setStatus(getScheduleMessage(players.length, courts), "ok");
}

function getScheduleMessage(playerCount, requestedCourts) {
  const usableCourts = Math.min(requestedCourts, Math.floor(playerCount / 4));
  const byesPerRound = Math.max(0, playerCount - usableCourts * 4);
  const courtText = usableCourts === 1 ? "1 court" : `${usableCourts} courts`;

  if (byesPerRound > 0) {
    const playerText = byesPerRound === 1 ? "1 player" : `${byesPerRound} players`;
    const verb = byesPerRound === 1 ? "sits" : "sit";
    const byeText = byesPerRound === 1 ? "the bye rotates automatically" : "byes rotate automatically";
    return `Schedule ready. Using ${courtText}; ${playerText} ${verb} out each round, and ${byeText}.`;
  }

  if (usableCourts < requestedCourts) {
    return `Schedule ready. Using ${courtText}; add more players to fill more courts.`;
  }

  return "Schedule ready. Review the repeats, then copy, export, or print.";
}

function setStatus(text, tone) {
  els.status.textContent = text;
  els.status.style.color = tone === "bad" ? "var(--bad)" : tone === "ok" ? "var(--ok)" : "";
}

function render(result) {
  renderSummary(result);
  renderQuality(result);
  renderSchedule(result);
  renderStats(result);
}

function renderSummary(result) {
  const stats = result.stats;
  const byeLabel = stats.minByes === stats.maxByes ? stats.maxByes : `${stats.minByes}-${stats.maxByes}`;
  els.summary.innerHTML = [
    metric(stats.rounds, "Rounds"),
    metric(`${stats.minGames}-${stats.maxGames}`, "Games per player"),
    metric(byeLabel, "Byes per player"),
    metric(stats.partnerRepeatPairs, "Repeated partners")
  ].join("");
}

function renderQuality(result) {
  const stats = result.stats;
  const repeatTotal = stats.partnerRepeatPairs + stats.opponentRepeatPairs;
  const balanceIssue = (stats.maxGames - stats.minGames) + (stats.maxByes - stats.minByes);
  let label = "Good";
  let tone = "good";
  let text = "Balanced schedule with low repeat pressure.";

  if (repeatTotal > result.players.length || balanceIssue > 1) {
    label = "Check";
    tone = "warn";
    text = "Some repeats are unavoidable with this player, court, and round count.";
  }
  if (stats.maxPartnerRepeat > 2 || stats.maxOpponentRepeat > 3) {
    label = "Crowded";
    tone = "bad";
    text = "This setup creates heavy repeats. Try fewer rounds or more players.";
  }

  els.qualityText.textContent = text;
  els.qualityBadge.textContent = label;
  els.qualityBadge.className = `quality-badge ${tone}`;
}

function metric(value, label) {
  return `<div class="metric"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderSchedule(result) {
  els.schedule.innerHTML = result.rounds.map((round) => {
    const byeText = round.byes.length ? `Byes: ${round.byes.map(escapeHtml).join(", ")}` : "No byes";
    const rows = round.games.map((game) => `
      <tr>
        <td>${game.court}</td>
        <td><span class="team">${escapeHtml(game.teamA.join(" / "))}</span></td>
        <td><span class="team">${escapeHtml(game.teamB.join(" / "))}</span></td>
      </tr>
    `).join("");
    return `
      <article class="round-card">
        <header class="round-head">
          <span class="round-title">Round ${round.number}</span>
          <span class="bye-line">${byeText}</span>
        </header>
        <table class="games-table">
          <thead><tr><th>Court</th><th>Team A</th><th>Team B</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </article>
    `;
  }).join("");
}

function renderStats(result) {
  const playerRows = result.players.map((name) => {
    const games = countGet(result.state.gameCounts, name);
    const byes = countGet(result.state.byeCounts, name);
    return `<tr><td>${escapeHtml(name)}</td><td>${games}</td><td>${byes}</td></tr>`;
  }).join("");

  const repeatPartnerRows = renderPairCounts(result.state.partnerCounts, "No repeated partners.");
  const repeatOpponentRows = renderPairCounts(result.state.opponentCounts, "No repeated opponents.");

  els.stats.innerHTML = `
    <article class="round-card">
      <header class="round-head"><span class="round-title">Player balance</span></header>
      <table class="stats-table">
        <thead><tr><th>Player</th><th>Games</th><th>Byes</th></tr></thead>
        <tbody>${playerRows}</tbody>
      </table>
    </article>
    <article class="round-card">
      <header class="round-head"><span class="round-title">Repeated partners</span></header>
      ${repeatPartnerRows}
    </article>
    <article class="round-card">
      <header class="round-head"><span class="round-title">Repeated opponents</span></header>
      ${repeatOpponentRows}
    </article>
  `;
}

function renderPairCounts(map, emptyText) {
  const rows = Array.from(map.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => {
      const names = key.split("|||").join(" / ");
      return `<tr><td>${escapeHtml(names)}</td><td class="${count > 2 ? "flag-bad" : ""}">${count}</td></tr>`;
    })
    .join("");

  if (!rows) {
    return `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
  }
  return `
    <table class="stats-table">
      <thead><tr><th>Pair</th><th>Count</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function scheduleToText(result) {
  return result.rounds.map((round) => {
    const lines = [`Round ${round.number}`];
    for (const game of round.games) {
      lines.push(`Court ${game.court}: ${game.teamA.join(" / ")} vs ${game.teamB.join(" / ")}`);
    }
    if (round.byes.length) lines.push(`Byes: ${round.byes.join(", ")}`);
    return lines.join("\n");
  }).join("\n\n");
}

function scheduleToCsv(result) {
  const rows = [["Round", "Court", "Team A Player 1", "Team A Player 2", "Team B Player 1", "Team B Player 2", "Byes"]];
  for (const round of result.rounds) {
    const byes = round.byes.join("; ");
    for (const game of round.games) {
      rows.push([round.number, game.court, game.teamA[0], game.teamA[1], game.teamB[0], game.teamB[1], byes]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

async function copySchedule() {
  if (!currentResult) generate();
  if (!currentResult) return;
  const text = scheduleToText(currentResult);

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      setStatus("Schedule copied as plain text.", "ok");
      return;
    }
  } catch (error) {
    // Fall through to the legacy copy path below.
  }

  if (copyTextFallback(text)) {
    setStatus("Schedule copied as plain text.", "ok");
    return;
  }

  setStatus("Copy was blocked by this browser. Use CSV or Print instead.", "bad");
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (error) {
    copied = false;
  }

  document.body.removeChild(textarea);
  return copied;
}

function downloadCsv() {
  if (!currentResult) generate();
  if (!currentResult) return;
  const blob = new Blob([scheduleToCsv(currentResult)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "doubles-rotation-schedule.csv";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("CSV downloaded.", "ok");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showTab(name) {
  const isStats = name === "stats";
  els.stats.hidden = !isStats;
  els.schedule.hidden = isStats;
  els.statsTab.classList.toggle("is-active", isStats);
  els.scheduleTab.classList.toggle("is-active", !isStats);
}

els.sample.addEventListener("click", () => {
  els.players.value = sampleNames.join("\n");
  generate();
});
els.generate.addEventListener("click", generate);
els.copy.addEventListener("click", copySchedule);
els.csv.addEventListener("click", downloadCsv);
els.print.addEventListener("click", () => window.print());
els.scheduleTab.addEventListener("click", () => showTab("schedule"));
els.statsTab.addEventListener("click", () => showTab("stats"));

generate();
