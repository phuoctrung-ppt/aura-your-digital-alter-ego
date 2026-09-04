import { VoicePreferenceDTO } from "@aura/contracts";
import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UsersService } from "../../users/users.service";
import { VoiceService } from "../services/voice.service";

@Controller("me/voices")
export class VoiceController {
  constructor(
    private readonly voiceService: VoiceService,
    private readonly usersService: UsersService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async listVoices(@CurrentUser() user: any, @Query("locale") locale?: string) {
    const targetLocale = locale || user.locale || "vi-VN";
    return {
      data: await this.voiceService.listVoices(targetLocale),
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post("preview")
  async previewVoice(@Body("voiceId") voiceId: string) {
    if (!voiceId) {
      throw new Error("voiceId is required");
    }
    return {
      data: await this.voiceService.getPreview(voiceId),
      error: null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch("preference")
  async updatePreference(
    @CurrentUser() user: any,
    @Body() body: VoicePreferenceDTO,
  ) {
    const { voiceId } = body;
    await this.usersService.updateVoicePreference(user.userId, voiceId);
    return {
      data: { success: true },
      error: null,
    };
  }
}
