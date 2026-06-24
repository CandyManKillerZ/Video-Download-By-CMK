// Matrix "digital rain" backdrop. Self-contained; draws on #matrix behind the UI.
(function () {
  const c = document.getElementById('matrix');
  if (!c) return;
  const ctx = c.getContext('2d');
  const fontSize = 14;
  const chars = 'ｱｲｳｴｵｶｷｸｹｺABCDEF0123456789<>/\\|=+*ﾊﾋﾌﾍﾎ$#%&';
  let w, h, cols, drops;

  function resize() {
    w = c.width = window.innerWidth;
    h = c.height = window.innerHeight;
    cols = Math.floor(w / fontSize);
    drops = new Array(cols).fill(0).map(() => Math.random() * -50);
  }

  function draw() {
    // translucent dark fill leaves fading trails
    ctx.fillStyle = 'rgba(5, 8, 5, 0.09)';
    ctx.fillRect(0, 0, w, h);
    ctx.font = fontSize + 'px monospace';
    for (let i = 0; i < cols; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      const y = drops[i] * fontSize;
      // leading glyph brighter than the trail
      ctx.fillStyle = Math.random() > 0.975 ? '#b9ffce' : '#1f9e3a';
      ctx.fillText(ch, i * fontSize, y);
      if (y > h && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }

  resize();
  window.addEventListener('resize', resize);
  setInterval(draw, 55);   // ~18 fps — easy on the CPU
})();
