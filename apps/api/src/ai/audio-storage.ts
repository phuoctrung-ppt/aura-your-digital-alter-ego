import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

/**
 * Local filesystem audio blob storage under AUDIO_STORAGE_PATH.
 * Path shape: `{root}/{sessionId}/{turnId}-{role}.{ext}`
 * S3-compatible driver can replace this later without changing client protocol (SP-3).
 */
@Injectable()
export class AudioStorage {
  constructor(private readonly config: ConfigService) {}

  root(): string {
    return (
      this.config.get<string>("AUDIO_STORAGE_PATH")?.trim() ||
      join(process.cwd(), ".aura-audio")
    );
  }

  sessionDir(sessionId: string): string {
    return join(this.root(), sessionId);
  }

  turnPath(
    sessionId: string,
    turnId: string,
    role: "user" | "assistant",
    ext: string,
  ): string {
    const safeExt = ext.replace(/^\./, "").toLowerCase() || "m4a";
    return join(this.sessionDir(sessionId), `${turnId}-${role}.${safeExt}`);
  }

  async ensureSessionDir(sessionId: string): Promise<string> {
    const dir = this.sessionDir(sessionId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async writeBytes(
    sessionId: string,
    turnId: string,
    role: "user" | "assistant",
    bytes: Buffer,
    ext: string,
  ): Promise<string> {
    await this.ensureSessionDir(sessionId);
    const path = this.turnPath(sessionId, turnId, role, ext);
    await writeFile(path, bytes);
    return path;
  }

  /**
   * Move/copy an existing file (e.g. TTS temp) into the canonical turn path.
   */
  async placeFile(
    sessionId: string,
    turnId: string,
    role: "user" | "assistant",
    sourcePath: string,
    ext?: string,
  ): Promise<string> {
    await this.ensureSessionDir(sessionId);
    const resolvedExt =
      ext?.replace(/^\./, "") ||
      extname(sourcePath).replace(/^\./, "") ||
      "wav";
    const dest = this.turnPath(sessionId, turnId, role, resolvedExt);
    try {
      await rename(sourcePath, dest);
    } catch {
      await copyFile(sourcePath, dest);
    }
    return dest;
  }
}

/** Map MIME → file extension for storage. */
export function extFromMime(mimeType: string, originalname?: string): string {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("wav") || mime.includes("wave")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  const fromName = originalname ? extname(originalname).replace(/^\./, "") : "";
  if (fromName) return fromName.toLowerCase();
  return "m4a";
}
