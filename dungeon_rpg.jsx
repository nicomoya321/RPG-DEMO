import { useState, useEffect, useRef } from "react";

const CLASSES = [
  {
    id: "warrior",
    name: "Guerrero",
    icon: "⚔️",
    desc: "Fuerza bruta y escudo de acero",
    color: "#c0392b",
    stats: { hp: 120, mp: 30, atk: 15, def: 12 },
  },
  {
    id: "mage",
    name: "Mago",
    icon: "🔮",
    desc: "Domina los secretos del Arcano",
    color: "#8e44ad",
    stats: { hp: 70, mp: 100, atk: 20, def: 5 },
  },
  {
    id: "rogue",
    name: "Ladrón",
    icon: "🗡️",
    desc: "Sombras, sigilo y veneno",
    color: "#27ae60",
    stats: { hp: 90, mp: 50, atk: 18, def: 8 },
  },
];

const initialGameState = (name, cls) => ({
  name,
  class: cls,
  hp: cls.stats.hp,
  maxHp: cls.stats.hp,
  mp: cls.stats.mp,
  maxMp: cls.stats.mp,
  gold: 10,
  xp: 0,
  level: 1,
  turn: 0,
  history: [],
});

function StatBar({ value, max, color, label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#b8a88a", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: "#e8d5a3" }}>{value}/{max}</span>
      </div>
      <div style={{ height: 6, background: "#1a1008", borderRadius: 3, overflow: "hidden", border: "1px solid #3d2e0e" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function FloatingText({ text, type }) {
  const color = type === "damage" ? "#e74c3c" : type === "heal" ? "#2ecc71" : type === "gold" ? "#f1c40f" : "#9b59b6";
  return (
    <div style={{
      position: "absolute", top: 0, right: 16, fontSize: 18, fontWeight: 700,
      color, fontFamily: "'Cinzel', serif", animation: "floatUp 1.5s ease forwards", pointerEvents: "none",
    }}>
      {text}
    </div>
  );
}

export default function DungeonRPG() {
  const [phase, setPhase] = useState("intro"); // intro | create | game | gameover
  const [playerName, setPlayerName] = useState("");
  const [selectedClass, setSelectedClass] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [story, setStory] = useState("");
  const [choices, setChoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [floats, setFloats] = useState([]);
  const [history, setHistory] = useState([]);
  const storyRef = useRef(null);
  const floatId = useRef(0);

  const addFloat = (text, type) => {
    const id = floatId.current++;
    setFloats(f => [...f, { id, text, type }]);
    setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1600);
  };

  const callClaude = async (gs, choiceText = null) => {
    setLoading(true);
    setChoices([]);

    const sysPrompt = `Eres un Dungeon Master oscuro y literario para un RPG de fantasía medieval. Narras en ESPAÑOL con prosa evocadora y dramática.
El jugador es ${gs.name}, un ${gs.class.name} (HP: ${gs.hp}/${gs.maxHp}, Oro: ${gs.gold}, Nivel: ${gs.level}, Turno: ${gs.turn}).

REGLAS:
- Narra entre 60-100 palabras, oscuro y atmosférico.
- Da exactamente 3 opciones de acción, variadas (combate, ingenio, exploración).
- Varía los eventos: combate, hallazgos, NPCs, trampas, tesoros, misterios.
- En turnos de combate puedes herir al jugador (-5 a -25 HP) o darlo por muerto si HP <= 0.
- Recompensas: oro (+1 a +20), XP (+5 a +30), curaciones (+5 a +20 HP).
- Responde SOLO con JSON válido, sin markdown, sin explicaciones.

FORMATO JSON:
{
  "narration": "texto narrativo aquí",
  "choices": [
    {"id": 1, "text": "texto de opción", "risk": "bajo"},
    {"id": 2, "text": "texto de opción", "risk": "medio"},
    {"id": 3, "text": "texto de opción", "risk": "alto"}
  ],
  "effects": {
    "hp_change": 0,
    "gold_change": 0,
    "xp_gain": 10,
    "event": "exploration"
  }
}`;

    const msgs = [];
    if (gs.turn === 0) {
      msgs.push({ role: "user", content: "Comienza la aventura con una escena de apertura dramática en una taberna oscura o en las puertas de una mazmorra." });
    } else {
      msgs.push({ role: "user", content: `El héroe elige: "${choiceText}". Continúa la historia con consecuencias de esa elección.` });
    }

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: sysPrompt,
          messages: msgs,
        }),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "{}";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      const eff = parsed.effects || {};
      let newGs = { ...gs, turn: gs.turn + 1 };

      if (eff.hp_change) {
        newGs.hp = Math.min(newGs.maxHp, Math.max(0, newGs.hp + eff.hp_change));
        if (eff.hp_change < 0) addFloat(`${eff.hp_change} HP`, "damage");
        else addFloat(`+${eff.hp_change} HP`, "heal");
      }
      if (eff.gold_change) {
        newGs.gold = Math.max(0, newGs.gold + eff.gold_change);
        if (eff.gold_change > 0) addFloat(`+${eff.gold_change} ORO`, "gold");
      }
      if (eff.xp_gain) {
        newGs.xp += eff.xp_gain;
        if (newGs.xp >= newGs.level * 50) {
          newGs.level += 1;
          newGs.maxHp += 10;
          newGs.hp = newGs.maxHp;
          addFloat("⬆ NIVEL UP!", "xp");
        }
      }

      setGameState(newGs);
      const entry = { narration: parsed.narration, choice: choiceText };
      setHistory(h => [...h, entry]);
      setStory(parsed.narration || "");
      setChoices(parsed.choices || []);

      if (newGs.hp <= 0) {
        setTimeout(() => setPhase("gameover"), 2000);
      }
    } catch (e) {
      setStory("Las sombras murmuran algo ininteligible... (Error al contactar al Dungeon Master)");
      setChoices([{ id: 1, text: "Intentar de nuevo", risk: "bajo" }]);
    }
    setLoading(false);
    setTimeout(() => storyRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const startGame = () => {
    if (!playerName.trim() || !selectedClass) return;
    const cls = CLASSES.find(c => c.id === selectedClass);
    const gs = initialGameState(playerName.trim(), cls);
    setGameState(gs);
    setPhase("game");
    callClaude(gs);
  };

  const handleChoice = (choice) => {
    if (loading || !gameState) return;
    callClaude(gameState, choice.text);
  };

  const riskColor = (r) => r === "alto" ? "#e74c3c" : r === "medio" ? "#f39c12" : "#2ecc71";
  const riskLabel = (r) => r === "alto" ? "RIESGOSO" : r === "medio" ? "MODERADO" : "SEGURO";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&display=swap');
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-60px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%,100% { opacity: 1; } 50% { opacity: 0.5; }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .choice-btn:hover { background: #2a1e06 !important; border-color: #c9a84c !important; transform: translateX(4px); }
        .class-card:hover { border-color: #c9a84c !important; background: #1a1208 !important; }
        .class-card.selected { border-color: #c9a84c !important; background: #1e1508 !important; }
        .start-btn:hover { background: #b8972a !important; }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ fontFamily: "'IM Fell English', serif", minHeight: "100vh", background: "#0d0a04", color: "#e8d5a3", padding: 0 }}>

        {/* INTRO */}
        {phase === "intro" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", textAlign: "center", padding: "2rem", animation: "fadeIn 1s ease" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>⚔️</div>
            <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: 42, color: "#c9a84c", margin: "0 0 8px", letterSpacing: 4, textShadow: "0 0 30px rgba(201,168,76,0.4)" }}>
              DUNGEON AI
            </h1>
            <p style={{ fontSize: 18, color: "#8b7355", marginBottom: 8, fontStyle: "italic" }}>
              Powered by Claude Sonnet
            </p>
            <div style={{ width: 60, height: 2, background: "#c9a84c", margin: "16px auto 24px" }} />
            <p style={{ maxWidth: 480, color: "#b8a88a", lineHeight: 1.8, marginBottom: 40, fontSize: 17 }}>
              Adéntrate en mazmorras generadas por inteligencia artificial. Cada decisión moldea tu destino. Ninguna historia se repite.
            </p>
            <button className="start-btn" onClick={() => setPhase("create")} style={{
              fontFamily: "'Cinzel', serif", fontSize: 16, letterSpacing: 3, padding: "14px 40px",
              background: "#c9a84c", color: "#0d0a04", border: "none", cursor: "pointer",
              textTransform: "uppercase", fontWeight: 700, borderRadius: 2, transition: "background 0.2s",
            }}>
              Comenzar Aventura
            </button>
          </div>
        )}

        {/* CHARACTER CREATION */}
        {phase === "create" && (
          <div style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.5rem", animation: "fadeIn 0.5s ease" }}>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: 28, color: "#c9a84c", textAlign: "center", letterSpacing: 3, marginBottom: 8 }}>
              CREA TU HÉROE
            </h2>
            <div style={{ width: 40, height: 2, background: "#c9a84c", margin: "0 auto 32px" }} />

            <div style={{ marginBottom: 32 }}>
              <label style={{ display: "block", fontSize: 12, letterSpacing: 3, color: "#8b7355", marginBottom: 10, textTransform: "uppercase" }}>
                Nombre del Héroe
              </label>
              <input
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                placeholder="Ingresa tu nombre..."
                style={{
                  width: "100%", padding: "12px 16px", background: "#1a1208",
                  border: "1px solid #3d2e0e", color: "#e8d5a3", fontSize: 18,
                  fontFamily: "'IM Fell English', serif", borderRadius: 2, outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: 40 }}>
              <label style={{ display: "block", fontSize: 12, letterSpacing: 3, color: "#8b7355", marginBottom: 12, textTransform: "uppercase" }}>
                Clase
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {CLASSES.map(cls => (
                  <div
                    key={cls.id}
                    className={`class-card ${selectedClass === cls.id ? "selected" : ""}`}
                    onClick={() => setSelectedClass(cls.id)}
                    style={{
                      border: `1px solid ${selectedClass === cls.id ? "#c9a84c" : "#3d2e0e"}`,
                      background: selectedClass === cls.id ? "#1e1508" : "#110e04",
                      borderRadius: 4, padding: "16px 12px", cursor: "pointer", textAlign: "center",
                      transition: "all 0.2s",
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{cls.icon}</div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: cls.color, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>
                      {cls.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#8b7355", lineHeight: 1.4, marginBottom: 10 }}>{cls.desc}</div>
                    <div style={{ fontSize: 11, color: "#6b5a3e" }}>
                      HP {cls.stats.hp} · MP {cls.stats.mp}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setPhase("intro")} style={{
                flex: 1, padding: "12px", background: "transparent", border: "1px solid #3d2e0e",
                color: "#8b7355", fontFamily: "'Cinzel', serif", fontSize: 13, cursor: "pointer",
                letterSpacing: 2, borderRadius: 2,
              }}>
                ← Volver
              </button>
              <button
                className="start-btn"
                onClick={startGame}
                disabled={!playerName.trim() || !selectedClass}
                style={{
                  flex: 2, padding: "12px", background: playerName.trim() && selectedClass ? "#c9a84c" : "#3d2e0e",
                  border: "none", color: playerName.trim() && selectedClass ? "#0d0a04" : "#6b5a3e",
                  fontFamily: "'Cinzel', serif", fontSize: 14, cursor: playerName.trim() && selectedClass ? "pointer" : "not-allowed",
                  letterSpacing: 3, fontWeight: 700, borderRadius: 2, transition: "background 0.2s",
                }}
              >
                COMENZAR →
              </button>
            </div>
          </div>
        )}

        {/* GAME */}
        {phase === "game" && gameState && (
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.5rem", display: "grid", gridTemplateColumns: "200px 1fr", gap: 16, minHeight: "100vh" }}>

            {/* SIDEBAR STATS */}
            <div style={{ position: "sticky", top: 16, alignSelf: "start" }}>
              <div style={{ background: "#110e04", border: "1px solid #3d2e0e", borderRadius: 4, padding: 16 }}>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 36 }}>{gameState.class.icon}</div>
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: "#c9a84c", marginTop: 6 }}>{gameState.name}</div>
                  <div style={{ fontSize: 11, color: "#8b7355", letterSpacing: 2 }}>{gameState.class.name.toUpperCase()}</div>
                </div>

                <div style={{ borderTop: "1px solid #2a1e06", paddingTop: 12, marginBottom: 12 }}>
                  <StatBar value={gameState.hp} max={gameState.maxHp} color="#c0392b" label="Vida" />
                  <StatBar value={gameState.mp} max={gameState.maxMp} color="#8e44ad" label="Maná" />
                  <StatBar value={gameState.xp % (gameState.level * 50)} max={gameState.level * 50} color="#27ae60" label="XP" />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { label: "Nivel", value: gameState.level, icon: "⬆" },
                    { label: "Oro", value: gameState.gold, icon: "◆" },
                    { label: "Turno", value: gameState.turn, icon: "↺" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "#1a1208", borderRadius: 3, padding: "8px 10px", textAlign: "center", border: "1px solid #2a1e06" }}>
                      <div style={{ fontSize: 10, color: "#6b5a3e", letterSpacing: 1 }}>{s.label.toUpperCase()}</div>
                      <div style={{ fontSize: 18, color: "#c9a84c", fontFamily: "'Cinzel', serif", fontWeight: 700 }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                <button onClick={() => { setPhase("intro"); setGameState(null); setHistory([]); setStory(""); setChoices([]); }}
                  style={{ marginTop: 16, width: "100%", padding: "8px", background: "transparent", border: "1px solid #3d2e0e", color: "#6b5a3e", fontSize: 11, cursor: "pointer", fontFamily: "'Cinzel', serif", letterSpacing: 2, borderRadius: 2 }}>
                  ABANDONAR
                </button>
              </div>
            </div>

            {/* MAIN CONTENT */}
            <div>
              {/* History log */}
              {history.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  {history.slice(-3, -1).map((h, i) => (
                    <div key={i} style={{ background: "#0d0a04", border: "1px solid #1a1208", borderRadius: 4, padding: "12px 16px", marginBottom: 8, opacity: 0.5 }}>
                      {h.choice && <div style={{ fontSize: 12, color: "#8b7355", fontStyle: "italic", marginBottom: 4 }}>→ {h.choice}</div>}
                      <p style={{ margin: 0, fontSize: 14, color: "#8b7355", lineHeight: 1.6 }}>{h.narration}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Current story */}
              <div ref={storyRef} style={{ background: "#110e04", border: "1px solid #3d2e0e", borderRadius: 4, padding: "24px", marginBottom: 16, position: "relative", animation: "fadeIn 0.5s ease" }}>
                {floats.map(f => <FloatingText key={f.id} text={f.text} type={f.type} />)}

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid #2a1e06" }}>
                  <span style={{ fontSize: 10, letterSpacing: 3, color: "#c9a84c", textTransform: "uppercase" }}>
                    ⚔ Capítulo {gameState.turn}
                  </span>
                </div>

                {loading ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <div style={{ fontSize: 28, animation: "pulse 1.2s infinite" }}>🔮</div>
                    <p style={{ color: "#8b7355", fontStyle: "italic", marginTop: 12 }}>El Dungeon Master teje tu destino...</p>
                  </div>
                ) : (
                  <p style={{ margin: 0, lineHeight: 1.9, fontSize: 17, color: "#d4c4a0", fontStyle: "italic" }}>{story}</p>
                )}
              </div>

              {/* Choices */}
              {!loading && choices.length > 0 && (
                <div style={{ animation: "fadeIn 0.5s ease 0.3s both" }}>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: "#6b5a3e", marginBottom: 10, textTransform: "uppercase" }}>
                    ¿Qué harás?
                  </div>
                  {choices.map((ch, i) => (
                    <button
                      key={ch.id}
                      className="choice-btn"
                      onClick={() => handleChoice(ch)}
                      style={{
                        width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 12, padding: "14px 16px", background: "#0d0a04", border: "1px solid #2a1e06",
                        color: "#e8d5a3", cursor: "pointer", borderRadius: 3, marginBottom: 8,
                        fontFamily: "'IM Fell English', serif", fontSize: 16, transition: "all 0.2s",
                      }}
                    >
                      <span>
                        <span style={{ color: "#c9a84c", marginRight: 10, fontFamily: "'Cinzel', serif", fontSize: 13 }}>{i + 1}.</span>
                        {ch.text}
                      </span>
                      <span style={{
                        fontSize: 9, letterSpacing: 2, padding: "3px 8px",
                        border: `1px solid ${riskColor(ch.risk)}`, color: riskColor(ch.risk),
                        borderRadius: 2, whiteSpace: "nowrap", flexShrink: 0,
                      }}>
                        {riskLabel(ch.risk)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* GAME OVER */}
        {phase === "gameover" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", textAlign: "center", padding: "2rem", animation: "fadeIn 1s ease" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>💀</div>
            <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: 36, color: "#c0392b", letterSpacing: 4, marginBottom: 8 }}>HAS CAÍDO</h1>
            <p style={{ color: "#8b7355", fontStyle: "italic", maxWidth: 400, lineHeight: 1.8, marginBottom: 8 }}>
              {gameState?.name} llegó hasta el turno {gameState?.turn} con {gameState?.gold} monedas de oro y nivel {gameState?.level}.
            </p>
            <p style={{ color: "#6b5a3e", marginBottom: 32 }}>Las sombras reclaman otra alma.</p>
            <button className="start-btn" onClick={() => { setPhase("intro"); setGameState(null); setHistory([]); setStory(""); setChoices([]); }}
              style={{ fontFamily: "'Cinzel', serif", fontSize: 14, letterSpacing: 3, padding: "12px 32px", background: "#c9a84c", color: "#0d0a04", border: "none", cursor: "pointer", textTransform: "uppercase", fontWeight: 700, borderRadius: 2 }}>
              Nueva Partida
            </button>
          </div>
        )}
      </div>
    </>
  );
}
