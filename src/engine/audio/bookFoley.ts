export type BookFoley = 'cover' | 'page' | 'enter';

// Layers of fibre noise, binding creaks and the muted weight of the cover.
const layers = {
  cover: [[.06, .78, .19, .09], [.22, .47, .11, .45], [.72, .22, .20, .035]],
  page: [[0, .34, .18, .28], [.14, .31, .12, .45]],
  enter: [[0, .56, .17, .13], [.22, .34, .09, .30]],
};

export function makeBookFoley(context: AudioContext, cue: BookFoley) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(rate * (cue === 'cover' ? .96 : .59)), rate);
  const samples = buffer.getChannelData(0);
  for (const [start, duration, volume, filter] of layers[cue]) {
    let grain = 0, low = 0;
    for (let frame = Math.round(start * rate); frame < Math.min(samples.length, (start + duration) * rate); frame++) {
      const elapsed = frame / rate - start;
      const progress = Math.max(0, elapsed / duration);
      const envelope = Math.sin(Math.PI * progress) ** 1.6;
      grain += (Math.random() * 2 - 1 - grain) * filter;
      low += (grain - low) * .018;
      const rustle = (grain - low * .65) * (.67 + .33 * Math.sin(elapsed * 194));
      const binding = cue === 'cover' && filter < .1 ? .22 * Math.sin(2 * Math.PI * (108 * elapsed - 24 * elapsed ** 2)) : 0;
      samples[frame] += (rustle + binding) * volume * envelope;
    }
  }
  return buffer;
}
