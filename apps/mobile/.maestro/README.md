# Maestro smoke flows (M12 / T-M12-02)

Local mobile smoke for Aura MVP critical path. **Not** a required CI gate in M12 —
`pnpm --filter @aura/mobile typecheck` remains the merge gate. Maestro is documented
and runnable locally (optional non-blocking CI only if zero-flake).

## Install

```bash
# Recommended installer
curl -Ls "https://get.maestro.mobile.dev" | bash
# or: brew tap mobile-dev-inc/tap && brew install maestro
# or: npm i -g @maestro/cli
maestro --version
```

See https://maestro.mobile.dev for Android/iOS device / emulator prerequisites.

## Env

Run the Expo app with the mock API flag so login + personas + PTT do not need a live backend:

```bash
cd apps/mobile
EXPO_PUBLIC_API_MOCK=1 pnpm start
# then launch the build on the simulator / emulator Maestro targets
```

`EXPO_PUBLIC_API_MOCK` is read in `apps/mobile/src/lib/config.ts`.
When enabled, `SessionProvider` accepts local mock login/register (no `POST /v1/auth/*`).

## Run

From repo root:

```bash
EXPO_PUBLIC_API_MOCK=1 maestro test apps/mobile/.maestro/smoke-login-persona-session.yaml
```

Or from `apps/mobile`:

```bash
EXPO_PUBLIC_API_MOCK=1 maestro test .maestro/smoke-login-persona-session.yaml
```

## Flows

| File | Intent |
|---|---|
| `smoke-login-persona-session.yaml` | login → 2 personas → session circle avatar + PTT + end-call (mock) |

## Selectors / testIDs

Stable `testID`s (preferred by the YAML flow):

| testID | Surface |
|---|---|
| `login-email` | Login email field |
| `login-password` | Login password field |
| `login-submit` | Đăng nhập CTA |
| `persona-tough-interviewer` | Tough Interviewer card |
| `persona-native-buddy` | Native Buddy card |
| `session-language-picker` | Home language pick before start (M15) |
| `session-circle-avatar` | Calling-UI circle presence (M15) |
| `session-waveform` | Talk/listen waveform (M15) |
| `session-mic-affordance` | Mic chrome (decorative) |
| `ptt-button` | Hold-to-talk control |
| `session-end-call` | End-call CTA (M15) |
| `session-locale-chip` | In-session locale chip (M15) |

VN copy remains asserted as secondary (`Người phỏng vấn khắt khe`, `Bạn bản xứ`, `Giữ để nói`).

## Related

- Runbook: `docs/runbooks/m12-qa.md`
- Manual API smokes: `scripts/smoke-*.sh` (complementary; not replaced by Maestro)
