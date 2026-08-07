// Design DNA por segmento/nicho — paleta, tipografia, mood e estilo fotográfico.
// Baseado em análise de posts de referência do BestContent (concorrente).
//
// Objetivo: transformar "Salão de Beleza" em algo VISUALMENTE distinto de
// "Barbearia" — mesmo que ambos sejam beleza, o mood, paleta e tipografia
// mudam completamente pra evocar aspiracional feminino vs urbano masculino.
//
// Usado pelo Gemini (como contexto pro prompt de copy + imageDescription) e
// pelo Flux (como estilo fotográfico) e pelo editor (fonte e cores default).

export interface DesignDNA {
  segment: string;
  /** Paleta de cores da marca sugerida (pode ser sobrescrita pelo BrandKit). */
  palette: {
    primary: string;
    secondary: string;
    support: string;
    accent: string;
    /** Cor do texto de destaque (uma palavra do hook). */
    highlight: string;
  };
  /** Fonte display (títulos). Sugerida — cliente pode trocar. */
  displayFont: string;
  /** Fonte body (parágrafos, CTA). */
  bodyFont: string;
  /** Estilo tipográfico: serif elegante, sans chunky, tech, etc. */
  typographyStyle:
    | "serif-elegant"
    | "sans-chunky"
    | "sans-modern"
    | "sans-tech"
    | "condensed-bold"
    | "italic-refined";
  /** Mood do post em português (pra Gemini). */
  moodPt: string;
  /** Instruções de estilo fotográfico em inglês (pra Flux). */
  photoStyleEn: string;
  /** Descritor de sujeito padrão em inglês (fallback pra imageDescription). */
  subjectHintEn: string;
  /** Cor dominante da atmosfera (pro Flux entender ambiente). */
  atmosphereEn: string;
}

/**
 * Presets baseados nos 15 segmentos cadastrados na tabela `ai_segments`.
 * Se `profile.segment` for null ou "Outro / Personalizado", usa DEFAULT_DNA.
 */
