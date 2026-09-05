import React, { useEffect, useRef, useState } from 'react';

interface IntroAnimationProps {
  onComplete: () => void;
  autoDismissMs?: number;
}

export default function IntroAnimation({
  onComplete,
  autoDismissMs = 2350,
}: IntroAnimationProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [isVaporizing, setIsVaporizing] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const completedRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);

  const handleFinish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setIsFadingOut(true);
    setTimeout(() => {
      onComplete();
    }, 350);
  };

  useEffect(() => {
    // 1. Initialize stroke dasharray for clean line drawing
    if (wrapperRef.current) {
      const paths = wrapperRef.current.querySelectorAll<SVGPathElement>('.path-draw');
      paths.forEach((path) => {
        if (path.getTotalLength) {
          const length = path.getTotalLength();
          path.style.strokeDasharray = `${length + 5}`;
          path.style.strokeDashoffset = `${length + 5}`;
        }
      });
    }

    // 2. Open Gate & Slide Out Text (Sliding sideways + pop out zoom)
    const gateTimer = setTimeout(() => {
      setGateOpen(true);
    }, 1050);

    // 3. Vaporize effect & Canvas particle explosion
    const vaporizeTimer = setTimeout(() => {
      setIsVaporizing(true);
      triggerVaporizeCanvas();
    }, 1550);

    // 4. Auto dismiss immediately as vaporization finishes
    const dismissTimer = setTimeout(() => {
      handleFinish();
    }, autoDismissMs);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        handleFinish();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(gateTimer);
      clearTimeout(vaporizeTimer);
      clearTimeout(dismissTimer);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [autoDismissMs]);

  const triggerVaporizeCanvas = () => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const rect = wrapper.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const particleCount = 160;
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
      decay: number;
    }
    const particles: Particle[] = [];
    const colors = ['#38bdf8', '#10b981', '#ffffff', '#94a3b8'];

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.6;
      particles.push({
        x: centerX + (Math.random() - 0.5) * (rect.width > 0 ? rect.width : 280),
        y: centerY + (Math.random() - 0.5) * (rect.height > 0 ? rect.height : 280),
        vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.4,
        vy: Math.sin(angle) * speed - (Math.random() * 0.6 + 0.2),
        size: Math.random() * 2.5 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.038 + Math.random() * 0.025,
      });
    }

    const animateParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let activeCount = 0;

      particles.forEach((p) => {
        if (p.alpha > 0) {
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= p.decay;

          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 6;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          activeCount++;
        }
      });

      if (activeCount > 0) {
        animFrameRef.current = requestAnimationFrame(animateParticles);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    animateParticles();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col justify-center items-center overflow-hidden bg-[#05070c] transition-opacity duration-350 ease-out select-none ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <style>{`
        :root {
          --obsidian: #05070c;
          --surface-glass: rgba(12, 17, 29, 0.7);
          --border-subtle: rgba(255, 255, 255, 0.08);
          --platinum: #f1f5f9;
          --champagne: #d4af37;
          --sapphire-glow: rgba(56, 189, 248, 0.18);
          --emerald-accent: #10b981;
        }

        .noise-overlay {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0.035;
          pointer-events: none;
          z-index: 100;
          background: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        .tech-grid {
          position: absolute;
          inset: -50%;
          width: 200%;
          height: 200%;
          background-size: 80px 80px;
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
          transform: perspective(700px) rotateX(65deg) translateY(-120px) translateZ(-200px);
          animation: gridMove 20s linear infinite;
          z-index: 0;
        }

        @keyframes gridMove {
          0% { transform: perspective(700px) rotateX(65deg) translateY(0) translateZ(-200px); }
          100% { transform: perspective(700px) rotateX(65deg) translateY(80px) translateZ(-200px); }
        }

        .ambient-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(56, 189, 248, 0.08) 0%, rgba(16, 185, 129, 0.03) 40%, rgba(0,0,0,0) 75%);
          border-radius: 50%;
          z-index: 1;
          filter: blur(40px);
          animation: pulseGlow 5s ease-in-out infinite alternate;
        }

        @keyframes pulseGlow {
          0% { transform: scale(0.85); opacity: 0.6; }
          100% { transform: scale(1.15); opacity: 1; }
        }

        .cinematic-intro {
          animation: vaporizeZoomOut 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        @keyframes vaporizeZoomOut {
          0% {
            transform: scale(1.4) rotate(-3deg);
            filter: blur(10px) brightness(1.8);
            opacity: 0;
          }
          100% {
            transform: scale(1) rotate(0deg);
            filter: blur(0px) brightness(1);
            opacity: 1;
          }
        }

        .is-vaporizing {
          animation: disintegrateOut 0.75s cubic-bezier(0.65, 0, 0.35, 1) forwards !important;
        }

        @keyframes disintegrateOut {
          0% {
            transform: scale(1) translateY(0);
            filter: blur(0px) brightness(1);
            opacity: 1;
          }
          40% {
            transform: scale(1.02) translateY(-3px);
            filter: blur(2px) brightness(1.4) drop-shadow(0 0 15px rgba(56,189,248,0.7));
            opacity: 0.9;
          }
          100% {
            transform: scale(1.06) translateY(-20px) skewX(3deg);
            filter: blur(8px) brightness(2.0) drop-shadow(0 0 30px rgba(16,185,129,0.8));
            opacity: 0;
          }
        }

        .financial-vectors {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          overflow: hidden;
        }

        .market-wave {
          position: absolute;
          width: 140%;
          height: 100%;
          opacity: 0.12;
          stroke: url(#sapphire-grad);
          stroke-width: 1.25;
          fill: none;
          filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.2));
          animation: waveDrift 25s linear infinite;
        }

        @keyframes waveDrift {
          0% { transform: translateX(-15%) translateY(0); }
          50% { transform: translateX(0%) translateY(-10px); }
          100% { transform: translateX(-15%) translateY(0); }
        }

        .svg-container {
          position: relative;
          z-index: 10;
          width: 200px;
          height: 200px;
          filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5));
          animation: atomizeOutward 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }

        @keyframes atomizeOutward {
          0% { transform: scale(0.75); filter: drop-shadow(0 0 25px rgba(56, 189, 248, 0.7)) blur(6px); }
          100% { transform: scale(1); filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.5)); }
        }

        .path-draw { fill: none; stroke-dasharray: 1000; stroke-dashoffset: 1000; }
        
        .outer-shield { stroke: rgba(241, 245, 249, 0.6); stroke-width: 1.5; animation: drawPath 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s forwards; }
        .inner-track { stroke: rgba(255, 255, 255, 0.08); stroke-width: 1; animation: drawPath 0.65s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s forwards; }
        
        .ai-neural-path {
          stroke: url(#platinum-gradient); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
          animation: drawPath 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.28s forwards, subtleGlow 2.5s ease-in-out 1s infinite alternate;
        }

        .ai-node-circle { fill: #38bdf8; opacity: 0; animation: igniteCore 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) 0.55s forwards; }
        .ai-core-pulse { fill: #10b981; opacity: 0; transform-origin: center; animation: igniteCore 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) 0.65s forwards, pulseNode 2s infinite ease-in-out; }
        
        .data-ring {
          stroke: rgba(56, 189, 248, 0.35); stroke-width: 0.75; stroke-dasharray: 6 12; fill: none;
          transform-origin: center; opacity: 0;
        }
        .data-ring.appear { animation: fadeInRing 0.4s ease 0.4s forwards, spinRing 20s linear infinite; }

        @keyframes drawPath { to { stroke-dashoffset: 0; } }
        @keyframes igniteCore { 0% { opacity: 0; transform: scale(0); filter: blur(2px); } 100% { opacity: 1; transform: scale(1); filter: blur(0px); } }
        @keyframes pulseNode { 0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.4)); } 50% { transform: scale(1.2); filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.8)); } }
        @keyframes subtleGlow { 0% { filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.3)); } 100% { filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.6)); } }
        @keyframes spinRing { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeInRing { from { opacity: 0; } to { opacity: 1; } }

        .text-container {
          position: relative;
          z-index: 10;
          text-align: center;
          margin-top: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0.5rem 1rem;
        }

        .gate-door {
          display: flex;
          align-items: center;
          transition: transform 1.0s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .text-container.gate-open .left-door {
          transform: translateX(-140%);
        }

        .text-container.gate-open .right-door {
          transform: translateX(140%);
        }

        .powered-by-text {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%) scale(0.8) translateY(15px);
          opacity: 0;
          white-space: nowrap;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.75rem;
          letter-spacing: 0.25em;
          color: #94a3b8;
          font-weight: 600;
          transition: all 1.0s cubic-bezier(0.2, 0.8, 0.2, 1);
          pointer-events: none;
        }

        .text-container.gate-open .powered-by-text {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1) translateY(0);
        }

        .hf-highlight {
          color: #10b981;
          font-weight: 700;
          text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
          display: inline-block;
        }

        .text-container.gate-open .hf-highlight {
          animation: cyberGlitch 3s infinite;
          animation-delay: 1.5s;
        }

        @keyframes cyberGlitch {
          0%, 93%, 100% { 
            text-shadow: 0 0 10px rgba(16, 185, 129, 0.5); 
            transform: none; 
            filter: blur(0px);
          }
          94% { 
            text-shadow: -2px 0 #ff003c, 2px 0 #00e6f6; 
            transform: translate(-2px, 1px) skewX(-15deg); 
          }
          96% { 
            text-shadow: 2px 0 #ff003c, -2px 0 #00e6f6; 
            transform: translate(2px, -1px) skewX(15deg); 
            filter: blur(1px);
          }
          98% { 
            text-shadow: -1px 0 #ff003c, 1px 0 #00e6f6; 
            transform: translate(-1px, 2px) skewX(-5deg); 
            filter: blur(0px);
          }
        }

        .word-fintech {
          font-family: 'Outfit', sans-serif;
          font-weight: 600;
          letter-spacing: 0.15em;
          color: #ffffff;
          font-size: 2rem;
          transform: translateY(20px) scale(0.85);
          opacity: 0;
          transition: all 1.0s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .word-solutions {
          font-family: 'Outfit', sans-serif;
          font-weight: 300;
          letter-spacing: 0.15em;
          color: #38bdf8;
          font-size: 2rem;
          transform: translateY(20px) scale(0.85);
          opacity: 0;
          transition: all 1.0s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .text-container.gate-open .word-fintech,
        .text-container.gate-open .word-solutions {
          transform: translateY(0) scale(1);
          opacity: 1;
        }

        #vaporizeCanvas {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 200;
        }
      `}</style>

      {/* Atmospheric overlays */}
      <div className="noise-overlay" />
      <div className="tech-grid" />
      <div className="ambient-glow" />
      <canvas ref={canvasRef} id="vaporizeCanvas" />

      {/* Financial Vector Wave */}
      <div className="financial-vectors">
        <svg className="market-wave" viewBox="0 0 1000 500" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sapphire-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.05)" />
              <stop offset="50%" stopColor="rgba(56, 189, 248, 0.3)" />
              <stop offset="100%" stopColor="rgba(16, 185, 129, 0.1)" />
            </linearGradient>
          </defs>
          <path d="M 0,260 Q 200,160 400,230 T 750,190 T 1000,130" />
        </svg>
      </div>

      {/* Main Logo & Gate Animation Wrapper */}
      <div
        ref={wrapperRef}
        id="logo-wrapper"
        className={`flex flex-col items-center justify-center relative z-10 w-full h-screen cinematic-intro ${
          isVaporizing ? 'is-vaporizing' : ''
        }`}
      >
        <div className="svg-container">
          <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <defs>
              <linearGradient id="platinum-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              <filter id="soft-glow" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <circle cx="100" cy="100" r="92" className="data-ring appear" />

            <path
              className="path-draw outer-shield"
              d="M 100 18 L 178 52 L 178 148 L 100 182 L 22 148 L 22 52 Z"
            />
            <path
              className="path-draw inner-track"
              d="M 100 36 L 152 59 L 152 141 L 100 164 L 48 141 L 48 59 Z"
            />

            <g filter="url(#soft-glow)">
              <path
                className="path-draw ai-neural-path"
                d="M 68 115 L 100 72 L 132 115 M 100 72 L 100 138 M 72 95 L 128 95"
              />
              <circle cx="100" cy="72" r="5" className="ai-node-circle" />
              <circle
                cx="68"
                cy="115"
                r="3.5"
                className="ai-node-circle"
                style={{ animationDelay: '0.7s' }}
              />
              <circle
                cx="132"
                cy="115"
                r="3.5"
                className="ai-node-circle"
                style={{ animationDelay: '0.75s' }}
              />
              <circle cx="100" cy="106" r="4.5" className="ai-core-pulse" />
            </g>

            <path
              className="path-draw ai-neural-path"
              style={{ strokeWidth: 1.25, opacity: 0.4, animationDelay: '0.45s' }}
              d="M 22 46 L 30 50 M 178 46 L 170 50 M 22 154 L 30 150 M 178 154 L 170 150"
            />
          </svg>
        </div>

        {/* Sliding Gate Text */}
        <div className={`text-container ${gateOpen ? 'gate-open' : ''}`} id="slidingGate">
          <div className="gate-door left-door">
            <span className="word-fintech">FINTECH</span>
          </div>

          <div className="powered-by-text">
            POWERED BY <span className="hf-highlight">HACK FORGE</span>
          </div>

          <div className="gate-door right-door">
            <span className="word-solutions ml-3">SOLUTIONS</span>
          </div>
        </div>
      </div>

      {/* Skip Button */}
      <button
        onClick={handleFinish}
        className="fixed bottom-6 right-6 z-50 text-xs tracking-widest uppercase text-slate-400 hover:text-cyan-300 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md transition-all duration-300 flex items-center gap-2"
        title="Skip intro animation"
      >
        <span>Skip Intro</span>
        <span className="text-[10px] text-slate-500">[Esc]</span>
      </button>
    </div>
  );
}
