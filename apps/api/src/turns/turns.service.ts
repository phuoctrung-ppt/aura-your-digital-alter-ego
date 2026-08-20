import { ConflictException, Injectable } from "@nestjs/common";
import {
  ErrorCodes,
  type CreateTurnFormFields,
  type TurnResponse,
} from "@aura/contracts";
import {
  AiOrchestratorService,
  type TurnAudioUpload,
} from "../ai/orchestrator/ai-orchestrator.service";
import { AppLogger } from "../common";
import { SessionsService } from "../sessions/sessions.service";

/**
 * Turns service — session gates + delegate to AiOrchestratorService.
 */
@Injectable()
export class TurnsService {
  private readonly logger = new AppLogger(TurnsService.name);

  constructor(
    private readonly orchestrator: AiOrchestratorService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * Create a sync voice turn for an open session owned by the user.
   */
  async createTurn(
    userId: string,
    sessionId: string,
    fields: CreateTurnFormFields,
    audio: TurnAudioUpload,
  ): Promise<TurnResponse> {
    // Ownership: findOwnedWithPersona → 404 SESSION_NOT_FOUND
    const session = await this.sessions.findOwnedWithPersona(userId, sessionId);
    if (session.status === "ended") {
      throw new ConflictException({
        code: ErrorCodes.SESSION_CLOSED,
        message: "Session is closed",
      });
    }

    this.logger.log(
      `turns.create userId=${userId} sessionId=${sessionId} bytes=${audio.size}`,
    );
    return this.orchestrator.runTurn({
      userId,
      sessionId,
      fields,
      audio,
    });
  }
}
