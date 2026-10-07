"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AudienceConflict } from "@/lib/audience";

export function MoveConfirmDialog({ open, conflicts, loading, onCancel, onConfirm }: { open: boolean; conflicts: AudienceConflict[]; loading: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <AlertDialog open={open} onOpenChange={(value) => !value && !loading && onCancel()}><AlertDialogContent><AlertDialogHeader><div className="mb-2 grid size-11 place-items-center rounded-full bg-amber-100 text-amber-700"><AlertTriangle className="size-5" /></div><AlertDialogTitle>Mover contatos para este fluxo?</AlertDialogTitle><AlertDialogDescription>{conflicts.length} contato(s) já participam de outra sequência ativa. Confirmar pausará o vínculo anterior e iniciará este fluxo.</AlertDialogDescription></AlertDialogHeader><div className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-[#f7f9f8] p-3">{conflicts.slice(0, 8).map((conflict) => <div key={`${conflict.contactId}-${conflict.sequenceId}`} className="text-sm"><strong>{conflict.contactName}</strong><span className="block text-xs text-[#71827a]">Sai de: {conflict.sequenceName}</span></div>)}{conflicts.length > 8 && <p className="text-xs text-[#71827a]">E mais {conflicts.length - 8} contato(s).</p>}</div><AlertDialogFooter><AlertDialogCancel disabled={loading}>Manter como está</AlertDialogCancel><Button type="button" disabled={loading} onClick={onConfirm} className="bg-amber-600 text-white hover:bg-amber-700">{loading && <Loader2 className="mr-2 size-4 animate-spin" />}Confirmar movimentação</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
