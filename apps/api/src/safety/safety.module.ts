import { Module } from "@nestjs/common";
import { SafetyService } from "./safety.service";

/**
 * Safety module — classifiers + mode policy for voice turns.
 * Scaffold: service methods throw 501; no classifier HTTP / keyword lists yet.
 */
@Module({
  providers: [SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}
