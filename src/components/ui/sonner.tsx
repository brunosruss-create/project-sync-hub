import { Toaster as Sonner } from "sonner";

export const Toaster = (props: React.ComponentProps<typeof Sonner>) => (
  <Sonner
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
        description: "group-[.toast]:text-muted-foreground",
        actionButton:
          "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
      },
    }}
    {...props}
  />
);
