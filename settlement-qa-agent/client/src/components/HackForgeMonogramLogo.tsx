import React from 'react';

interface HackForgeMonogramLogoProps {
  className?: string;
}

export default function HackForgeMonogramLogo({
  className = 'w-10 h-10',
}: HackForgeMonogramLogoProps) {
  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Platinum / Sapphire / Emerald Gradient */}
          <linearGradient id="shield-neural-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>

          {/* Cyan Soft Glow */}
          <filter id="shield-cyan-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Core Emerald Glow */}
          <filter id="shield-emerald-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.06   0 0 0 0 0.72   0 0 0 0 0.51  0 0 0 1 0"
            />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <style>{`
          @keyframes shieldSpinRing {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes shieldPulseNode {
            0%, 100% { transform: scale(1); filter: drop-shadow(0 0 3px rgba(16, 185, 129, 0.6)); }
            50% { transform: scale(1.15); filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.95)); }
          }
          .shield-orbit-ring {
            transform-origin: 100px 100px;
            animation: shieldSpinRing 25s linear infinite;
          }
          .shield-emerald-core {
            transform-origin: 100px 106px;
            animation: shieldPulseNode 2.5s ease-in-out infinite;
          }
        `}</style>

        {/* Ambient background glow */}
        <circle
          cx="100"
          cy="100"
          r="80"
          fill="radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, rgba(16, 185, 129, 0.04) 45%, rgba(0,0,0,0) 75%)"
          opacity="0.8"
        />

        {/* Orbiting Dashed Ring */}
        <circle
          cx="100"
          cy="100"
          r="92"
          stroke="rgba(56, 189, 248, 0.45)"
          strokeWidth="1.2"
          strokeDasharray="6 12"
          fill="none"
          className="shield-orbit-ring"
        />

        {/* Outer Shield Hexagon */}
        <path
          d="M 100 18 L 178 52 L 178 148 L 100 182 L 22 148 L 22 52 Z"
          fill="rgba(5, 7, 12, 0.7)"
          stroke="rgba(241, 245, 249, 0.85)"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />

        {/* Inner Track Hexagon */}
        <path
          d="M 100 36 L 152 59 L 152 141 L 100 164 L 48 141 L 48 59 Z"
          fill="none"
          stroke="rgba(255, 255, 255, 0.14)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* Corner Accents / Ticks */}
        <path
          d="M 22 46 L 30 50 M 178 46 L 170 50 M 22 154 L 30 150 M 178 154 L 170 150"
          stroke="rgba(56, 189, 248, 0.6)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Neural Network Monogram Paths with Cyan/Sapphire Glow */}
        <g filter="url(#shield-cyan-glow)">
          {/* Neural triangle and vertical/horizontal cross lines */}
          <path
            d="M 68 115 L 100 72 L 132 115 M 100 72 L 100 138 M 72 95 L 128 95"
            stroke="url(#shield-neural-grad)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Top Apex Node */}
          <circle cx="100" cy="72" r="6" fill="#38bdf8" />
          <circle cx="100" cy="72" r="2.2" fill="#ffffff" />

          {/* Left Base Node */}
          <circle cx="68" cy="115" r="4.5" fill="#38bdf8" />
          <circle cx="68" cy="115" r="1.6" fill="#ffffff" />

          {/* Right Base Node */}
          <circle cx="132" cy="115" r="4.5" fill="#38bdf8" />
          <circle cx="132" cy="115" r="1.6" fill="#ffffff" />
        </g>

        {/* Central Emerald Core Pulse Node */}
        <g className="shield-emerald-core">
          <circle
            cx="100"
            cy="106"
            r="6"
            fill="#10b981"
            filter="url(#shield-emerald-glow)"
          />
          <circle
            cx="100"
            cy="106"
            r="2.2"
            fill="#ffffff"
          />
        </g>
      </svg>
    </div>
  );
}
