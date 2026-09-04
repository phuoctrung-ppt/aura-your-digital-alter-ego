import { z } from 'zod';

export const VoiceDTOSchema = z.object({
  id: z.string().describe('Unique identifier for the voice'),
  name: z.string().describe('Display name of the voice'),
  provider: z.string().describe('AI provider offering this voice'),
  locale: z.string().describe('BCP-47 locale code'),
  isRecommended: z.boolean().describe('Whether this voice is recommended for the persona'),
});

export type VoiceDTO = z.infer<typeof VoiceDTOSchema>;

export const VoicePreferenceDTOSchema = z.object({
  voiceId: z.string().describe('ID of the preferred voice'),
});

export type VoicePreferenceDTO = z.infer<typeof VoicePreferenceDTOSchema>;
