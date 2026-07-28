import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const SIZE_WIDTH: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 400,
  md: 520,
  lg: 640,
  xl: 800,
};

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Wrapper fino sobre os primitivos Radix de dialog.tsx — existe porque nenhum
 * dos modais do app usa o padrão DialogTrigger (todos são controlados por
 * state local do pai, tipo `const [open, setOpen] = useState(false)`).
 * Substitui o padrão de cada modal reimplementar seu próprio overlay/z-index.
 */
export function Modal({ open, onOpenChange, title, description, size = "md", footer, children }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: SIZE_WIDTH[size] }}>
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        {children && (
          <div className="flex-1 overflow-y-auto" style={{ padding: 20 }}>
            {children}
          </div>
        )}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
