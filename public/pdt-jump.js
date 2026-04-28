(() => {
  const PLAYER_KEY = "pdt_jump_player_v1";

  const DEVICE_KEY = "pdt_jump_device_id_v1";
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(DEVICE_KEY, deviceId);
  }


  const startPanel = document.getElementById("pdtStartPanel");
  const endPanel = document.getElementById("pdtEndPanel");
  const startBtn = document.getElementById("pdtStartBtn");
  const restartBtn = document.getElementById("pdtRestartBtn");
  const shareBtn = document.getElementById("pdtShareBtn");
  const errorBox = document.getElementById("pdtStartError");
  const nicknameInput = document.getElementById("pdtNickname");
  const rioneSelect = document.getElementById("pdtRione");
  const playerForm = document.getElementById("pdtPlayerForm");
  const lockedBox = document.getElementById("pdtLockedPlayer");
  const introText = document.getElementById("pdtIntroText");

  const overlay = document.getElementById("pdtGameOverlay");
  const canvas = document.getElementById("pdtCanvas");
  const ctx = canvas.getContext("2d");
  const frogImage = new Image();
  frogImage.src = "/rana.webp";

  // Evita selezione dello schermo / evidenziazioni durante i tap ripetuti.
  document.addEventListener("selectstart", (e) => {
    if (overlay && overlay.style.display === "block") e.preventDefault();
  });
  document.addEventListener("contextmenu", (e) => {
    if (overlay && overlay.style.display === "block") e.preventDefault();
  });
  document.addEventListener("touchmove", (e) => {
    if (overlay && overlay.style.display === "block") e.preventDefault();
  }, { passive: false });



  function blockGameTouchActions(e) {
    if (overlay && overlay.style.display === "block") {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }

  ["touchstart", "touchend", "touchcancel", "gesturestart", "gesturechange", "gestureend"].forEach((eventName) => {
    document.addEventListener(eventName, blockGameTouchActions, { passive: false, capture: true });
  });

  if (overlay) {
    overlay.addEventListener("contextmenu", blockGameTouchActions, { passive: false, capture: true });
    overlay.addEventListener("selectstart", blockGameTouchActions, { passive: false, capture: true });
    overlay.addEventListener("dragstart", blockGameTouchActions, { passive: false, capture: true });
  }


  const scoreEl = document.getElementById("pdtScore");
  const coinsEl = document.getElementById("pdtCoins");
  const leaderboardEl = document.getElementById("pdtLeaderboard");
  const finalText = document.getElementById("pdtFinalText");

  let nickname = "";
  let rione = "";
  let running = false;
  let gameOver = false;
  let score = 0;
  let coins = 0;
  let cameraY = 0;
  let lastTime = 0;
  let platforms = [];
  let coinItems = [];
  let rockets = [];
  let targetX = null;
  let highest = 0;
  let boostTime = 0;
  let lastRocketScore = 0;

  const frog = {
    x: 210,
    y: 560,
    w: 48,
    h: 46,
    vx: 0,
    vy: 0
  };

  function loadLockedPlayer() {
    try {
      const saved = JSON.parse(localStorage.getItem(PLAYER_KEY) || "null");
      if (saved && saved.nickname && saved.rione) {
        nickname = saved.nickname;
        rione = saved.rione;
        playerForm.style.display = "none";
        lockedBox.style.display = "block";
        lockedBox.innerHTML = `Giocatore registrato<br><strong>${escapeHtml(nickname)}</strong> · <strong>${escapeHtml(rione)}</strong>`;
        introText.textContent = "Nickname e rione sono già salvati su questo dispositivo.";
        startBtn.textContent = "GIOCA";
      }
    } catch (e) { alert('Errore salvataggio punteggio. Riprova o segnala agli organizzatori.'); }
  }

  function saveLockedPlayer() {
    localStorage.setItem(PLAYER_KEY, JSON.stringify({ nickname, rione }));
  }

  function setupCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function W() { return canvas.getBoundingClientRect().width; }
  function H() { return canvas.getBoundingClientRect().height; }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function addPlatform(worldY, center = false) {
    const width = W();
    const platformW = center ? 132 : rand(72, 112); // pietre un po' più corte
    const x = center ? width / 2 - platformW / 2 : rand(12, Math.max(14, width - platformW - 12));
    const p = {
      x,
      y: worldY,
      w: platformW,
      h: 18,
      type: Math.random() > 0.86 ? "gold" : "stone",
      broken: false,
      touched: 0,
      crumbleAt: 0
    };
    platforms.push(p);

    if (!center) {
      const shouldRocket = score > 900 && score - lastRocketScore >= 2600 && Math.random() > 0.72;
      if (shouldRocket) {
        rockets.push({
          x: x + platformW / 2,
          y: worldY - 38,
          r: 13,
          taken: false
        });
        lastRocketScore = score;
      } else if (Math.random() > 0.40) {
        coinItems.push({
          x: x + platformW / 2,
          y: worldY - 34,
          r: 10,
          taken: false
        });
      }
    }
  }

  function resetGame() {
    setupCanvasSize();

    const width = W();
    const height = H();

    score = 0;
    coins = 0;
    cameraY = 0;
    highest = 0;
    lastTime = 0;
    gameOver = false;
    running = true;
    targetX = width / 2 - frog.w / 2;
    boostTime = 0;
    lastRocketScore = 0;

    frog.x = width / 2 - frog.w / 2;
    frog.y = height - 112;
    frog.vx = 0;
    frog.vy = 0;

    platforms = [];
    coinItems = [];
    rockets = [];

    const baseY = height - 55;
    addPlatform(baseY, true);

    let y = baseY - 82;
    for (let i = 0; i < 42; i++) {
      addPlatform(y);
      y -= rand(72, 94);
    }

    scoreEl.textContent = "0";
    coinsEl.textContent = "0";
  }

  function setTargetFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const half = rect.left + rect.width / 2;

    // meno sensibile: ogni tap sposta meno, e verso una corsia più morbida
    const step = Math.max(48, Math.min(78, rect.width * 0.16));
    if (clientX < half) {
      targetX = Math.max(8, frog.x - step);
    } else {
      targetX = Math.min(W() - frog.w - 8, frog.x + step);
    }
  }

  function pointerHandler(e) {
    e.preventDefault();
    e.stopPropagation();
    setTargetFromClientX(e.clientX);
  }

  canvas.addEventListener("pointerdown", pointerHandler, { passive: false });
  canvas.addEventListener("pointermove", (e) => {
    // Non aggiorna continuamente se non stai trascinando davvero: meno sensibilità.
    if (e.buttons && Math.abs(e.movementX || 0) > 5) pointerHandler(e);
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (!running) return;
    const step = 70;
    if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") {
      targetX = Math.max(8, frog.x - step);
    }
    if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") {
      targetX = Math.min(W() - frog.w - 8, frog.x + step);
    }
  });

  window.addEventListener("resize", () => {
    if (running) setupCanvasSize();
  });

  function physics(dt) {
    const width = W();
    const height = H();

    const desiredX = targetX ?? frog.x;
    const dx = desiredX - frog.x;
    frog.vx += dx * 0.026; // meno sensibile
    frog.vx *= 0.82;
    frog.vx = Math.max(-5.4, Math.min(5.4, frog.vx));
    frog.x += frog.vx;

    if (boostTime > 0) {
      boostTime -= dt;
      frog.vy = -7.2; // boost controllato, non razzo ingestibile
      score += 2;
    } else {
      frog.vy += 0.50;
    }

    frog.y += frog.vy;

    if (frog.x < -frog.w) frog.x = width;
    if (frog.x > width) frog.x = -frog.w;

    for (const p of platforms) {
      if (p.broken) continue;

      const falling = frog.vy > 0;
      const feetBefore = frog.y + frog.h - frog.vy;
      const feetNow = frog.y + frog.h;
      const overlapX = frog.x + frog.w > p.x && frog.x < p.x + p.w;
      const platformScreenY = p.y - cameraY;
      const platformVisible = platformScreenY >= -30 && platformScreenY <= height - 4;

      if (falling && platformVisible && overlapX && feetBefore <= p.y + 6 && feetNow >= p.y && feetNow <= p.y + p.h + 14) {
        frog.y = p.y - frog.h;
        frog.vy = -12.2; // salto automatico controllato

        if (p.type === "gold") {
          score += 18;
          p.touched = (p.touched || 0) + 1;

          // Le pietre dorate si sgretolano dopo 2 calpestii.
          if (p.touched >= 2) {
            p.crumbleAt = performance.now() + 220;
          }
        }
      }

      if (p.type === "gold" && p.touched >= 2 && !p.broken && performance.now() > p.crumbleAt) {
        p.broken = true;
      }
    }

    const screenY = frog.y - cameraY;
    if (screenY < height * 0.42) {
      cameraY = frog.y - height * 0.42;
    }

    highest = Math.max(highest, Math.floor(Math.max(0, -cameraY) / 2));
    score = Math.max(score, highest + coins * 40);

    let top = Math.min(...platforms.map(p => p.y));
    while (top - cameraY > -190) {
      addPlatform(top - rand(74, 98));
      top = Math.min(...platforms.map(p => p.y));
    }

    platforms = platforms.filter(p => p.y - cameraY < height + 180 && !(p.broken && p.y - cameraY > height + 40));
    coinItems = coinItems.filter(c => !c.taken && c.y - cameraY < height + 180);
    rockets = rockets.filter(r => !r.taken && r.y - cameraY < height + 180);

    for (const c of coinItems) {
      const d = Math.hypot((frog.x + frog.w / 2) - c.x, (frog.y + frog.h / 2) - c.y);
      if (d < 32) {
        c.taken = true;
        coins += 1;
        score += 40;
      }
    }

    for (const r of rockets) {
      const d = Math.hypot((frog.x + frog.w / 2) - r.x, (frog.y + frog.h / 2) - r.y);
      if (d < 34) {
        r.taken = true;
        boostTime = 4.6;
        frog.vy = -9;
        score += 120;
      }
    }

    // Se la rana esce dal fondo dello schermo, la partita finisce subito.
    // Non può più essere salvata da pietre non visibili sotto lo schermo.
    if (frog.y - cameraY > height - 2) {
      endGame();
    }

    scoreEl.textContent = String(Math.floor(score));
    coinsEl.textContent = String(coins);
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function drawFrog(fx, fy) {
    const fw = 62;
    const fh = 62;
    const cx = fx + frog.w / 2;
    const cy = fy + frog.h / 2;

    // Rana immagine
    if (frogImage.complete && frogImage.naturalWidth > 0) {
      ctx.drawImage(frogImage, cx - fw / 2, cy - fh / 2, fw, fh);
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-10, -12, 7, 0, Math.PI * 2);
      ctx.arc(10, -12, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#003129";
      ctx.beginPath();
      ctx.arc(-10, -12, 3, 0, Math.PI * 2);
      ctx.arc(10, -12, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (boostTime > 0) {
      ctx.save();
      ctx.translate(cx, cy + 28);
      ctx.fillStyle = "#FCBD16";
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(0, 34);
      ctx.lineTo(9, 0);
      ctx.fill();
      ctx.fillStyle = "#fb923c";
      ctx.beginPath();
      ctx.moveTo(-5, 2);
      ctx.lineTo(0, 24);
      ctx.lineTo(5, 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function draw() {
    const width = W();
    const height = H();

    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#083c2f");
    bg.addColorStop(0.35, "#0b6b4d");
    bg.addColorStop(1, "#bde77e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#FCBD16";
    for (let i = 0; i < 9; i++) {
      const x = (i * 97 + 35) % width;
      const y = (i * 141 + (-cameraY * 0.22)) % height;
      ctx.beginPath();
      ctx.arc(x, y, 16 + (i % 3) * 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of platforms) {
      if (p.broken) {
        // frammenti pietra dorata sgretolata
        const y = p.y - cameraY;
        if (y > -50 && y < height + 60) {
          ctx.fillStyle = "rgba(252,189,22,.55)";
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(p.x + 12 + i * (p.w / 5), y + 8 + (i % 2) * 7, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        continue;
      }

      const y = p.y - cameraY;
      if (y < -50 || y > height + 60) continue;

      ctx.fillStyle = p.type === "gold" ? "#FCBD16" : "#e5e7eb";
      roundedRect(p.x, y, p.w, p.h, 10);
      ctx.strokeStyle = "#003129";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "rgba(0,49,41,.20)";
      roundedRect(p.x + 5, y + p.h - 4, p.w - 10, 5, 6);

      if (p.type === "gold") {
        ctx.fillStyle = "rgba(255,255,255,.35)";
        roundedRect(p.x + 8, y + 4, p.w - 16, 3, 4);
      }
    }

    for (const c of coinItems) {
      if (c.taken) continue;
      const y = c.y - cameraY;
      if (y < -40 || y > height + 40) continue;

      ctx.fillStyle = "#FCBD16";
      ctx.beginPath();
      ctx.arc(c.x, y, c.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#7c4a03";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#fff8c5";
      ctx.beginPath();
      ctx.arc(c.x - 3, y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const r of rockets) {
      if (r.taken) continue;
      const y = r.y - cameraY;
      if (y < -50 || y > height + 50) continue;

      ctx.save();
      ctx.translate(r.x, y);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.roundRect(-8, -18, 16, 30, 8);
      ctx.fill();

      ctx.fillStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.moveTo(-8, -12);
      ctx.lineTo(0, -26);
      ctx.lineTo(8, -12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#60a5fa";
      ctx.beginPath();
      ctx.arc(0, -3, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FCBD16";
      ctx.beginPath();
      ctx.moveTo(-5, 13);
      ctx.lineTo(0, 25);
      ctx.lineTo(5, 13);
      ctx.fill();
      ctx.restore();
    }

    drawFrog(frog.x, frog.y - cameraY);

    if (boostTime > 0) {
      ctx.fillStyle = "#FCBD16";
      ctx.font = "1000 18px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("🚀 RAZZO!", width / 2, 96);
    }
  }

  function loop(ts) {
    if (!running) return;
    const dt = Math.min((ts - lastTime) / 1000 || 0.016, 0.033);
    lastTime = ts;

    physics(dt);
    draw();

    if (!gameOver) requestAnimationFrame(loop);
  }

  async function endGame() {
    if (gameOver) return;
    gameOver = true;
    running = false;
    overlay.style.display = "none";
    document.body.style.overflow = "";
    document.body.style.userSelect = "";

    const finalScore = Math.max(Math.floor(score), Number(scoreEl?.textContent || 0));

    finalText.textContent = `${nickname}, hai fatto ${finalScore} punti e raccolto ${coins} coin per il rione ${rione}.`;
    startPanel.style.display = "none";
    endPanel.style.display = "block";

    try {
      const res = await fetch("/api/pdt-jump/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, rione, device_id: deviceId, score: finalScore, coins, level_reached: 1 })
      });
      const data = await res.json();
      if (data.ok) renderLeaderboard(data.leaderboard);
    } catch (e) {}
  }

  function renderLeaderboard(rows) {
    if (!leaderboardEl) return;

    if (!rows || !rows.length) {
      leaderboardEl.innerHTML = `<li class="empty">Ancora nessun punteggio. Inizia tu!</li>`;
      return;
    }

    leaderboardEl.innerHTML = rows.map((row) => `
      <li>
        <span>
          <strong>${escapeHtml(row.nickname)}</strong>
          <small>${escapeHtml(row.rione)}</small>
        </span>
        <b>${Number(row.score || 0)}</b>
      </li>
    `).join("");
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  async function loadLeaderboard() {
    try {
      const res = await fetch("/api/pdt-jump/leaderboard");
      const data = await res.json();
      if (data.ok) renderLeaderboard(data.leaderboard);
    } catch (e) {}
  }

  function startCountdown(callback) {
    const countdown = document.getElementById("pdtCountdown");
    const hint = document.getElementById("pdtStartHint");

    if (!countdown) {
      callback();
      return;
    }

    let current = 3;
    countdown.style.display = "flex";
    countdown.textContent = current;

    const timer = setInterval(() => {
      current -= 1;

      if (current > 0) {
        countdown.textContent = current;
      } else {
        countdown.textContent = "GO!";
        clearInterval(timer);

        setTimeout(() => {
          countdown.style.display = "none";

          if (hint) {
            hint.style.display = "block";
            setTimeout(() => {
              hint.style.display = "none";
            }, 2600);
          }

          callback();
        }, 650);
      }
    }, 720);
  }

  function startGame() {
    if (!nickname || !rione) {
      nickname = nicknameInput.value.trim();
      rione = rioneSelect.value.trim();

      if (!nickname || !rione) {
        errorBox.textContent = "Inserisci nickname e rione per iniziare.";
        return;
      }

      saveLockedPlayer();
      loadLockedPlayer();
    }

    errorBox.textContent = "";
    startPanel.style.display = "none";
    endPanel.style.display = "none";

    overlay.style.display = "block";
    overlay.style.userSelect = "none";
    overlay.style.webkitUserSelect = "none";
    overlay.style.touchAction = "none";
    canvas.style.userSelect = "none";
    canvas.style.webkitUserSelect = "none";
    canvas.style.touchAction = "none";
    document.body.style.overflow = "hidden";
    document.body.style.userSelect = "none";

    startCountdown(() => {
      resetGame();
      requestAnimationFrame(loop);
    });
  }

  async function shareScore() {
    const text = `Ho fatto ${Math.floor(score)} punti su PDT JUMP 🐸🏆\nRione: ${rione}\nRiesci a superarmi?\nGioca anche tu sul sito del Palio della Torre!`;
    const shareData = {
      title: "PDT JUMP",
      text,
      url: window.location.origin + "/gioco"
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {}
    } else {
      try {
        await navigator.clipboard.writeText(`${text}\n${shareData.url}`);
        alert("Risultato copiato. Ora puoi incollarlo su WhatsApp o social.");
      } catch (e) {
        alert(text);
      }
    }
  }

  startBtn?.addEventListener("click", startGame);
  restartBtn?.addEventListener("click", () => {
    endPanel.style.display = "none";
    startPanel.style.display = "block";
  });
  shareBtn?.addEventListener("click", shareScore);

  loadLockedPlayer();
  loadLeaderboard();
})();
