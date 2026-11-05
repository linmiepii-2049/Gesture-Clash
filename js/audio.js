/** Procedural Web Audio. Intensity rises slightly across later rounds. */

export function bgmIntensity(round) {
  const steps = Math.min(Math.max(0, Math.floor(Number(round) || 1) - 1), 8);
  return {
    steps,
    bpm: 128 + steps * 4,
    gainMul: 1 + steps * 0.06,
  };
}

export function effectiveBgmGain(userGain, round) {
  return userGain * bgmIntensity(round).gainMul;
}

export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let userGain = 0.234;
  let getRound = () => 1;
  let timer = null;
  let running = false;

  function context() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = effectiveBgmGain(userGain, getRound());
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function tone(t, { freq, freqTo, dur, type = "sine", vol = 0.2, dest }) {
    const audio = context();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t);
    if (freqTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(dest || audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  function noise(t, { dur, vol, freq, type, dest }) {
    const audio = context();
    const length = Math.max(1, Math.floor(audio.sampleRate * dur));
    const buf = audio.createBuffer(1, length, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    filter.type = type;
    filter.frequency.value = freq;
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest || audio.destination);
    src.start(t);
    src.stop(t + dur);
  }

  function play(type) {
    const audio = context();
    const t = audio.currentTime;
    if (type === "success") {
      tone(t, { freq: 660, freqTo: 990, dur: 0.12, vol: 0.22 });
      tone(t + 0.1, { freq: 1320, dur: 0.14, vol: 0.16 });
    } else if (type === "fail") {
      tone(t, { freq: 320, freqTo: 110, dur: 0.28, type: "triangle", vol: 0.28 });
    } else if (type === "button") {
      tone(t, { freq: 620, dur: 0.07, vol: 0.12 });
    } else if (type === "countdown") {
      tone(t, { freq: 1040, dur: 0.09, vol: 0.16 });
    } else if (type === "eliminate") {
      noise(t, { dur: 0.28, vol: 0.35, freq: 900, type: "bandpass" });
      tone(t, { freq: 240, freqTo: 55, dur: 0.42, type: "square", vol: 0.18 });
      tone(t + 0.08, { freq: 180, freqTo: 40, dur: 0.36, type: "sawtooth", vol: 0.08 });
    } else if (type === "allclear") {
      tone(t, { freq: 880, dur: 0.1, vol: 0.2 });
      tone(t + 0.11, { freq: 1175, dur: 0.14, vol: 0.18 });
      tone(t + 0.24, { freq: 1568, dur: 0.16, vol: 0.14 });
    } else if (type === "win") {
      [523, 659, 784, 1046].forEach((freq, i) => {
        tone(t + i * 0.12, { freq, dur: 0.22, vol: 0.2 });
      });
    }
  }

  function scheduleBar() {
    if (!running || !ctx) return;
    const intensity = bgmIntensity(getRound());
    const beat = 60 / intensity.bpm;
    master.gain.value = effectiveBgmGain(userGain, getRound());
    const now = ctx.currentTime + 0.05;
    const pattern = [
      { type: "kick", vol: 1 },
      { type: "hat", vol: 0.55 },
      { type: "snare", vol: 0.85 },
      { type: "hat", vol: 0.5 },
      { type: "kick", vol: 0.75 + intensity.steps * 0.02 },
      { type: "hat", vol: 0.45 },
      { type: "snare", vol: 0.85 },
      { type: "hat", vol: 0.65 },
    ];
    for (let i = 0; i < pattern.length; i++) {
      const when = now + i * beat * 0.5;
      const hit = pattern[i];
      if (hit.type === "kick") {
        tone(when, {
          freq: 150,
          freqTo: 40,
          dur: 0.18,
          vol: 0.9 * hit.vol,
          dest: master,
        });
      } else if (hit.type === "snare") {
        noise(when, {
          dur: 0.16,
          vol: 0.28 * hit.vol,
          freq: 1400,
          type: "highpass",
          dest: master,
        });
      } else {
        noise(when, {
          dur: 0.04,
          vol: 0.12 * hit.vol,
          freq: 8000,
          type: "highpass",
          dest: master,
        });
      }
    }
    if (intensity.steps >= 4) {
      noise(now + beat * 2, {
        dur: 0.03,
        vol: 0.08,
        freq: 9000,
        type: "highpass",
        dest: master,
      });
    }
    timer = setTimeout(scheduleBar, beat * 4 * 1000);
  }

  return {
    play,
    setUserGain(value) {
      userGain = value;
      if (master) master.gain.value = effectiveBgmGain(userGain, getRound());
    },
    startBgm(roundGetter) {
      getRound = roundGetter || getRound;
      context();
      if (running) return;
      running = true;
      scheduleBar();
    },
    stopBgm() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (master) master.gain.value = 0;
    },
  };
}
