import type { PersonaSlug } from "@aura/contracts";
import { homeCopy } from "./copy";

/** VN display name for MVP personas (Home / Session / History). */
export function personaLabel(slug: PersonaSlug | string | undefined): string {
  if (slug === "native-buddy") {
    return homeCopy.persona.native_buddy.name;
  }
  if (slug === "tough-interviewer") {
    return homeCopy.persona.tough_interviewer.name;
  }
  return "Aura";
}
