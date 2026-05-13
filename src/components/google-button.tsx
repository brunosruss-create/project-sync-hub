import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function GoogleButton({ label }: { label: string }) {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = React.useState(false);

  const handleClick = async () => {
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setLoading(false);
      toast.error(error.message);
    }
    // on success, browser navigates away
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path
            fill="currentColor"
            d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.5-4.8 9.5-7.4 0-.5 0-.9-.1-1.3H12z"
          />
        </svg>
      )}
      {label}
    </Button>
  );
}
