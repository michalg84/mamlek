import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pending: boolean;
  pendingText: string;
  children: ReactNode;
}

export function SubmitButton({ pending, pendingText, children }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={pending} className="min-h-11 w-full">
      {pending ? (
        <>
          <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
