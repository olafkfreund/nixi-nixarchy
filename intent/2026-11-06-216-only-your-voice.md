---
status: approved
issue: 216
author: olafkfreund
---

# Intent: Nixi answers you, not your speakers

## Problem

Nixi answers sound that didn't come from the user. The user says it happens all the time.

Nixi already records one input, the Seiren on p620, and never system audio. (`mic_device` picks it, and a `mic_cmd` setting can replace the recorder.) But the output is desk
speakers, a Razer Nommo, so videos, calls and music reach the mic through the air and look like someone speaking. A
check of which device the sound came from can't tell them apart.

From reading the code, the likeliest paths are:

- **The follow-up window.** For `follow_up` seconds after he talks (4 here), two or more words count as a request, with
  no wake word. Checks exist for speech length, another voice having the floor, and noise words. None of them can say
  who spoke. A note then asks Claude to reply `[ignore]` if the words clearly weren't meant for him, which is a judgment
  about the words, after the sound was accepted.
- **The wake word.** `WAKE_RE` accepts bare names and many spellings and greetings, and Whisper is primed with "Hey Nixi."
  while listening for it. A wake match skips that `[ignore]` note, even inside the follow-up window, so a video saying
  "Nixie" goes straight through.

This ranking is an inference. Nothing records false answers today, so how often each path fires isn't known.

## Proposed outcome

- A video, call or song on the speakers doesn't get an answer from Nixi. Working target: at most one false answer a day
  over a normal working week, judged from the counters and by the user.
- The user can still talk to him over music or during playback, and be heard.
- The user can see how often each path fires, and mark an answer as "that wasn't me", so decisions rest on data.
- If false answers remain while media plays, he needs his name during playback, rather than taking any words.

The first part is being tried now as a setting, with no code: `mic_device` is set to `meetingai-echo-cancel-source`, an
echo canceller already on the machine. With media playing and nobody speaking, it read 0.00004 against the raw mic's
0.0065. Whether the user's own voice survives it isn't tested yet, and this intent depends on that result.

## Affected users and systems

- `olafkfreund/nixoarchy-snowflake`: `class Wake` and the page's wake handling.
- p620 and razer, the hosts where the echo canceller is configured by Meeting AI. p510 isn't part of this.
- People using Nixi with speakers. Headphone users hear no change.

## Constraints

- **Must:** this work writes and logs no audio, transcript or per-event history. Counters only, as the rest of Nixi treats
  speech and messages. The existing `doctor` command, which records a test clip only when run, is left as it is.
- **Must:** no blanket mute while media plays. Ignoring the user exactly when they talk over music swaps one failure
  for a worse one.
- **Must:** "hey Nixi" and "stop" keep working during playback. Neither is removed by this.
- **Must:** "media is playing" means anything coming out of the speakers, including calls and browser video. Today's
  `Ambient.music` won't do: it's false when the `look_music` look is off, and it only sees players `playerctl` knows.
- **Must:** if the chosen mic stops existing, he doesn't go silently deaf. Today an uninstalled Meeting AI would remove
  the source, and whether a recorder then fails or falls back to the default input isn't checked yet.
- **Must not:** change the ElevenLabs voice, the engine or the voice settings. The user asked for voices to be left alone.
- **Must not:** store a voiceprint. Recognising the user's voice is out of scope unless the data shows other people in
  the room are the problem, and the user asks.
- **Must not:** change how messages and notifications show.

## Open questions

1. **Does the user's voice survive echo cancelling?** Tested by the user: "hey Nixi" with nothing playing, then over a
   video, then over music. Also clicking him to talk, because the page says "the mic is completely silent" below a peak of
   0.0005, and the cleaned source is very quiet with nobody speaking. The rest of this intent depends on it.
2. **If it works, who owns the echo canceller?** It belongs to Meeting AI's configuration today. Recommended: Nixi's
   NixOS module makes sure one exists, or falls back to the plain mic with a clear message, so removing Meeting AI
   can't break him.
3. **Is requiring his name during playback wanted straight away, or only if the counters show the need?** Recommended:
   only if needed, because the echo canceller may be enough. The user approved this order on 2026-11-06.
4. **How is "that wasn't me" marked?** Recommended: a small control on the answer, or saying "that wasn't for you". The
   spec works this out.
5. **Is removing or changing Whisper's "Hey Nixi." hint worthwhile?** It may raise false wakes, but nothing has measured
   it, and removing it may miss real ones. The counters decide.
