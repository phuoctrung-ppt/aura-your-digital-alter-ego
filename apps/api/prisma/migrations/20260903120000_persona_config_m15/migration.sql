-- M15 PersonaConfig: required tone + supportedLanguages + voiceByLocale on personas.
--
-- UP strategy (safe with existing seeded rows):
--   1) Add new JSONB columns as nullable
--   2) Backfill MVP persona slugs (and any other rows) with bilingual defaults
--   3) Ensure tone is populated for all rows, then SET NOT NULL on tone /
--      supportedLanguages / voiceByLocale
--
-- ROLLBACK / DOWN (manual — Prisma does not emit down SQL):
--   ALTER TABLE "personas" ALTER COLUMN "tone" DROP NOT NULL;
--   ALTER TABLE "personas" DROP COLUMN IF EXISTS "voiceByLocale";
--   ALTER TABLE "personas" DROP COLUMN IF EXISTS "supportedLanguages";
--   -- tone remains nullable as in 20260818071238_init
--
-- Wire shapes (validate in app with @aura/contracts Zod, not DB CHECKs for MVP):
--   tone: { style, pressure, corrections }
--   supportedLanguages: ["vi","en"]
--   voiceByLocale: { vi: { gender, providerVoiceId }, en: { ... } }

-- AlterTable: add new columns nullable first
ALTER TABLE "personas" ADD COLUMN "supportedLanguages" JSONB;
ALTER TABLE "personas" ADD COLUMN "voiceByLocale" JSONB;

-- Backfill tough-interviewer (male / firm Neural2 voices)
UPDATE "personas"
SET
  "tone" = COALESCE(
    "tone",
    '{"style":"tough","pressure":"high","corrections":"in-flow"}'::jsonb
  ),
  "supportedLanguages" = '["vi","en"]'::jsonb,
  "voiceByLocale" = '{
    "vi": {"gender":"male","providerVoiceId":"vi-VN-Neural2-D"},
    "en": {"gender":"male","providerVoiceId":"en-US-Neural2-D"}
  }'::jsonb
WHERE "slug" = 'tough-interviewer';

-- Backfill native-buddy (female / friendly Neural2 voices)
UPDATE "personas"
SET
  "tone" = COALESCE(
    "tone",
    '{"style":"friendly","pressure":"low","corrections":"in-flow"}'::jsonb
  ),
  "supportedLanguages" = '["vi","en"]'::jsonb,
  "voiceByLocale" = '{
    "vi": {"gender":"female","providerVoiceId":"vi-VN-Neural2-A"},
    "en": {"gender":"female","providerVoiceId":"en-US-Neural2-C"}
  }'::jsonb
WHERE "slug" = 'native-buddy';

-- Safety net for any non-MVP rows (should not exist in MVP DBs)
UPDATE "personas"
SET
  "tone" = COALESCE(
    "tone",
    '{"style":"warm","pressure":"medium","corrections":"in-flow"}'::jsonb
  ),
  "supportedLanguages" = COALESCE("supportedLanguages", '["vi","en"]'::jsonb),
  "voiceByLocale" = COALESCE(
    "voiceByLocale",
    '{
      "vi": {"gender":"neutral","providerVoiceId":"vi-VN-Neural2-A"},
      "en": {"gender":"neutral","providerVoiceId":"en-US-Neural2-A"}
    }'::jsonb
  )
WHERE "supportedLanguages" IS NULL
   OR "voiceByLocale" IS NULL
   OR "tone" IS NULL;

-- Enforce required columns
ALTER TABLE "personas" ALTER COLUMN "tone" SET NOT NULL;
ALTER TABLE "personas" ALTER COLUMN "supportedLanguages" SET NOT NULL;
ALTER TABLE "personas" ALTER COLUMN "voiceByLocale" SET NOT NULL;
