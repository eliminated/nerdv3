# Focus Enforcement

**Build iteration:** V3 · **Status:** design phase · **Last updated:** 2026-07-25

How Focused mode and Ultra-Focus mode work per platform, what the OS actually permits,
and the safety rules that constrain both.

---

## 1. Summary

Focus enforcement is NerdyApp's differentiator and its largest technical risk. It is a
**platform-permissions problem**, not a coding problem — the difficulty is in what each OS
allows, and in the store policies governing the APIs that allow it.

The strategy is a three-tier escalation where **every tier ships independently** and each
is useful alone. Tier 1 delivers most of the value; tiers 2 and 3 are refinements, not
prerequisites.

## 2. Safety rules

These are non-negotiable and precede every technical decision below.

> ### 2.1 There is always an exit
>
> An app that traps a user on their device during an emergency is dangerous. Ultra-Focus
> must **never** be able to prevent a user from reaching emergency services, and must never
> require a network connection, a password, or another device to escape.
>
> The escape is **friction, not a lock**: a long-press hold (3–5 seconds) plus a
> confirmation. Slow enough to defeat an impulse, fast enough for an emergency. It is
> always visible — never hidden in a menu.

> ### 2.2 Never block system UI
>
> Emergency calls, alarms, incoming calls, and OS-level settings are never suppressed. Do
> Not Disturb on Android explicitly permits repeat-caller and alarm exceptions — leave them
> on.

> ### 2.3 Sessions are time-bounded
>
> Ultra-Focus requires a `planned_duration_s`. No open-ended lockdown. A hard cap (suggest
> 4 hours) applies regardless of user input. If the app crashes, enforcement must fail
> **open** — a watchdog releases restrictions rather than leaving a device pinned.

> ### 2.4 Consent is explicit and per-session
>
> The user confirms entering Ultra-Focus every time, and is told exactly what will be
> restricted. Restrictions never persist past the session end.

Rules 2.1 and 2.3 also protect the project: an app that can lock a phone with no reliable
escape will not survive store review, and would be a genuine liability.

## 3. Tier model

| Tier | Name | Mechanism | Escapable | Ships |
|---|---|---|---|---|
| **1** | Focused | Fullscreen, DND, friction on exit, logging | Yes, easily | v0.3.0 |
| **2** | Ultra-Focus (soft) | Tier 1 + immersive lock, deliberate exit ritual, visible cost | Yes, with effort | v0.6.0 |
| **3** | Ultra-Focus (hard) | Tier 2 + OS-level pinning, app-switch blocking | Yes, by design (§2.1) | Post-v1.0 |

**Tier 1 is the priority.** Most users don't need to be *prevented* from leaving — they
need a reason to notice they're leaving. A confirmation dialogue that says "you have 18
minutes left, and this will be logged as an interruption" defeats the reflexive
app-switch, which is the actual failure mode.

Tier 3 exists for users who genuinely cannot self-regulate. It should not gate the release.

## 4. Platform capability matrix

| Capability | Android | Windows | Notes |
|---|---|---|---|
| Suppress notifications | ✅ `NotificationManager` DND (`ACCESS_NOTIFICATION_POLICY`) | ⚠️ `SHQueryUserNotificationState` only *reads* Focus Assist state; no documented public API *enables* it (masterplan R1) | Windows fallback: suppress own notifications, detect state, deep-link Settings |
| Fullscreen / immersive | ✅ `WindowInsetsController` | ✅ Borderless topmost window | Reliable |
| Keep screen on | ✅ `FLAG_KEEP_SCREEN_ON` | ✅ `SetThreadExecutionState` | Reliable |
| Detect app switch | ✅ Lifecycle `onPause`/`onStop` | ✅ `WM_ACTIVATE` / focus events | Detection is easy; blocking is not |
| Block app switch | ⚠️ Screen pinning, or Accessibility Service | ⚠️ Low-level keyboard hook (`WH_KEYBOARD_LL`) | See §5, §6 |
| Prevent app exit | ⚠️ Screen pinning only | ❌ No supported method | Windows is the weak platform |
| Survive process kill | ✅ Foreground service | ⚠️ Best-effort | Android is stronger here |

Legend: ✅ supported · ⚠️ conditional or fragile · ❌ not available

## 5. Android

### 5.1 Recommended: screen pinning

`startLockTask()` in non-privileged mode. The user has already consented, the OS provides
the exit (hold Back + Overview), and it triggers **no store policy review**.

```kotlin
// Requires the activity to be the task root
activity.startLockTask()
// Release on session end — and from the watchdog on crash
activity.stopLockTask()
```

Trade-off: the OS-provided exit gesture is easier than the app's own friction ritual. This
is acceptable — see §2.1. The intent is friction, never imprisonment.

### 5.2 Do Not Disturb

```kotlin
// One-time: send user to settings to grant policy access
Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS

notificationManager.setInterruptionFilter(
    NotificationManager.INTERRUPTION_FILTER_ALARMS  // alarms + repeat callers survive
)
```

Use `INTERRUPTION_FILTER_ALARMS`, **not** `_NONE`. Alarms and repeat callers must get
through (§2.2). Always restore the prior filter on session end.

### 5.3 Foreground service

Required so Android doesn't kill a long session. Type `specialUse` on API 34+, with a
persistent notification showing the timer — which doubles as a useful UI surface.

### 5.4 Accessibility Service — avoid

