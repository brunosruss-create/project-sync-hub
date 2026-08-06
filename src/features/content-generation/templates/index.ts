// Ponto de entrada que garante que todos os templates sejam registrados.
// Cada import tem side effect que popula o registry.
// Importar este módulo antes de consultar getTemplate/pickTemplate.

import "./promo/promo-01-1x1";
import "./promo/promo-01-9x16";
import "./novidade/novidade-01-1x1";
import "./novidade/novidade-01-9x16";
import "./depoimento/depoimento-01-1x1";
import "./depoimento/depoimento-01-9x16";
import "./agenda/agenda-01-1x1";
import "./agenda/agenda-01-9x16";
import "./dica/dica-01-1x1";
import "./dica/dica-01-9x16";
import "./institucional/institucional-01-1x1";
import "./institucional/institucional-01-9x16";
import "./antes_depois/antes-depois-01-1x1";
import "./antes_depois/antes-depois-01-9x16";
import "./catalogo/catalogo-01-1x1";
import "./catalogo/catalogo-01-9x16";

export * from "./registry";
