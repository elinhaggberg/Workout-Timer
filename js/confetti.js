const COLORS = ["#d4ff3d", "#ff5d5d", "#4dd0ff", "#ffb84d", "#c98bff"];

export function launchConfetti(canvas, { durationMs = 2600, count = 140 } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  const particles = Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.4,
    size: 4 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    vx: (Math.random() - 0.5) * 2,
    vy: 2 + Math.random() * 3,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.3,
  }));

  const start = performance.now();
  let raf = null;

  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, w, h);

    const fadeStart = durationMs * 0.7;
    const opacity = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / (durationMs - fadeStart)) : 1;

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    if (elapsed < durationMs) {
      raf = requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, w, h);
    }
  }

  raf = requestAnimationFrame(frame);
  return () => raf && cancelAnimationFrame(raf);
}
