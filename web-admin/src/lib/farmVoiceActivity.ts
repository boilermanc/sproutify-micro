/** Local silence detection only. No recognition or provider call until a spoken turn ends. */
export function createFarmVoiceActivity(started: number) {
  let voicedMs = 0; let last = started; let lastVoice = started; let heardSpeech = false;
  return (rms: number, now: number): 'listen' | 'send' | 'silent' => {
    const elapsed = Math.min(100, Math.max(0, now - last)); last = now;
    if (rms >= 0.018) {
      voicedMs += elapsed; lastVoice = now;
      if (voicedMs >= 300) heardSpeech = true;
    } else if (!heardSpeech && now - lastVoice > 300) voicedMs = 0;
    if (heardSpeech && now - lastVoice >= 1400) return 'send';
    if (!heardSpeech && now - started >= 20000) return 'silent';
    return 'listen';
  };
}
