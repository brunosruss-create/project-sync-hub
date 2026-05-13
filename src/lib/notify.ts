import { toast } from "sonner";

const friendly = (err: unknown, fallback = "Algo deu errado. Tente novamente.") => {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    if (/network|fetch|timeout/i.test(err.message)) return "Sem conexão com o servidor.";
    return err.message;
  }
  return fallback;
};

export const notify = {
  success: (message: string, description?: string) =>
    toast.success(message, { description, duration: 4000 }),
  error: (err: unknown, description?: string) =>
    toast.error(friendly(err), { description, duration: 6000 }),
  info: (message: string, description?: string) =>
    toast(message, { description, duration: 4000 }),
  loading: (message: string) => toast.loading(message),
  dismiss: (id?: string | number) => toast.dismiss(id),
};