An Accessibility Service could block app switching more thoroughly. **Don't use it.**

Google's policy restricts the API to genuine accessibility purposes; using it for focus
enforcement is a common rejection cause, and appeals are slow and often unsuccessful.
Multiple established focus apps have been pulled or forced to remove the capability.

The marginal gain over screen pinning does not justify risking the app's distribution.
If it is ever revisited, it needs a written policy justification and a prominent in-app
disclosure before a single line is implemented.

### 5.5 Version fragmentation

Behaviour shifts meaningfully across releases — background restrictions, foreground service
types, and notification policy have all changed. Maintain a manual test matrix across at
least API 29 / 33 / 34+ and re-run it every Android release.

## 6. Windows

Windows is the weaker platform: it has no supported way to prevent an application from
being exited. Design around this rather than fighting it.

### 6.1 What works

- **Borderless fullscreen, topmost** — occupies the screen, no title bar controls.
- **Focus Assist** — suppresses toasts during the session.
- **`SetThreadExecutionState(ES_DISPLAY_REQUIRED)`** — prevents sleep.
- **Focus-loss detection** — `WM_ACTIVATE` fires reliably. Log every occurrence and show a
  return prompt.

### 6.2 What's fragile

A low-level keyboard hook (`WH_KEYBOARD_LL`) can swallow Alt+Tab. Caveats:

- Cannot block Ctrl+Alt+Del or the Windows security screen (by OS design).
- Antivirus software frequently flags global keyboard hooks — a real distribution problem.
- Requires a message pump on a dedicated thread; a stall silently drops the hook.
- Task Manager can end the process regardless.

**Recommendation: don't ship the hook.** On Windows, rely on detection plus friction.
Reacting to a focus loss within a second — full-screen "you left your session, 14 minutes
remaining" — is nearly as effective as blocking and carries none of the risk.

## 7. Interruption logging

Every **session** event — not only enforcement events — writes an `interruptions` row (see
[data-model.md §3.6](./data-model.md#36-interruptions)). This wording matters: focused mode does
not exist until Phase 3, and the log is logged in **all modes** so that the cross-mode comparison
below has a plain-mode baseline to compare against.

| Event | `kind` | `blocked` | Ships |
|---|---|---|---|
| User switched away | `app_switch` | `false` | Phase 3 |
| Exit attempt refused | `exit_attempt` | `true` | Phase 3 |
| Notification suppressed | `notification` | `true` | Phase 3 |
| User paused | `manual_pause` | `false` | **Phase 2** |
| User reported being distracted | `self_reported` | `false` | **Phase 2** |
| No input for N minutes | `idle_timeout` | `false` | Phase 3 — `N` still unfixed, to be chosen from real data alongside D2 |
| Screen locked | `device_locked` | `false` | Phase 3 |

`self_reported` carries no `duration_s` and no `detail`: one tap, no chooser, no free text. A
picker would cost a second interaction and invite the user to name an app, which is exactly the
identity the privacy line below forbids. Free-form reflection belongs in `session_surveys.note`,
which the privacy line does not govern.

**Log the kind, never the identity.** Record that an app switch happened, not which app was
opened. Reading which apps a student uses is surveillance, would obstruct any future
permission justification, and isn't needed for anything the analytics do.

This log is also the evidence base for whether enforcement works: compare completion rates
and focus ratings across `mode` values, and compare blocked vs. successful escapes.

## 8. Failure modes

| Failure | Consequence | Mitigation |
|---|---|---|
| App crashes while pinned | Device stuck | Watchdog releases lock task on next launch; foreground service heartbeat |
| Permission revoked mid-session | Enforcement silently stops | Re-check permissions at session start; degrade gracefully to a lower tier and tell the user |
| Battery dies mid-session | Session lost | Persist state on every change; recover with `end_reason='crashed'` |
| User finds an OS bypass | Enforcement circumvented | Acceptable. Log it as an interruption and move on — this is a study aid, not DRM |
| Antivirus flags the build | Distribution blocked | Don't ship keyboard hooks (§6.2) |

## 9. Implementation order

```
v0.3.0  Tier 1 — fullscreen, DND, exit friction, interruption logging   [both platforms]
v0.6.0  Tier 2 — Android screen pinning, foreground service              [Android]
v0.6.0  Tier 2 — Windows focus-loss detection + return prompt            [Windows]
post-1.0 Tier 3 — evaluate only if logging shows Tier 2 is insufficient
```

Tier 3 is gated on evidence. If interruption data shows Tier 2 users are completing
sessions at a good rate, hard lockdown is effort spent on a solved problem.

## 10. Open questions

- **Should Ultra-Focus be opt-in per subject?** Some material genuinely needs a browser
  and a reference PDF; total lockdown makes those subjects unusable.
- **Allowlisting** — permit specific apps (calculator, a PDF reader) during a session?
  Substantially more complex, and on Android likely needs the Accessibility Service that
  §5.4 rules out. Probably not worth it.
- **What counts as an escape?** Is a 4-second glance at a lock screen an interruption? A
  threshold (perhaps 10 seconds) may prevent noisy, discouraging data.
- **Linux desktop** — a third native implementation, and Wayland restricts input grabbing
  more than X11. Post-1.0 at the earliest.
- **Does hard enforcement actually help?** Worth answering with the app's own data before
  building Tier 3. It's plausible that friction plus visible cost outperforms blocking,
  since blocking can produce resentment rather than habit.