export const DESIGN_DNA_BY_SEGMENT: Record<string, DesignDNA> = {
  "Clínica de Estética": {
    segment: "Clínica de Estética",
    palette: {
      primary: "#8B4B7C",
      secondary: "#F5EEE8",
      support: "#D4A574",
      accent: "#4A2C4A",
      highlight: "#D4A574",
    },
    displayFont: "Playfair Display",
    bodyFont: "Inter",
    typographyStyle: "serif-elegant",
    moodPt: "elegante, sofisticada, aspiracional, feminina, luxuosa",
    photoStyleEn:
      "high-end editorial beauty photography, soft warm lighting, luxurious minimalist aesthetic clinic interior, professional retouching, aspirational lifestyle magazine style, cinematic depth of field, hyper-detailed",
    subjectHintEn:
      "elegant woman receiving aesthetic treatment in a modern minimalist beauty clinic",
    atmosphereEn: "warm cream and gold tones, luxurious ambient lighting",
  },
  "Consultório Médico": {
    segment: "Consultório Médico",
    palette: {
      primary: "#0F4C81",
      secondary: "#F8FAFC",
      support: "#38BDF8",
      accent: "#082F49",
      highlight: "#38BDF8",
    },
    displayFont: "Inter",
    bodyFont: "Inter",
    typographyStyle: "sans-modern",
    moodPt: "confiança, profissionalismo, cuidado, ciência, acolhimento",
    photoStyleEn:
      "professional medical photography, bright clean clinic lighting, modern healthcare interior, doctor patient interaction, trustworthy atmosphere, editorial quality, sharp focus",
    subjectHintEn:
      "friendly professional doctor consulting a patient in a modern clean medical office",
    atmosphereEn: "clean bright whites and medical blues, professional lighting",
  },
  "Odontologia": {
    segment: "Odontologia",
    palette: {
      primary: "#0891B2",
      secondary: "#F0FDFA",
      support: "#67E8F9",
      accent: "#083344",
      highlight: "#67E8F9",
    },
    displayFont: "Inter",
    bodyFont: "Inter",
    typographyStyle: "sans-modern",
    moodPt: "sorriso, confiança, higiene, modernidade",
    photoStyleEn:
      "modern dental clinic photography, bright clean lighting, confident smiling patient, professional dentist, editorial healthcare style, sharp detail",
    subjectHintEn:
      "confident smiling person after professional dental treatment in modern clinic",
    atmosphereEn: "crisp clean whites and cyan blues",
  },
  "Laboratório de Análises": {
    segment: "Laboratório de Análises",
    palette: {
      primary: "#1E40AF",
      secondary: "#EFF6FF",
      support: "#F97316",
      accent: "#1E3A8A",
      highlight: "#F97316",
    },
    displayFont: "Inter",
    bodyFont: "Inter",
    typographyStyle: "sans-tech",
    moodPt: "precisão, ciência, tecnologia, confiabilidade",
    photoStyleEn:
      "clinical laboratory photography, sterile modern lab environment, precise technical equipment, professional lab technician, blue-white lighting, hyper-detailed",
    subjectHintEn:
      "professional lab technician working in a modern high-tech medical laboratory",
    atmosphereEn: "cool blues and sterile whites, precise clinical lighting",
  },
  "Salão de Beleza": {
    segment: "Salão de Beleza",
    palette: {
      primary: "#701A75",
      secondary: "#FDF4FF",
      support: "#F59E0B",
      accent: "#3B0764",
      highlight: "#F59E0B",
    },
    displayFont: "Playfair Display",
    bodyFont: "Inter",
    typographyStyle: "serif-elegant",
    moodPt: "elegância, sofisticação, transformação, aspiracional, feminino",
    photoStyleEn:
      "high-end editorial hair salon photography, warm golden hour lighting, luxurious salon interior with mirrors and marble, aspirational fashion magazine style, professional retouching, cinematic shallow depth of field, hyper-detailed 8k",
    subjectHintEn:
      "beautiful woman with styled hair in a modern luxury hair salon with warm ambient lighting",
    atmosphereEn: "warm gold and rose tones, luxurious ambient lighting",
  },
  "Barbearia": {
    segment: "Barbearia",
    palette: {
      primary: "#1C1917",
      secondary: "#FEF3C7",
      support: "#B45309",
      accent: "#000000",
      highlight: "#F59E0B",
    },
    displayFont: "Bebas Neue",
    bodyFont: "Inter",
    typographyStyle: "condensed-bold",
    moodPt: "masculino, urbano, tradicional, autêntico, atitude",
    photoStyleEn:
      "moody masculine barbershop photography, warm amber lighting, vintage industrial aesthetic, cinematic style, professional male grooming, dark atmospheric background, sharp detail on face and hair",
    subjectHintEn:
      "confident man getting a haircut in a stylish vintage barbershop with warm amber lighting",
    atmosphereEn: "deep browns and warm amber tones, dramatic side lighting",
  },
  "Oficina Mecânica": {
    segment: "Oficina Mecânica",
    palette: {
      primary: "#DC2626",
      secondary: "#1C1917",
      support: "#F59E0B",
      accent: "#7F1D1D",
      highlight: "#FBBF24",
    },
    displayFont: "Oswald",
    bodyFont: "Inter",
    typographyStyle: "condensed-bold",
    moodPt: "força, confiança, expertise técnica, robustez",
    photoStyleEn:
      "industrial auto workshop photography, dramatic side lighting, professional mechanic, high-end automotive detailing, cinematic dark atmosphere, hyper-detailed metallic textures",
    subjectHintEn:
      "expert mechanic working on a car in a professional auto shop with dramatic lighting",
    atmosphereEn: "deep reds, industrial blacks, warm workshop lighting",
  },
  "Lava-rápido e Estética Automotiva": {
    segment: "Lava-rápido e Estética Automotiva",
    palette: {
      primary: "#0369A1",
      secondary: "#0C4A6E",
      support: "#F59E0B",
      accent: "#0F172A",
      highlight: "#38BDF8",
    },
    displayFont: "Oswald",
    bodyFont: "Inter",
    typographyStyle: "condensed-bold",
    moodPt: "brilho, cuidado, premium, atenção aos detalhes",
    photoStyleEn:
      "high-end automotive detailing photography, dramatic studio lighting on glossy car paint, cinematic style, water droplets and reflection details, professional car aesthetics, hyper-detailed shine",
    subjectHintEn:
      "pristine luxury car with glossy paint being detailed in a modern car wash",
    atmosphereEn: "deep blues with metallic reflections and water sparkle",
  },
  "Academia e Personal": {
    segment: "Academia e Personal",
    palette: {
      primary: "#F59E0B",
      secondary: "#0A0A0A",
      support: "#EF4444",
      accent: "#78350F",
      highlight: "#FBBF24",
    },
    displayFont: "Impact",
    bodyFont: "Inter",
    typographyStyle: "sans-chunky",
    moodPt: "energia, potência, motivação, superação, força",
    photoStyleEn:
      "dynamic fitness photography, dramatic gym lighting with rim light, cinematic style, athletic body in motion, intense energy, sweat and muscle definition, professional sports magazine quality, hyper-detailed",
    subjectHintEn:
      "athletic person doing intense workout in a modern gym with dramatic lighting",
    atmosphereEn: "high-contrast black backgrounds with amber rim lighting",
  },
  "Clínica de Fisioterapia": {
    segment: "Clínica de Fisioterapia",
    palette: {
      primary: "#0D9488",
      secondary: "#F0FDFA",
      support: "#F59E0B",
      accent: "#134E4A",
      highlight: "#5EEAD4",
    },
    displayFont: "Inter",
    bodyFont: "Inter",
    typographyStyle: "sans-modern",
    moodPt: "cuidado, recuperação, movimento, acolhimento, profissional",
    photoStyleEn:
      "professional physiotherapy clinic photography, bright natural lighting, therapist assisting patient with rehabilitation exercise, modern rehabilitation equipment, empathetic atmosphere, editorial healthcare quality",
    subjectHintEn:
      "professional physiotherapist helping patient with rehabilitation in modern clinic",
    atmosphereEn: "soft teal and warm neutrals, bright natural lighting",
  },
  "Assistência Técnica": {
    segment: "Assistência Técnica",
    palette: {
      primary: "#1E40AF",
      secondary: "#F1F5F9",
      support: "#F97316",
      accent: "#0F172A",
      highlight: "#F97316",
    },
    displayFont: "Inter",
    bodyFont: "Inter",
    typographyStyle: "sans-tech",
    moodPt: "confiança técnica, expertise, precisão, agilidade",
    photoStyleEn:
      "professional tech repair workshop photography, focused lighting on hands working with precision tools, modern electronics, expert technician, editorial technology style, sharp detail",
    subjectHintEn:
      "expert technician repairing electronic device with precision tools in a modern workshop",
    atmosphereEn: "cool tech blues with orange accent lighting",
  },
  "Clínica Veterinária": {
    segment: "Clínica Veterinária",
    palette: {
      primary: "#7C3AED",
      secondary: "#FAF5FF",
      support: "#F59E0B",
      accent: "#3B0764",
      highlight: "#A78BFA",
    },
    displayFont: "Inter",
    bodyFont: "Inter",
    typographyStyle: "sans-modern",
    moodPt: "carinho, cuidado, alegria, confiança com animais",
    photoStyleEn:
      "professional veterinary clinic photography, warm natural lighting, gentle interaction between vet and pet, happy pets, modern welcoming clinic, editorial pet magazine style, sharp emotional detail",
    subjectHintEn:
      "caring veterinarian examining a happy pet in a modern welcoming veterinary clinic",
    atmosphereEn: "warm lavender and cream tones, soft natural lighting",
  },
  "Nutrição e Dietética": {
    segment: "Nutrição e Dietética",
    palette: {
      primary: "#16A34A",
      secondary: "#F0FDF4",
      support: "#F59E0B",
      accent: "#14532D",
      highlight: "#4ADE80",
    },
    displayFont: "Playfair Display",
    bodyFont: "Inter",
    typographyStyle: "serif-elegant",
    moodPt: "saúde, natureza, equilíbrio, bem-estar, vitalidade",
    photoStyleEn:
      "editorial food and nutrition photography, natural daylight, fresh healthy ingredients artfully arranged, wooden and marble surfaces, aspirational wellness lifestyle, cinematic depth of field, hyper-detailed textures",
    subjectHintEn:
      "colorful fresh healthy food beautifully arranged on natural wooden table with sunlight",
    atmosphereEn: "fresh greens and warm woods with natural sunlight",
  },
  "Psicologia e Terapia": {
    segment: "Psicologia e Terapia",
    palette: {
      primary: "#4F46E5",
      secondary: "#EEF2FF",
      support: "#F59E0B",
      accent: "#312E81",
      highlight: "#A5B4FC",
    },
    displayFont: "Playfair Display",
    bodyFont: "Inter",
    typographyStyle: "italic-refined",
    moodPt: "acolhimento, introspecção, cuidado emocional, calma, empatia",
    photoStyleEn:
      "warm therapy office photography, soft natural window lighting, cozy interior with plants and books, empathetic professional atmosphere, editorial mental health style, cinematic shallow depth of field",
    subjectHintEn:
      "peaceful person in warm cozy therapy office with soft natural lighting and plants",
    atmosphereEn: "muted indigo and warm cream tones, soft diffused light",
  },
  "Advocacia e Jurídico": {
    segment: "Advocacia e Jurídico",
    palette: {
      primary: "#1E293B",
      secondary: "#F8FAFC",
      support: "#B45309",
      accent: "#020617",
      highlight: "#F59E0B",
    },
    displayFont: "Playfair Display",
    bodyFont: "Inter",
    typographyStyle: "serif-elegant",
    moodPt: "seriedade, tradição, confiança, autoridade, profissionalismo",
    photoStyleEn:
      "high-end law office photography, dramatic warm lighting, elegant wood and leather interior, professional lawyer in formal attire, cinematic corporate style, hyper-detailed textures",
    subjectHintEn:
      "confident professional lawyer in elegant law office with warm ambient lighting",
    atmosphereEn: "deep navy and warm gold tones, dramatic library lighting",
  },
};

const DEFAULT_DNA: DesignDNA = {
  segment: "Genérico",
  palette: {
    primary: "#0F172A",
    secondary: "#F8FAFC",
    support: "#F59E0B",
    accent: "#020617",
    highlight: "#F59E0B",
  },
  displayFont: "Montserrat",
  bodyFont: "Inter",
  typographyStyle: "sans-modern",
  moodPt: "profissional, confiável, moderno",
  photoStyleEn:
    "professional editorial photography, cinematic lighting, aspirational lifestyle, hyper-detailed 8k",
  subjectHintEn: "professional business setting with confident person",
  atmosphereEn: "professional lighting and clean modern setting",
};

/**
 * Retorna o DNA apropriado para o segmento do workspace.
 * Se o segmento não bater com nenhum preset (ex: "Outro / Personalizado"),
 * cai no DEFAULT_DNA.
 */
export function getDesignDNA(segment: string | null | undefined): DesignDNA {
  if (!segment) return DEFAULT_DNA;
  const match = DESIGN_DNA_BY_SEGMENT[segment];
  return match ?? DEFAULT_DNA;
}
