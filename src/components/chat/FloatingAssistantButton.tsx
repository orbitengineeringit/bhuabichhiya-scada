import React, { useState } from 'react';
import { Bot, X, Maximize2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import PlantAssistant from './PlantAssistant';
import { cn } from '@/lib/utils';

const FloatingAssistantButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // Hide on /assistant page itself
  if (!isAuthenticated || location.pathname === '/assistant') return null;

  return (
    <>
      {/* Floating cute robot — multi-color aurora aura + antenna ping */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Plant Assistant"
        className={cn(
          'group fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50',
          'h-14 w-14 sm:h-16 sm:w-16 rounded-full',
          'flex items-center justify-center transition-all duration-300',
          'hover:scale-110 active:scale-95',
          open && 'rotate-180 scale-95'
        )}
      >
        {/* Outer pulsing aurora rings */}
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400 via-violet-500 to-pink-500 opacity-70 blur-md animate-pulse" />
        <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-pink-500/40 via-violet-500/40 to-cyan-400/40 blur-lg animate-[ping_2.5s_ease-in-out_infinite]" />

        {/* Conic-spin border ring */}
        <span
          className="absolute inset-0 rounded-full opacity-90"
          style={{
            background: 'conic-gradient(from 0deg, #22d3ee, #a78bfa, #ec4899, #22d3ee)',
            animation: 'spin 4s linear infinite',
            WebkitMask: 'radial-gradient(closest-side, transparent 70%, #000 72%)',
                    mask: 'radial-gradient(closest-side, transparent 70%, #000 72%)',
          }}
        />

        {/* Inner robot body */}
        <span className={cn(
          'relative h-11 w-11 sm:h-12 sm:w-12 rounded-full',
          'bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900',
          'flex items-center justify-center shadow-2xl shadow-violet-500/50',
          'ring-2 ring-white/20'
        )}>
          {open ? (
            <X className="h-5 w-5 sm:h-6 sm:w-6 text-pink-300" />
          ) : (
            <Bot className="h-6 w-6 sm:h-7 sm:w-7 text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)] group-hover:text-pink-300 group-hover:drop-shadow-[0_0_8px_rgba(236,72,153,0.9)] transition-colors duration-300" />
          )}

          {/* Live "eye" dot — blinks */}
          {!open && (
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.7)] animate-pulse" />
          )}
        </span>

        {/* Antenna with ping */}
        {!open && (
          <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-pink-500 shadow-[0_0_6px_rgba(236,72,153,0.8)]" />
            </span>
          </span>
        )}
      </button>

      {/* Popover Panel — fullscreen-ish on mobile, anchored card on desktop */}
      {open && (
        <div
          className={cn(
            'fixed z-50 transition-all duration-300',
            // mobile: take most of the screen above the FAB
            'inset-x-2 bottom-20 top-4',
            // desktop: anchored card
            'sm:inset-auto sm:bottom-24 sm:right-5 sm:top-auto sm:w-[420px]',
            'animate-in slide-in-from-bottom-5 fade-in'
          )}
        >
          <div className="relative h-full">
            <button
              onClick={() => {
                setOpen(false);
                navigate('/assistant');
              }}
              aria-label="Open full page"
              className="absolute -top-2 -left-2 z-10 bg-gradient-to-br from-cyan-500 to-violet-500 text-white rounded-full p-1.5 shadow-lg shadow-violet-500/40 hover:scale-110 transition"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <PlantAssistant variant="compact" onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingAssistantButton;
