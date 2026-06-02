import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div
      key={pathname}
      className="animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      {children}
    </div>
  );
}