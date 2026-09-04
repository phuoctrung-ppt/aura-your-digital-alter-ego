import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { TtsProvider } from "../interfaces/tts-provider";
import { TTS_PROVIDER } from "../tokens";
import type { VoiceDTO } from "@aura/contracts";
import { AppLogger } from "../../common";

@Injectable()
export class VoiceService {
  private readonly logger = new AppLogger(VoiceService.name);

  constructor(
    @Inject(TTS_PROVIDER) private readonly ttsProvider: TtsProvider,
  ) {}

  async listVoices(locale: string): Promise<VoiceDTO[]> {
    this.logger.log(`Fetching voices for locale=${locale}`);
    return this.ttsProvider.listVoices(locale);
  }

  async getPreview(voiceId: string): Promise<{ audioUri: string }> {
    this.logger.log(`Generating preview for voiceId=${voiceId}`);

    const welcomePhrase = "Xin chào, tôi là Aura";

    try {
      const result = await this.ttsProvider.synthesize({
        text: welcomePhrase,
        voice: voiceId,
      });

      return { audioUri: result.audioUri };
    } catch (err) {
      this.logger.error(`Preview generation failed for voiceId=${voiceId}: ${err}`);
      throw new NotFoundException(`Voice ${voiceId} not found or unavailable`);
    }
  }
}
