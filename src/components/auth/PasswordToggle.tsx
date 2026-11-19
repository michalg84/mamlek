import { Eye, EyeOff } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "text-muted-foreground hover:text-foreground absolute top-1/2 right-1 size-8 -translate-y-1/2",
      )}
      aria-label={visible ? "Ukryj hasło" : "Pokaż hasło"}
    >
      {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </button>
  );
}
