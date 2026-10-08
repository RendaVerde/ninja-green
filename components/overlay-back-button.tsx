"use client";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export function OverlayBackButton({ onClick, inverse = false }: { onClick: () => void; inverse?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Voltar"
      className={`size-11 shrink-0 rounded-full ${inverse ? "text-white hover:bg-white/10 hover:text-white" : "text-[#294b3e]"}`}
    >
      <ArrowLeft className="size-5" />
    </Button>
  );
}
