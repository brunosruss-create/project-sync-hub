// Whitelist de fontes suportadas pelo módulo de geração de conteúdo.
// Toda fonte listada aqui precisa ter um pacote @expo-google-fonts/* instalado
// e um arquivo TTF Regular disponível no bundle.

export const DISPLAY_FONTS = [
  "Playfair Display",
  "Bebas Neue",
  "Montserrat",
  "Poppins",
  "Oswald",
] as const;
export type DisplayFont = (typeof DISPLAY_FONTS)[number];

export const BODY_FONTS = [
  "Inter",
  "DM Sans",
  "Lato",
  "Nunito",
] as const;
export type BodyFont = (typeof BODY_FONTS)[number];

export const SCRIPT_FONTS = [
  "Dancing Script",
  "Caveat",
] as const;
export type ScriptFont = (typeof SCRIPT_FONTS)[number];

export const ALL_FONTS = [
  ...DISPLAY_FONTS,
  ...BODY_FONTS,
  ...SCRIPT_FONTS,
] as const;
export type AnyFont = (typeof ALL_FONTS)[number];

export function isValidDisplayFont(name: string): name is DisplayFont {
  return (DISPLAY_FONTS as readonly string[]).includes(name);
}

export function isValidBodyFont(name: string): name is BodyFont {
  // Body pode ser tanto BODY_FONTS quanto SCRIPT_FONTS (para estilos manuscritos).
  return (
    (BODY_FONTS as readonly string[]).includes(name) ||
    (SCRIPT_FONTS as readonly string[]).includes(name)
  );
}
