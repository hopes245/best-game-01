// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the
// backdrop colour. Canvas shapes and gradients, canvas text for the HUD and the
// panels — the game's whole look is drawn, nothing is loaded from a file.

import { EMBER, FIELD, FONT, PALETTE, WIN_WAVE } from './config.js';
import { KIND_BULWARK, KIND_DART } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 640, line: 32 };
const CARD = { width: 300, height: 236, gap: 24, top: 268 };
const LIFE_SIZE = 20;
const LIFE_GAP = 8;

/** Where the three blessing cards sit, in field coordinates. */
export function blessingCards() {
  const total = CARD.width * 3 + CARD.gap * 2;
  const left = (FIELD.width - total) / 2;
  return [0, 1, 2].map((index) => ({
    x: left + index * (CARD.width + CARD.gap),
    y: CARD.top,
    width: CARD.width,
    height: CARD.height,
  }));
}

/** Which blessing card, if any, a field-space point is over. */
export function blessingAt(x, y) {
  const cards = blessingCards();
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (x >= card.x && x <= card.x + card.width && y >= card.y && y <= card.y + card.height) return index;
  }
  return -1;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  // The night sky's stars: fixed positions from a tiny local generator, so the
  // backdrop is the same every visit and every screenshot.
  let starSeed = 1234567;
  function nextStar() {
    starSeed = (starSeed * 1103515245 + 12345) & 0x7fffffff;
    return starSeed / 0x7fffffff;
  }
  const stars = [];
  for (let index = 0; index < 90; index += 1) {
    stars.push({ x: nextStar() * FIELD.width, y: nextStar() * FIELD.height * 0.7, r: 0.6 + nextStar() * 1.4, a: 0.25 + nextStar() * 0.55 });
  }
  // The grove's trees: dark silhouettes pinned to the field's edges.
  const trees = [];
  for (let index = 0; index < 14; index += 1) {
    const edge = index % 2 === 0 ? 0 : FIELD.height;
    trees.push({ x: 30 + nextStar() * (FIELD.width - 60), y: edge, r: 26 + nextStar() * 30 });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Window (CSS pixel) point to field coordinates, for mouse hover and clicks. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const px = (clientX - rect.left) * ratio;
    const py = (clientY - rect.top) * ratio;
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', weight = '', baseline = 'alphabetic') {
    const key = `${weight}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`.trim());
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  function drawBackdrop(state) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(1, PALETTE.skyBottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const star of stars) {
      context.globalAlpha = star.a * (0.7 + 0.3 * Math.sin(state.time * 1.3 + star.x));
      context.fillStyle = '#cdd6ff';
      context.beginPath();
      context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    for (const tree of trees) {
      context.fillStyle = PALETTE.grove;
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillRect(tree.x - 5, tree.y - tree.r * 0.4, 10, tree.r * 0.6);
    }
  }

  function drawLanternLight(state) {
    const player = state.player;
    const glow = context.createRadialGradient(player.x, player.y, 10, player.x, player.y, 300);
    glow.addColorStop(0, 'rgba(255, 209, 102, 0.26)');
    glow.addColorStop(0.55, 'rgba(255, 209, 102, 0.09)');
    glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
    context.fillStyle = glow;
    context.fillRect(player.x - 300, player.y - 300, 600, 600);
  }

  function drawEmbers(state) {
    for (const ember of state.embers) {
      if (!ember.active) continue;
      const pulse = 1 + 0.15 * Math.sin(state.time * 6 + ember.x);
      context.fillStyle = 'rgba(242, 165, 65, 0.35)';
      context.beginPath();
      context.arc(ember.x, ember.y, EMBER.radius * 2 * pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.ember;
      context.beginPath();
      context.arc(ember.x, ember.y, EMBER.radius * pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffe9b0';
      context.beginPath();
      context.arc(ember.x - 2, ember.y - 2, 2.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawGloom(state) {
    for (const enemy of state.enemies) {
      if (!enemy.active) continue;
      const wobble = enemy.kind === KIND_DART ? Math.sin(enemy.wobble) * 0.2 : 0;
      const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x) + wobble;
      context.save();
      context.translate(enemy.x, enemy.y);
      if (enemy.kind === KIND_DART) {
        context.rotate(angle);
        context.fillStyle = enemy.flash > 0 ? '#ffffff' : PALETTE.dart;
        context.beginPath();
        context.moveTo(enemy.radius * 1.6, 0);
        context.lineTo(-enemy.radius, enemy.radius * 0.9);
        context.lineTo(-enemy.radius * 0.4, 0);
        context.lineTo(-enemy.radius, -enemy.radius * 0.9);
        context.closePath();
        context.fill();
        context.fillStyle = '#ffd7ef';
        context.beginPath();
        context.arc(enemy.radius * 0.5, 0, 2.5, 0, Math.PI * 2);
        context.fill();
      } else {
        const color = enemy.kind === KIND_BULWARK ? PALETTE.bulwark : PALETTE.wisp;
        context.fillStyle = enemy.flash > 0 ? '#ffffff' : color;
        context.beginPath();
        context.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        context.fill();
        // A smoky rim, darker than the body.
        context.globalAlpha = 0.5;
        context.fillStyle = '#0a0d1f';
        context.beginPath();
        context.arc(0, 0, enemy.radius * 0.62, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        // Two glowing eyes, always watching the keeper.
        const eyeColor = enemy.kind === KIND_BULWARK ? PALETTE.bulwarkEye : PALETTE.wispEye;
        const spread = enemy.radius * 0.38;
        const forward = enemy.radius * 0.28;
        context.fillStyle = eyeColor;
        context.beginPath();
        context.arc(Math.cos(angle) * forward - Math.sin(angle) * spread, Math.sin(angle) * forward + Math.cos(angle) * spread, enemy.radius * 0.16, 0, Math.PI * 2);
        context.arc(Math.cos(angle) * forward + Math.sin(angle) * spread, Math.sin(angle) * forward - Math.cos(angle) * spread, enemy.radius * 0.16, 0, Math.PI * 2);
        context.fill();
        if (enemy.kind === KIND_BULWARK && enemy.hp === 1) {
          // A wounded bulwark shows its cracks.
          context.strokeStyle = 'rgba(255, 93, 93, 0.8)';
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(-enemy.radius * 0.5, -enemy.radius * 0.4);
          context.lineTo(0, 0);
          context.lineTo(enemy.radius * 0.4, enemy.radius * 0.5);
          context.stroke();
        }
      }
      context.restore();
    }
  }

  function drawParticles(state) {
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    for (const ring of state.rings) {
      if (!ring.active) continue;
      context.globalAlpha = Math.max(0, ring.life / 0.35);
      context.strokeStyle = PALETTE.lantern;
      context.lineWidth = 5;
      context.beginPath();
      context.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;
    for (const floater of state.floaters) {
      if (!floater.active) continue;
      context.globalAlpha = Math.max(0, floater.life / 0.9);
      text(floater.text, floater.x, floater.y, 22, PALETTE.lantern, 'center', '700');
    }
    context.globalAlpha = 1;
  }

  function drawLanternKeeper(state) {
    const player = state.player;
    // Blink while mercy is running: hidden on every other tenth of a second.
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) return;
    const flicker = 1 + 0.08 * Math.sin(state.time * 9) + 0.04 * Math.sin(state.time * 23);
    // The pulse recharges as a golden arc around the keeper.
    if (player.pulseTimer > 0) {
      const ready = 1 - player.pulseTimer / player.pulseCooldown;
      context.strokeStyle = 'rgba(255, 209, 102, 0.55)';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(player.x, player.y, player.radius + 9, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2);
      context.stroke();
    }
    // The lantern itself: a warm core, a flame leaning the way the keeper moves.
    context.fillStyle = PALETTE.lantern;
    context.beginPath();
    context.arc(player.x, player.y, player.radius * flicker, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.lanternCore;
    context.beginPath();
    context.arc(player.x, player.y, player.radius * 0.55 * flicker, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ff9d00';
    context.beginPath();
    context.arc(
      player.x + Math.cos(player.face) * player.radius * 0.5,
      player.y + Math.sin(player.face) * player.radius * 0.5,
      4.5,
      0,
      Math.PI * 2,
    );
    context.fill();
    // The pulse's reach, faintly, so the player can feel it.
    context.strokeStyle = 'rgba(255, 209, 102, 0.14)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(player.x, player.y, player.pulseRadius, 0, Math.PI * 2);
    context.stroke();
  }

  function drawHud(state) {
    text(`SCORE ${state.score}`, 24, 18, 28, PALETTE.text, 'left', '700', 'top');
    text(`WAVE ${Math.max(1, state.wave)} / ${WIN_WAVE}`, FIELD.width / 2, 18, 28, PALETTE.text, 'center', '700', 'top');
    const firstLife = FIELD.width - 24 - state.player.maxHearts * (LIFE_SIZE + LIFE_GAP) + LIFE_GAP;
    text('HEARTS', firstLife - 12, 18, 28, PALETTE.text, 'right', '700', 'top');
    for (let index = 0; index < state.player.maxHearts; index += 1) {
      const x = firstLife + index * (LIFE_SIZE + LIFE_GAP);
      context.fillStyle = index < state.player.hearts ? PALETTE.lantern : '#2a3040';
      context.beginPath();
      context.arc(x + LIFE_SIZE / 2, 30, LIFE_SIZE / 2, 0, Math.PI * 2);
      context.fill();
      if (index < state.player.hearts) {
        context.fillStyle = PALETTE.lanternCore;
        context.beginPath();
        context.arc(x + LIFE_SIZE / 2, 30, 4, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Ember progress toward the next mended heart.
    const barWidth = 150;
    const barX = 24;
    const barY = 56;
    text(`EMBERS ${state.embersSinceMend} / ${EMBER.mendEvery}`, barX, barY, 16, PALETTE.muted, 'left', '600', 'top');
    context.fillStyle = '#2a3040';
    context.fillRect(barX + 118, barY + 2, barWidth, 12);
    context.fillStyle = PALETTE.ember;
    context.fillRect(barX + 118, barY + 2, barWidth * (state.embersSinceMend / EMBER.mendEvery), 12);
    if (state.combo >= 2) {
      text(`COMBO x${state.combo}`, FIELD.width / 2, 56, 22, PALETTE.lantern, 'center', '700', 'top');
    }
    if (state.waveState === 'wave' && state.spawnQueue.length === 0) {
      text('Clear the last of the gloom!', FIELD.width / 2, 92, 20, PALETTE.muted, 'center', '600', 'top');
    }
  }

  function drawPanel(title, lines, prompt, promptColor = PALETTE.lantern) {
    const height = 120 + lines.length * PANEL.line + 70;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 46, PALETTE.text, 'center', '800');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 120 + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 23, promptColor, 'center', '700');
  }

  function drawTitlePanel(state, best) {
    const lines = [
      'The last lantern burns in a grove overrun by gloom.',
      'Move with WASD or arrows. Pulse with Space or click.',
      'Gather embers, clear all ten waves, and keep the light alive.',
      best > 0 ? `Best score ${best}` : 'No keeper has scored yet — be the first.',
    ];
    drawPanel('LUMEN KEEP', lines, 'Press Space or click to begin');
  }

  function drawBlessingCards(state, hoverIndex) {
    context.textBaseline = 'alphabetic';
    text('THE GROVE BREATHES', FIELD.width / 2, 150, 40, PALETTE.text, 'center', '800');
    text(`Wave ${state.wave} cleared  ·  choose a blessing  ·  click or press 1, 2 or 3`, FIELD.width / 2, 196, 22, PALETTE.muted, 'center');
    const cards = blessingCards();
    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      const blessing = state.offers[index];
      if (!blessing) continue;
      const hovered = index === hoverIndex;
      context.fillStyle = hovered ? '#242b52' : PALETTE.panel;
      context.fillRect(card.x, card.y, card.width, card.height);
      context.strokeStyle = hovered ? PALETTE.lantern : PALETTE.panelEdge;
      context.lineWidth = hovered ? 3 : 2;
      context.strokeRect(card.x, card.y, card.width, card.height);
      text(`${index + 1}`, card.x + 18, card.y + 34, 20, PALETTE.muted, 'left', '700');
      text(blessing.name, card.x + card.width / 2, card.y + 78, 27, PALETTE.text, 'center', '800');
      // The blessing's words, wrapped over two lines by hand.
      const words = blessing.blurb.split(' ');
      let line = '';
      const wrapped = [];
      for (const word of words) {
        if ((line + word).length > 22) {
          wrapped.push(line.trim());
          line = '';
        }
        line += `${word} `;
      }
      wrapped.push(line.trim());
      wrapped.forEach((row, rowIndex) => {
        text(row, card.x + card.width / 2, card.y + 122 + rowIndex * 28, 19, PALETTE.muted, 'center');
      });
      text('Choose', card.x + card.width / 2, card.y + card.height - 26, 20, PALETTE.lantern, 'center', '700');
    }
  }

  function drawOverPanel(state, best) {
    const lines = [
      `Score ${state.score}`,
      `Best ${best}`,
      `You held the grove through wave ${Math.max(1, state.wave)} of ${WIN_WAVE}.`,
      'The gloom gathers again — the lantern can be relit.',
    ];
    drawPanel('THE LIGHT FADES', lines, 'Press Space or click to try again', PALETTE.danger);
  }

  function drawWinPanel(state, best) {
    const lines = [
      `Score ${state.score}`,
      `Best ${best}`,
      `All ten waves cleared. Dawn breaks over the grove,`,
      'and the last lantern burns a little brighter.',
    ];
    drawPanel('THE GROVE IS SAVED', lines, 'Press Space or click to keep the light', PALETTE.heal);
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, hoverIndex = -1) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Screen shake: a small offset while the keeper reels from a hit, drawn from
    // the world's own clock so a staged frame is the same every time.
    const shake = state.shake * 7;
    const fract = (n) => n - Math.floor(n);
    const shakeX = shake === 0 ? 0 : (fract(Math.sin(state.time * 127.1) * 43758.5453) - 0.5) * 2 * shake;
    const shakeY = shake === 0 ? 0 : (fract(Math.sin(state.time * 311.7) * 12543.1234) - 0.5) * 2 * shake;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawBackdrop(state);
    drawLanternLight(state);
    drawEmbers(state);
    drawGloom(state);
    drawLanternKeeper(state);
    drawParticles(state);
    if (screen === SCREEN_TITLE) {
      drawTitlePanel(state, best);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The gloom waits for no one — except now.'], 'Press P to return to the grove');
    } else if (screen === SCREEN_UPGRADE) {
      drawBlessingCards(state, hoverIndex);
    } else if (screen === SCREEN_OVER) {
      drawOverPanel(state, best);
    } else if (screen === SCREEN_WIN) {
      drawWinPanel(state, best);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField };
}
