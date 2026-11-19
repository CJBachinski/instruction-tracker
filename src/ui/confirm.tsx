import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

interface Ask {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, the dialog also collects a short piece of text (e.g. a reason). */
  inputLabel?: string;
}

type Answer = { ok: boolean; text: string };

/**
 * A promise-based confirmation dialog in the app's own style.
 * `const [ask, dialog] = useConfirm()`, render `dialog`, then `if ((await ask({...})).ok) …`.
 */
export function useConfirm(): [(a: Ask) => Promise<Answer>, ReactNode] {
  const [current, setCurrent] = useState<Ask | null>(null);
  const [text, setText] = useState("");
  const resolver = useRef<((a: Answer) => void) | undefined>(undefined);

  const ask = useCallback((a: Ask) => {
    setText("");
    setCurrent(a);
    return new Promise<Answer>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.({ ok, text });
    resolver.current = undefined;
    setCurrent(null);
  };

  const dialog = (
    <AlertDialog open={!!current} onOpenChange={(open) => !open && finish(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{current?.title}</AlertDialogTitle>
          {current?.description && <AlertDialogDescription>{current.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {current?.inputLabel && (
          <Textarea
            aria-label={current.inputLabel}
            placeholder={current.inputLabel}
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(false)}>{current?.cancelLabel ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction variant={current?.destructive ? "destructive" : "default"} onClick={() => finish(true)}>
            {current?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [ask, dialog];
}
