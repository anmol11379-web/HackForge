import React, { useEffect, useRef } from 'react';

export default function AnimatedFooterLogo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const turbRef = useRef<SVGFETurbulenceElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const turb = turbRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = container.offsetWidth || 50);
    let height = (canvas.height = container.offsetHeight || 20);
    let emitters: { x: number; y: number }[] = [];
    let drips: Drip[] = [];
    let angle = 0;
    let animId: number;

    class Drip {
      x: number;
      y: number;
      speed: number;
      size: number;
      alpha: number;
      life: number;
      wobbleSpeed: number;
      wobbleOffset: number;

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.speed = Math.random() * 0.5 + 0.2;
        this.size = Math.random() * 0.5 + 0.2;
        this.alpha = 0.85;
        this.life = Math.random() * 25 + 15;
        this.wobbleSpeed = Math.random() * 0.1;
        this.wobbleOffset = Math.random() * Math.PI * 2;
      }

      update() {
        this.y += this.speed;
        this.alpha -= 1 / this.life;
        this.x += Math.sin(angle * this.wobbleSpeed + this.wobbleOffset) * 0.25;
      }

      draw(context: CanvasRenderingContext2D) {
        context.fillStyle = `rgba(168, 85, 247, ${Math.max(0, this.alpha * 0.85)})`;

        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();

        context.beginPath();
        context.moveTo(this.x - this.size * 0.8, this.y);
        context.lineTo(this.x, this.y - this.size * 2.2);
        context.lineTo(this.x + this.size * 0.8, this.y);
        context.fill();
      }
    }

    function findEmitters() {
      emitters = [];
      if (!container) return;
      const w = container.offsetWidth || 45;
      const h = container.offsetHeight || 18;

      // Emitters positioned over the HACK letters
      const top = h * 0.12;
      const left = w * 0.08;
      const emitW = w * 0.84;
      const emitH = h * 0.45;

      for (let i = 0; i < 20; i++) {
        emitters.push({
          x: left + Math.random() * emitW,
          y: top + Math.random() * emitH,
        });
      }
    }

    function resize() {
      if (!canvas || !container) return;
      width = canvas.width = container.offsetWidth || 45;
      height = canvas.height = container.offsetHeight || 18;
      findEmitters();
    }

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    function animate() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      angle += 0.05;
      if (turb) {
        turb.setAttribute('baseFrequency', String(0.005 + Math.sin(angle) * 0.002));
      }

      if (emitters.length > 0 && Math.random() * 0.3) {
        const em = emitters[Math.floor(Math.random() * emitters.length)];
        drips.push(new Drip(em.x, em.y));
      }

      for (let i = drips.length - 1; i >= 0; i--) {
        const drip = drips[i];
        drip.update();
        drip.draw(ctx);

        if (drip.alpha <= 0 || drip.y > height) {
          drips.splice(i, 1);
        }
      }

      animId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="relative inline-flex items-center justify-center select-none bg-transparent">
      {/* SVG Filter for Purple Wobble */}
      <svg className="w-0 h-0 absolute pointer-events-none" aria-hidden="true">
        <filter id="purple-wobble">
          <feTurbulence
            ref={turbRef}
            id="turb"
            type="fractalNoise"
            baseFrequency="0.005"
            numOctaves="2"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="1.8"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      <style>{`
        .animated-logo-container {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 1;
          text-align: center;
          animation: footerHeartbeat 2.5s infinite ease-in-out;
          filter: drop-shadow(0 0 2.5px rgba(168, 85, 247, 0.35)) url(#purple-wobble);
        }

        @keyframes footerHeartbeat {
          0%, 100% { 
            transform: scale(1); 
          }
          50% { 
            transform: scale(1.03); 
          }
        }

        .footer-logo-h1 {
          color: #a855f7;
          font-family: 'Nosifer', cursive;
          font-size: 7.5px;
          margin: 0;
          text-shadow: 0 0 3px rgba(168, 85, 247, 0.5);
          line-height: 1;
          letter-spacing: 0.6px;
        }

        .footer-logo-h2 {
          color: #cbd5e1;
          font-family: 'Permanent Marker', cursive;
          font-size: 6px;
          margin: 0;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
          transform: rotate(-3deg);
          margin-top: -1.5px;
          line-height: 1;
          letter-spacing: 0.2px;
        }

        .footer-logo-overlay {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 2;
          pointer-events: none;
        }
      `}</style>

      {/* Main Logo Text with Heartbeat & Purple Wobble */}
      <div
        ref={containerRef}
        className="animated-logo-container px-1 py-0.5 min-w-[42px] bg-transparent"
      >
        <h1 className="footer-logo-h1">HACK</h1>
        <h2 className="footer-logo-h2">FORGE</h2>

        {/* Canvas for Dripping Particles Overlay */}
        <canvas ref={canvasRef} className="footer-logo-overlay" />
      </div>
    </div>
  );
}
