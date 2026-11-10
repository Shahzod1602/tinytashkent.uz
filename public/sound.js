// Ambient sound for the map, synthesised with Web Audio. No audio files:
// rain, wind, thunder, birds, crickets and the city hum are generated live
// and mixed from the same scene the atmosphere layer draws.

const clamp01 = value => Math.min(1, Math.max(0, value));
const rand = (min, max) => min + Math.random() * (max - min);
const pick = list => list[Math.floor(Math.random() * list.length)];

function noise(ctx, kind, seconds = 4) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate), data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === 'white') data[i] = white;
    else if (kind === 'pink') { b0 = .99765 * b0 + white * .099046; b1 = .963 * b1 + white * .2965164; b2 = .57 * b2 + white * 1.0526913; data[i] = (b0 + b1 + b2 + white * .1848) * .22; }
    else { last = (last + .02 * white) / 1.02; data[i] = last * 3.5; }
  }
  return buffer;
}

export function createSound(scene) {
  let ctx = null, bus = null, master = null, tone = null, analyser = null, layers = null, buffers = null;
  let on = false, timer = 0, birdTimer = 0, volume = .9;

  function loop(buffer, destination) {
    const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true; source.connect(destination); source.start(0, Math.random() * buffer.duration); return source;
  }
  function build() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    ctx = new Context();
    buffers = {white: noise(ctx, 'white'), pink: noise(ctx, 'pink', 6), brown: noise(ctx, 'brown', 6)};
    master = ctx.createGain(); master.gain.value = 0;
    tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 18000;   // snow muffles the city
    const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -14; limiter.ratio.value = 6;
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
    bus = ctx.createGain(); bus.connect(tone); tone.connect(master); master.connect(limiter); limiter.connect(ctx.destination); master.connect(analyser);
    const gain = (value = 0) => { const node = ctx.createGain(); node.gain.value = value; node.connect(bus); return node; };
    const filter = (type, frequency, q = .7) => { const node = ctx.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = q; return node; };

    // rain: a broad hiss plus a closer patter
    const rain = gain(), rainHigh = filter('highpass', 600), rainLow = filter('lowpass', 7500);
    loop(buffers.white, rainHigh); rainHigh.connect(rainLow); rainLow.connect(rain);
    const patter = gain(), patterBand = filter('bandpass', 2100, .6);
    loop(buffers.pink, patterBand); patterBand.connect(patter);
    // wind: band of pink noise that slowly breathes
    const wind = gain(), windBand = filter('bandpass', 420, 1.1), windSwell = ctx.createGain(); windSwell.gain.value = .7;
    loop(buffers.pink, windBand); windBand.connect(windSwell); windSwell.connect(wind);
    const drift = ctx.createOscillator(), driftDepth = ctx.createGain(); drift.frequency.value = .07; driftDepth.gain.value = 190; drift.connect(driftDepth); driftDepth.connect(windBand.frequency); drift.start();
    const gust = ctx.createOscillator(), gustDepth = ctx.createGain(); gust.frequency.value = .13; gustDepth.gain.value = .3; gust.connect(gustDepth); gustDepth.connect(windSwell.gain); gust.start();
    // distant city
    const hum = gain(), humLow = filter('lowpass', 170);
    loop(buffers.brown, humLow); humLow.connect(hum);
    // crickets: two detuned pulsing voices
    const crickets = gain();
    for (const [frequency, pulse, gate, pan] of [[4350, 31, 1.9, -.5], [3980, 27, 1.3, .55]]) {
      const carrier = ctx.createOscillator(); carrier.frequency.value = frequency;
      const pulses = ctx.createGain(); pulses.gain.value = 0;
      const pulseOsc = ctx.createOscillator(); pulseOsc.frequency.value = pulse; pulseOsc.connect(pulses.gain);
      const gated = ctx.createGain(); gated.gain.value = .5;
      const gateOsc = ctx.createOscillator(), gateDepth = ctx.createGain(); gateOsc.frequency.value = gate; gateDepth.gain.value = .5; gateOsc.connect(gateDepth); gateDepth.connect(gated.gain);
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (panner.pan) panner.pan.value = pan;
      carrier.connect(pulses); pulses.connect(gated); gated.connect(panner); panner.connect(crickets);
      carrier.start(); pulseOsc.start(); gateOsc.start();
    }
    layers = {rain, patter, wind, hum, crickets};
    return true;
  }

  // --- one-shot voices ---
  function voice(start, {type = 'sine', from, to = from, length, level, pan = 0, attack = .008, vibrato = 0, band = 0}) {
    const osc = ctx.createOscillator(), envelope = ctx.createGain(); osc.type = type;
    osc.frequency.setValueAtTime(from, start); osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + length);
    if (vibrato) { const wobble = ctx.createOscillator(), depth = ctx.createGain(); wobble.frequency.value = vibrato; depth.gain.value = from * .035; wobble.connect(depth); depth.connect(osc.frequency); wobble.start(start); wobble.stop(start + length + .05); }
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(level, start + attack); envelope.gain.exponentialRampToValueAtTime(.0001, start + length);
    let tail = envelope;
    if (band) { const shape = ctx.createBiquadFilter(); shape.type = 'bandpass'; shape.frequency.value = band; shape.Q.value = 2.2; envelope.connect(shape); tail = shape; }
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { panner.pan.value = pan; tail.connect(panner); panner.connect(bus); } else tail.connect(bus);
    osc.connect(envelope); osc.start(start); osc.stop(start + length + .05);
  }
  const SONGS = {
    // house sparrow: a run of quick falling chirps
    sparrow(t, level, pan) { const count = 3 + Math.floor(Math.random() * 5), base = rand(3600, 4600); for (let i = 0; i < count; i++) voice(t + i * rand(.10, .15), {from: base * rand(.95, 1.08), to: base * .72, length: rand(.05, .08), level, pan}); },
    // tit: bright two-note see-saw
    tit(t, level, pan) { const high = rand(4800, 5600), low = high * .8, count = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < count; i++) { voice(t + i * .3, {from: high, to: high * .98, length: .11, level, pan}); voice(t + i * .3 + .14, {from: low, to: low * .98, length: .12, level: level * .9, pan}); } },
    // warbler: a hurried mixed phrase
    warbler(t, level, pan) { const count = 6 + Math.floor(Math.random() * 6); let at = t; for (let i = 0; i < count; i++) { const from = rand(2600, 5600); voice(at, {from, to: from * pick([.7, .8, 1.25, 1.4]), length: rand(.05, .09), level: level * .9, pan}); at += rand(.07, .12); } },
    // musicha (laughing dove): soft low coo-COO-coo
    dove(t, level, pan) { const base = rand(520, 600); let at = t; for (const [ratio, length, strength] of [[1, .16, .7], [1.09, .30, 1], [1, .2, .8], [.96, .24, .7]]) { voice(at, {from: base * ratio, to: base * ratio * .96, length, level: level * 1.7 * strength, pan, attack: .04, vibrato: 22}); at += length + .07; } },
    // rook / crow: rough falling caw
    crow(t, level, pan) { const count = 2 + Math.floor(Math.random() * 2), base = rand(400, 470); for (let i = 0; i < count; i++) voice(t + i * .36, {type: 'sawtooth', from: base, to: base * .8, length: .24, level: level * 1.3, pan, attack: .02, vibrato: 60, band: 1250}); },
  };
  function thunder(delay = .6, strength = 1) {
    if (!on || !ctx) return;
    const start = ctx.currentTime + delay, length = rand(3.5, 6);
    const source = ctx.createBufferSource(); source.buffer = buffers.brown;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.setValueAtTime(rand(500, 900), start); low.frequency.exponentialRampToValueAtTime(70, start + length);
    const envelope = ctx.createGain(), peak = 1.5 * strength;
    envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(peak, start + .04); envelope.gain.exponentialRampToValueAtTime(peak * .35, start + .45);
    // rolling echoes
    for (let at = .7; at < length - .8; at += rand(.45, .9)) envelope.gain.linearRampToValueAtTime(peak * rand(.18, .5) * (1 - at / length), start + at);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + length);
    source.connect(low); low.connect(envelope); envelope.connect(master);   // not muffled by the snow filter
    source.start(start, Math.random() * 2); source.stop(start + length + .1);
    if (delay < 1) { // a close strike also cracks
      const crack = ctx.createBufferSource(); crack.buffer = buffers.white;
      const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 1400;
      const snap = ctx.createGain(); snap.gain.setValueAtTime(0, start); snap.gain.linearRampToValueAtTime(.5 * strength, start + .01); snap.gain.exponentialRampToValueAtTime(.0001, start + .22);
      crack.connect(high); high.connect(snap); snap.connect(master); crack.start(start); crack.stop(start + .3);
    }
  }

  // --- mixing from the scene ---
  let birdActivity = 0, crowShare = 0, doveShare = 0;
  function mix() {
    if (!on || !ctx) return;
    const {look, resolved, zoom} = scene(), now = ctx.currentTime;
    const day = clamp01(1 - look.night), dry = (1 - .92 * look.rain) * (1 - .8 * look.snow);
    const near = clamp01((zoom - .22) / .7), high = 1 - near;          // zoomed out = up in the air
    const storm = resolved.weather === 'storm' ? 1 : 0;
    const set = (node, value, glide = .9) => node.gain.setTargetAtTime(value, now, glide);
    set(layers.rain, look.rain * (.26 + .12 * storm) * (.75 + .25 * near));
    set(layers.patter, look.rain * .42 * near);
    set(layers.wind, .04 + .30 * storm + .20 * look.snow + .09 * look.autumn + .10 * look.fog + .13 * look.bare + .15 * high);
    set(layers.hum, (.20 + .16 * high) * (.45 + .55 * day));
    const warmNight = {summer: 1, spring: .55, autumn: .3, winter: 0}[resolved.season];
    set(layers.crickets, .085 * warmNight * clamp01((look.night - .35) / .4) * dry * (.4 + .6 * near));
    tone.frequency.setTargetAtTime(18000 - 14000 * clamp01(Math.max(look.cover, look.snow)), now, 1.2);
    const season = {spring: 1, summer: .8, autumn: .42, winter: .2}[resolved.season];
    const chorus = resolved.time === 'dawn' ? 1.5 : resolved.time === 'golden' ? 1.1 : 1;
    birdActivity = clamp01(day * day * dry * (1 - .3 * look.cloud) * season * chorus) * (.25 + .75 * near);
    crowShare = resolved.season === 'winter' ? .7 : resolved.season === 'autumn' ? .4 : .06;
    doveShare = resolved.season === 'winter' ? .05 : .22;
  }
  function birds() {
    clearTimeout(birdTimer);
    if (!on || !ctx) return;
    if (birdActivity > .03 && ctx.state === 'running') {
      const roll = Math.random(), song = roll < crowShare ? 'crow' : roll < crowShare + doveShare ? 'dove' : pick(['sparrow', 'sparrow', 'tit', 'warbler']);
      const distance = rand(.35, 1);
      SONGS[song](ctx.currentTime + .05, .17 * distance * (.6 + .4 * birdActivity), rand(-.9, .9));
    }
    birdTimer = setTimeout(birds, 1000 * (birdActivity > .03 ? (.35 + 4.2 * (1 - birdActivity)) * rand(.5, 1.5) : 1.5));
  }
  function start() {
    if (!ctx && !build()) return false;
    on = true;
    void ctx.resume?.();
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(volume, ctx.currentTime, .6);
    clearInterval(timer); mix(); timer = setInterval(mix, 400); birds();
    return true;
  }
  function stop() {
    on = false; clearInterval(timer); clearTimeout(birdTimer);
    if (ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, .12); setTimeout(() => { if (!on) void ctx.suspend?.(); }, 700); }
  }
  document.addEventListener('visibilitychange', () => { if (!ctx || !on) return; if (document.hidden) void ctx.suspend?.(); else void ctx.resume?.(); });

  return {
    get on() { return on; },
    get supported() { return !!(window.AudioContext || window.webkitAudioContext); },
    start, stop, thunder,
    // Loudness of the mix (RMS), for diagnostics.
    level() { if (!analyser) return 0; const data = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(data); let sum = 0; for (const v of data) sum += v * v; return Math.sqrt(sum / data.length); },
    state: () => ({context: ctx?.state ?? 'none', birdActivity, crowShare}),
  };
}
