import { i as __toESM } from "../_runtime.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { n as Slot, s as require_jsx_runtime } from "../_libs/@radix-ui/react-collection+[...].mjs";
import { c as Pause, i as Upload, n as ZoomOut, o as Square, r as Volume2, s as Play, t as ZoomIn } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { i as SliderTrack, n as SliderRange, r as SliderThumb, t as Slider$1 } from "../_libs/@radix-ui/react-slider+[...].mjs";
import { n as Portal, r as Provider, t as Content2 } from "../_libs/@radix-ui/react-tooltip+[...].mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { n as Root, t as Indicator } from "../_libs/radix-ui__react-progress.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-Cta-dvF-.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var TooltipProvider = Provider;
var TooltipContent = import_react.forwardRef(({ className, sideOffset = 6, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content2, {
	ref,
	sideOffset,
	className: cn("z-50 overflow-hidden rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-none", className),
	...props
}) }));
TooltipContent.displayName = Content2.displayName;
var Progress = import_react.forwardRef(({ className, value, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Root, {
	ref,
	className: cn("relative h-1 w-full overflow-hidden rounded-full bg-muted", className),
	...props,
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Indicator, {
		className: "h-full w-full flex-1 bg-primary transition-transform duration-150 ease-out",
		style: { transform: `translateX(-${100 - (value ?? 0)}%)` }
	})
}));
Progress.displayName = Root.displayName;
/** In-place radix-2 FFT. `re`/`im` length must be a power of two. */
function fftRadix2(re, im) {
	const n = re.length;
	let j = 0;
	for (let i = 0; i < n; i++) {
		if (i < j) {
			const tr = re[i];
			const ti = im[i];
			re[i] = re[j];
			im[i] = im[j];
			re[j] = tr;
			im[j] = ti;
		}
		let m = n >> 1;
		while (m >= 1 && j >= m) {
			j -= m;
			m >>= 1;
		}
		j += m;
	}
	for (let size = 2; size <= n; size <<= 1) {
		const half = size >> 1;
		const step = -2 * Math.PI / size;
		for (let i = 0; i < n; i += size) for (let k = 0; k < half; k++) {
			const angle = step * k;
			const wr = Math.cos(angle);
			const wi = Math.sin(angle);
			const even = i + k;
			const odd = even + half;
			const or_ = re[odd];
			const oi = im[odd];
			const tr = wr * or_ - wi * oi;
			const ti = wr * oi + wi * or_;
			re[odd] = re[even] - tr;
			im[odd] = im[even] - ti;
			re[even] += tr;
			im[even] += ti;
		}
	}
}
function makeHann(size) {
	const w = new Float32Array(size);
	if (size <= 1) return w;
	for (let i = 0; i < size; i++) w[i] = .5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
	return w;
}
function hzBin(hz, sampleRate, fftSize) {
	return Math.round(hz * fftSize / sampleRate);
}
var LANE_ORDER = [
	"kick",
	"snare",
	"hats",
	"bass",
	"vocals",
	"chords"
];
var LANE_META = {
	kick: {
		label: "Kick",
		short: "KK",
		colorVar: "--lane-kick"
	},
	snare: {
		label: "Snare",
		short: "SN",
		colorVar: "--lane-snare"
	},
	hats: {
		label: "Hats",
		short: "HH",
		colorVar: "--lane-hats"
	},
	bass: {
		label: "Bass",
		short: "BS",
		colorVar: "--lane-bass"
	},
	vocals: {
		label: "Vocals",
		short: "VX",
		colorVar: "--lane-vocals"
	},
	chords: {
		label: "Chords",
		short: "CH",
		colorVar: "--lane-chords"
	}
};
var FFT_SIZE = 2048;
var HOP = 512;
var NOTE_NAMES = [
	"C",
	"C#",
	"D",
	"D#",
	"E",
	"F",
	"F#",
	"G",
	"G#",
	"A",
	"A#",
	"B"
];
var MAJOR_PROFILE = [
	6.35,
	2.23,
	3.48,
	2.33,
	4.38,
	4.09,
	2.52,
	5.19,
	2.39,
	3.66,
	2.29,
	2.88
];
var MINOR_PROFILE = [
	6.33,
	2.68,
	3.52,
	5.38,
	2.6,
	3.53,
	2.54,
	4.75,
	3.98,
	2.69,
	3.34,
	3.17
];
var CHORD_TEMPLATES = [
	{
		quality: "maj",
		v: [
			1,
			0,
			0,
			0,
			1,
			0,
			0,
			1,
			0,
			0,
			0,
			0
		]
	},
	{
		quality: "min",
		v: [
			1,
			0,
			0,
			1,
			0,
			0,
			0,
			1,
			0,
			0,
			0,
			0
		]
	},
	{
		quality: "7",
		v: [
			1,
			0,
			0,
			0,
			1,
			0,
			0,
			1,
			0,
			0,
			1,
			0
		]
	},
	{
		quality: "sus",
		v: [
			1,
			0,
			0,
			0,
			0,
			1,
			0,
			1,
			0,
			0,
			0,
			0
		]
	}
];
function maxOf(arr, floor = 0) {
	let m = floor;
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i] ?? 0;
		if (v > m) m = v;
	}
	return m;
}
function yieldFrame() {
	return new Promise((r) => setTimeout(r, 0));
}
function toMono(buffer) {
	const n = buffer.length;
	const out = new Float32Array(n);
	const chs = buffer.numberOfChannels;
	for (let c = 0; c < chs; c++) {
		const d = buffer.getChannelData(c);
		for (let i = 0; i < n; i++) out[i] += d[i] ?? 0;
	}
	if (chs > 1) {
		const inv = 1 / chs;
		for (let i = 0; i < n; i++) out[i] *= inv;
	}
	return out;
}
function downsample(input, from, to) {
	if (from <= to * 1.05) return input;
	const ratio = from / to;
	const n = Math.floor(input.length / ratio);
	const out = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const start = Math.floor(i * ratio);
		const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
		let s = 0;
		for (let j = start; j < end && j < input.length; j++) s += input[j] ?? 0;
		out[i] = s / (end - start);
	}
	return out;
}
function waveformPeaks(samples, bins = 2400) {
	const n = Math.min(bins, Math.max(64, Math.floor(samples.length / 32)));
	const min = new Float32Array(n);
	const max = new Float32Array(n);
	const step = samples.length / n;
	for (let i = 0; i < n; i++) {
		const a = Math.floor(i * step);
		const b = Math.min(samples.length, Math.floor((i + 1) * step));
		let lo = 0;
		let hi = 0;
		for (let j = a; j < b; j++) {
			const v = samples[j] ?? 0;
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
		min[i] = lo;
		max[i] = hi;
	}
	return {
		min,
		max
	};
}
function rotate(arr, k) {
	const n = arr.length;
	const out = new Array(n);
	for (let i = 0; i < n; i++) out[i] = arr[(i - k + n) % n];
	return out;
}
function cosine(a, b) {
	let dot = 0;
	let na = 0;
	let nb = 0;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	if (na < 1e-12 || nb < 1e-12) return 0;
	return dot / Math.sqrt(na * nb);
}
function peakPick(env, minSep, k = 1.6) {
	const peaks = [];
	let mean = 0;
	for (let i = 0; i < env.length; i++) mean += env[i] ?? 0;
	mean /= Math.max(1, env.length);
	let v = 0;
	for (let i = 0; i < env.length; i++) {
		const d = (env[i] ?? 0) - mean;
		v += d * d;
	}
	const std = Math.sqrt(v / Math.max(1, env.length));
	const thr = mean + k * std;
	for (let i = 2; i < env.length - 2; i++) {
		const x = env[i] ?? 0;
		if (x > thr && x >= (env[i - 1] ?? 0) && x >= (env[i + 1] ?? 0) && x >= (env[i - 2] ?? 0) && x >= (env[i + 2] ?? 0)) {
			const last = peaks[peaks.length - 1];
			if (last === void 0 || i - last >= minSep) peaks.push(i);
			else if (x > (env[last] ?? 0)) peaks[peaks.length - 1] = i;
		}
	}
	return peaks;
}
function quantizeTime(t, grid, window) {
	const q = Math.round(t / grid) * grid;
	return Math.abs(q - t) <= window ? Math.max(0, q) : t;
}
function regionsFromEnvelope(env, rate, duration, thresh, minDur) {
	const clips = [];
	let start = null;
	let peak = 0;
	for (let i = 0; i < env.length; i++) {
		const v = env[i] ?? 0;
		if (v >= thresh) {
			if (start === null) {
				start = i / rate;
				peak = v;
			} else if (v > peak) peak = v;
		} else if (start !== null) {
			const end = i / rate;
			if (end - start >= minDur) clips.push({
				start,
				duration: Math.min(duration - start, end - start),
				velocity: peak
			});
			start = null;
			peak = 0;
		}
	}
	if (start !== null) clips.push({
		start,
		duration: Math.max(minDur, duration - start),
		velocity: peak
	});
	return clips;
}
function chordName(root, quality) {
	const n = NOTE_NAMES[root] ?? "C";
	if (quality === "maj") return n;
	if (quality === "min") return `${n}m`;
	if (quality === "7") return `${n}7`;
	if (quality === "maj7") return `${n}maj7`;
	if (quality === "sus") return `${n}sus`;
	return `${n}dim`;
}
function detectKey(chroma) {
	let best = -Infinity;
	let root = 0;
	let mode = "minor";
	for (let r = 0; r < 12; r++) {
		const maj = cosine(chroma, rotate(MAJOR_PROFILE, r));
		const min = cosine(chroma, rotate(MINOR_PROFILE, r));
		if (maj > best) {
			best = maj;
			root = r;
			mode = "major";
		}
		if (min > best) {
			best = min;
			root = r;
			mode = "minor";
		}
	}
	const name = NOTE_NAMES[root] ?? "A";
	return {
		key: mode === "major" ? `${name} major` : `${name} minor`,
		mode
	};
}
function matchChord(chroma) {
	let best = -Infinity;
	let root = 0;
	let quality = "maj";
	for (let r = 0; r < 12; r++) for (const t of CHORD_TEMPLATES) {
		const s = cosine(chroma, rotate(t.v, r));
		if (s > best) {
			best = s;
			root = r;
			quality = t.quality;
		}
	}
	return {
		root,
		quality,
		score: best
	};
}
async function analyzeAudioBuffer(buffer, fileName, onProgress) {
	const report = onProgress ?? (() => void 0);
	report(4, "Reading waveform");
	const origSr = buffer.sampleRate;
	const duration = buffer.duration;
	const monoFull = toMono(buffer);
	const waveform = waveformPeaks(monoFull);
	await yieldFrame();
	report(12, "Preparing spectrum");
	const targetSr = 22050;
	const sr = origSr > 24e3 ? targetSr : origSr;
	const mono = origSr > 24e3 ? downsample(monoFull, origSr, targetSr) : monoFull;
	const hann = makeHann(FFT_SIZE);
	const frames = Math.max(1, Math.floor((mono.length - FFT_SIZE) / HOP));
	const flux = new Float32Array(frames);
	const lowFlux = new Float32Array(frames);
	const midFlux = new Float32Array(frames);
	const highFlux = new Float32Array(frames);
	const lowE = new Float32Array(frames);
	const bassE = new Float32Array(frames);
	const midE = new Float32Array(frames);
	const highE = new Float32Array(frames);
	const vocalE = new Float32Array(frames);
	const rms = new Float32Array(frames);
	const chromaSum = /* @__PURE__ */ new Float32Array(12);
	const chromaFrames = new Array(frames);
	const re = new Float32Array(FFT_SIZE);
	const im = new Float32Array(FFT_SIZE);
	const prev = new Float32Array(FFT_SIZE / 2);
	const kKick = hzBin(90, sr, FFT_SIZE);
	const kBass = hzBin(250, sr, FFT_SIZE);
	const kMid = hzBin(2e3, sr, FFT_SIZE);
	const kHigh = hzBin(7e3, sr, FFT_SIZE);
	const kVox0 = hzBin(300, sr, FFT_SIZE);
	const kVox1 = hzBin(3400, sr, FFT_SIZE);
	const kCh0 = hzBin(80, sr, FFT_SIZE);
	const kCh1 = hzBin(5e3, sr, FFT_SIZE);
	const nyq = FFT_SIZE / 2;
	report(18, "Scanning frequencies");
	for (let f = 0; f < frames; f++) {
		const off = f * HOP;
		for (let i = 0; i < FFT_SIZE; i++) {
			re[i] = (mono[off + i] ?? 0) * (hann[i] ?? 0);
			im[i] = 0;
		}
		fftRadix2(re, im);
		let fl = 0;
		let ll = 0;
		let ml = 0;
		let hl = 0;
		let le = 0;
		let be = 0;
		let me = 0;
		let he = 0;
		let ve = 0;
		let energy = 0;
		const chroma = /* @__PURE__ */ new Float32Array(12);
		for (let k = 1; k < nyq; k++) {
			const mag = Math.hypot(re[k] ?? 0, im[k] ?? 0);
			const d = mag - (prev[k] ?? 0) * .9;
			const pos = d > 0 ? d : 0;
			fl += pos;
			if (k <= kKick) ll += pos;
			else if (k <= kMid) ml += pos;
			else hl += pos;
			const p = mag * mag;
			energy += p;
			if (k <= kKick) le += p;
			if (k <= kBass) be += p;
			if (k > kKick && k <= kMid) me += p;
			if (k >= kHigh) he += p;
			if (k >= kVox0 && k <= kVox1) ve += p;
			if (k >= kCh0 && k <= kCh1) {
				const hz = k * sr / FFT_SIZE;
				const midi = 69 + 12 * Math.log2(Math.max(hz, 1) / 440);
				const pc = (Math.round(midi) % 12 + 12) % 12;
				chroma[pc] += mag;
			}
			prev[k] = mag;
		}
		flux[f] = fl;
		lowFlux[f] = ll;
		midFlux[f] = ml;
		highFlux[f] = hl;
		lowE[f] = le;
		bassE[f] = be;
		midE[f] = me;
		highE[f] = he;
		vocalE[f] = ve;
		let s = 0;
		for (let i = 0; i < FFT_SIZE; i++) {
			const x = mono[off + i] ?? 0;
			s += x * x;
		}
		rms[f] = Math.sqrt(s / FFT_SIZE);
		chromaFrames[f] = chroma;
		for (let i = 0; i < 12; i++) chromaSum[i] += chroma[i] ?? 0;
		if (f % 220 === 0) {
			report(18 + Math.round(f / frames * 42), "Scanning frequencies");
			await yieldFrame();
		}
	}
	const hopTime = HOP / sr;
	const smooth = (src, w = 3) => {
		const out = new Float32Array(src.length);
		for (let i = 0; i < src.length; i++) {
			let s = 0;
			let c = 0;
			for (let j = -w; j <= w; j++) {
				const v = src[i + j];
				if (v !== void 0) {
					s += v;
					c++;
				}
			}
			out[i] = s / Math.max(1, c);
		}
		return out;
	};
	report(64, "Finding tempo");
	const onset = smooth(flux, 2);
	const maxOn = maxOf(onset, 1e-6);
	for (let i = 0; i < onset.length; i++) onset[i] = (onset[i] ?? 0) / maxOn;
	const minBpm = 70;
	const maxBpm = 180;
	let bestBpm = 120;
	let bestScore = -Infinity;
	let bestPhase = 0;
	for (let bpm = minBpm; bpm <= maxBpm; bpm += .5) {
		const period = 60 / bpm / hopTime;
		if (period < 2) continue;
		let phaseScore = -Infinity;
		let phase = 0;
		const steps = Math.max(4, Math.min(24, Math.round(period)));
		for (let p = 0; p < steps; p++) {
			const ph = p / steps * period;
			let s = 0;
			let n = 0;
			for (let i = ph; i < onset.length; i += period) {
				s += onset[i | 0] ?? 0;
				n++;
			}
			const val = n ? s / n : 0;
			if (val > phaseScore) {
				phaseScore = val;
				phase = ph;
			}
		}
		const prior = Math.exp(-.5 * ((bpm - 120) / 28) ** 2);
		const score = phaseScore * prior;
		if (score > bestScore) {
			bestScore = score;
			bestBpm = bpm;
			bestPhase = phase;
		}
	}
	for (const mul of [.5, 2]) {
		const bpm = bestBpm * mul;
		if (bpm < minBpm || bpm > maxBpm) continue;
		const dist = Math.abs(bpm - 120);
		const dist0 = Math.abs(bestBpm - 120);
		if (dist + 8 < dist0) bestBpm = bpm;
	}
	bestBpm = Math.round(bestBpm * 10) / 10;
	const beatPeriod = 60 / bestBpm;
	const beatOffset = bestPhase * hopTime % beatPeriod;
	const beats = [];
	const downbeats = [];
	for (let t = beatOffset; t < duration - .01; t += beatPeriod) {
		beats.push(t);
		if (Math.round((t - beatOffset) / beatPeriod) % 4 === 0) downbeats.push(t);
	}
	report(74, "Placing kicks and hats");
	const frameOf = (t) => Math.max(0, Math.min(frames - 1, Math.round(t / hopTime)));
	const grid = beatPeriod / 4;
	const hitsFrom = (env, minSepSec, k, dur) => {
		const idxs = peakPick(env, Math.max(1, Math.round(minSepSec / hopTime)), k);
		let maxV = 1e-6;
		return idxs.map((i) => {
			const t = i * hopTime;
			const v = env[i] ?? 0;
			if (v > maxV) maxV = v;
			return {
				t,
				v
			};
		}).map(({ t, v }) => {
			const q = quantizeTime(t, grid, .04);
			return {
				start: Math.min(duration - .02, Math.max(0, q)),
				duration: dur,
				velocity: v / maxV
			};
		});
	};
	const kickClips = hitsFrom(lowFlux, .18, 1.15, .12);
	const snareClips = hitsFrom(midFlux, .16, 1.35, .14).filter((c) => {
		const f = frameOf(c.start);
		return (highE[f] ?? 0) > 0 || (midE[f] ?? 0) > 0;
	});
	const hatClips = hitsFrom(highFlux, .045, .85, .055);
	report(82, "Reading bass and vocals");
	const envRate = 40;
	const envN = Math.max(8, Math.ceil(duration * envRate));
	const resampleEnv = (src) => {
		const out = new Float32Array(envN);
		const max = maxOf(src, 1e-9);
		for (let i = 0; i < envN; i++) {
			const f = i / envN * duration / hopTime;
			const a = Math.floor(f);
			const b = Math.min(frames - 1, a + 1);
			const frac = f - a;
			const v = (1 - frac) * (src[a] ?? 0) + frac * (src[b] ?? 0);
			out[i] = v / max;
		}
		return out;
	};
	const envelopes = {
		master: resampleEnv(rms),
		kick: resampleEnv(lowE),
		snare: resampleEnv(midE),
		hats: resampleEnv(highE),
		bass: resampleEnv(bassE),
		vocals: resampleEnv(vocalE),
		chords: resampleEnv(midE)
	};
	const bassClips = regionsFromEnvelope(envelopes.bass, envRate, duration, .22, .18);
	const vocalClips = regionsFromEnvelope(envelopes.vocals, envRate, duration, .28, .28).filter((c) => {
		const f = frameOf(c.start + c.duration / 2);
		return (lowFlux[f] ?? 0) + (highFlux[f] ?? 0) < (flux[f] ?? 1) * 1.8;
	});
	report(90, "Detecting chords");
	const chords = [];
	if (beats.length) {
		let lastName = "";
		for (let b = 0; b < beats.length; b++) {
			const t0 = beats[b];
			const t1 = beats[b + 1] ?? duration;
			const f0 = frameOf(t0);
			const f1 = frameOf(t1);
			const chroma = /* @__PURE__ */ new Float32Array(12);
			for (let f = f0; f <= f1; f++) {
				const c = chromaFrames[f];
				if (!c) continue;
				for (let i = 0; i < 12; i++) chroma[i] += c[i] ?? 0;
			}
			const match = matchChord(chroma);
			const name = chordName(match.root, match.quality);
			const energyBeat = (rms[f0] ?? 0) + (midE[f0] ?? 0);
			if (match.score < .55 || energyBeat < 1e-8) continue;
			if (name === lastName && chords.length) {
				const prevC = chords[chords.length - 1];
				prevC.duration = t1 - prevC.start;
			} else {
				chords.push({
					start: t0,
					duration: t1 - t0,
					name,
					root: match.root,
					quality: match.quality
				});
				lastName = name;
			}
		}
	}
	const chordClips = chords.map((c) => ({
		start: c.start,
		duration: c.duration,
		velocity: .85,
		label: c.name,
		pitch: 60 + c.root
	}));
	const { key, mode } = detectKey(chromaSum);
	const barLen = beatPeriod * 4;
	const sections = [];
	const barCount = Math.max(1, Math.floor(duration / barLen));
	const barEnergy = [];
	for (let i = 0; i < barCount; i++) {
		const t0 = beatOffset + i * barLen;
		const f0 = frameOf(t0);
		const f1 = frameOf(t0 + barLen);
		let s = 0;
		let n = 0;
		for (let f = f0; f < f1; f++) {
			s += rms[f] ?? 0;
			n++;
		}
		barEnergy.push(n ? s / n : 0);
	}
	const meanBar = barEnergy.reduce((a, b) => a + b, 0) / Math.max(1, barEnergy.length);
	let secStart = 0;
	let secName = "Intro";
	const nameFor = (i, e) => {
		if (i === 0) return "Intro";
		if (e > meanBar * 1.18) return "Drop";
		if (e < meanBar * .72) return "Break";
		return "Verse";
	};
	for (let i = 1; i < barEnergy.length; i++) {
		const n = nameFor(i, barEnergy[i] ?? 0);
		if (n !== secName) {
			const start = beatOffset + secStart * barLen;
			sections.push({
				start,
				duration: (i - secStart) * barLen,
				name: secName
			});
			secStart = i;
			secName = n;
		}
	}
	sections.push({
		start: beatOffset + secStart * barLen,
		duration: duration - (beatOffset + secStart * barLen),
		name: secName
	});
	const energy = envelopes.master;
	const lanes = {
		kick: kickClips,
		snare: snareClips,
		hats: hatClips,
		bass: bassClips,
		vocals: vocalClips,
		chords: chordClips
	};
	report(100, "Playlist ready");
	return {
		duration,
		sampleRate: origSr,
		bpm: bestBpm,
		beatOffset,
		timeSignature: [4, 4],
		key,
		keyMode: mode,
		waveform,
		beats,
		downbeats,
		lanes,
		envelopes,
		envelopeRate: envRate,
		chords,
		sections,
		energy,
		source: "file",
		fileName
	};
}
var DEMO_SR = 44100;
var DEMO_NAME = "Studio Demo — House";
var BEAT = 60 / 120;
var BAR = BEAT * 4;
var DURATION = 32;
var CHORD_MAP = [
	{
		bar: 0,
		name: "Am",
		root: 9,
		quality: "min",
		freqs: [
			220,
			261.63,
			329.63
		]
	},
	{
		bar: 1,
		name: "Am",
		root: 9,
		quality: "min",
		freqs: [
			220,
			261.63,
			329.63
		]
	},
	{
		bar: 2,
		name: "Am",
		root: 9,
		quality: "min",
		freqs: [
			220,
			261.63,
			329.63
		]
	},
	{
		bar: 3,
		name: "Am",
		root: 9,
		quality: "min",
		freqs: [
			220,
			261.63,
			329.63
		]
	},
	{
		bar: 4,
		name: "Am",
		root: 9,
		quality: "min",
		freqs: [
			220,
			261.63,
			329.63
		]
	},
	{
		bar: 5,
		name: "F",
		root: 5,
		quality: "maj",
		freqs: [
			174.61,
			220,
			261.63
		]
	},
	{
		bar: 6,
		name: "C",
		root: 0,
		quality: "maj",
		freqs: [
			130.81,
			164.81,
			196
		]
	},
	{
		bar: 7,
		name: "G",
		root: 7,
		quality: "maj",
		freqs: [
			196,
			246.94,
			293.66
		]
	},
	{
		bar: 8,
		name: "Am",
		root: 9,
		quality: "min",
		freqs: [
			220,
			261.63,
			329.63
		]
	},
	{
		bar: 9,
		name: "F",
		root: 5,
		quality: "maj",
		freqs: [
			174.61,
			220,
			261.63
		]
	},
	{
		bar: 10,
		name: "C",
		root: 0,
		quality: "maj",
		freqs: [
			130.81,
			164.81,
			196
		]
	},
	{
		bar: 11,
		name: "G",
		root: 7,
		quality: "maj",
		freqs: [
			196,
			246.94,
			293.66
		]
	},
	{
		bar: 12,
		name: "C",
		root: 0,
		quality: "maj",
		freqs: [
			130.81,
			164.81,
			196
		]
	},
	{
		bar: 13,
		name: "G",
		root: 7,
		quality: "maj",
		freqs: [
			196,
			246.94,
			293.66
		]
	},
	{
		bar: 14,
		name: "Am",
		root: 9,
		quality: "min",
		freqs: [
			220,
			261.63,
			329.63
		]
	},
	{
		bar: 15,
		name: "F",
		root: 5,
		quality: "maj",
		freqs: [
			174.61,
			220,
			261.63
		]
	}
];
var BASS_ROOT = {
	Am: 55,
	F: 43.65,
	C: 65.41,
	G: 49
};
function panGains(pan) {
	const a = (pan + 1) * Math.PI / 4;
	return [Math.cos(a), Math.sin(a)];
}
function addMono(l, r, i0, s, pan) {
	if (i0 < 0 || i0 >= l.length) return;
	const [gl, gr] = panGains(pan);
	l[i0] = (l[i0] ?? 0) + s * gl;
	r[i0] = (r[i0] ?? 0) + s * gr;
}
function writeKick(l, r, sr, t0, vel) {
	const n = Math.floor(.42 * sr);
	const i0 = Math.floor(t0 * sr);
	let phase = 0;
	for (let i = 0; i < n && i0 + i < l.length; i++) {
		const t = i / sr;
		const freq = 46 + 130 * Math.exp(-t * 20);
		const amp = Math.exp(-t * 6.5) * vel;
		const click = Math.exp(-t * 90) * Math.sin(2 * Math.PI * 1800 * t) * .22 * vel;
		const s = Math.sin(phase) * amp * .95 + click;
		phase += 2 * Math.PI * freq / sr;
		addMono(l, r, i0 + i, s, 0);
	}
}
function writeSnare(l, r, sr, t0, vel) {
	const n = Math.floor(.28 * sr);
	const i0 = Math.floor(t0 * sr);
	let seed = Math.floor(t0 * 1e3) * 1103515245 + 12345 >>> 0;
	const rand = () => {
		seed = seed * 1664525 + 1013904223 >>> 0;
		return seed / 4294967295 * 2 - 1;
	};
	let phase = 0;
	for (let i = 0; i < n && i0 + i < l.length; i++) {
		const t = i / sr;
		const noise = rand() * Math.exp(-t * 16);
		const body = Math.sin(phase) * Math.exp(-t * 10);
		phase += 2 * Math.PI * 190 / sr;
		const s = (noise * .55 + body * .4) * vel * .7;
		addMono(l, r, i0 + i, s, .04);
	}
}
function writeHat(l, r, sr, t0, vel, open) {
	const n = Math.floor((open ? .22 : .055) * sr);
	const i0 = Math.floor(t0 * sr);
	let seed = Math.floor(t0 * 1e4) * 214013 + 2531011 >>> 0;
	let hp = 0;
	const decay = open ? 9 : 38;
	for (let i = 0; i < n && i0 + i < l.length; i++) {
		seed = seed * 1664525 + 1013904223 >>> 0;
		const white = seed / 4294967295 * 2 - 1;
		hp = hp * .35 + white * .65;
		const air = white - hp;
		const t = i / sr;
		const s = air * Math.exp(-t * decay) * vel * (open ? .28 : .2);
		addMono(l, r, i0 + i, s, .28);
	}
}
function writeBass(l, r, sr, t0, dur, freq, vel) {
	const n = Math.floor(dur * sr);
	const i0 = Math.floor(t0 * sr);
	let phase1 = 0;
	let phase2 = 0;
	for (let i = 0; i < n && i0 + i < l.length; i++) {
		const t = i / sr;
		const env = Math.min(1, t / .01) * Math.exp(-t * 3.2) * (1 - Math.max(0, (t - (dur - .04)) / .04));
		const s1 = Math.sin(phase1);
		const s2 = Math.sin(phase2);
		const s = (Math.tanh(s1 * 1.8) * .7 + s2 * .3) * env * vel * .48;
		phase1 += 2 * Math.PI * freq / sr;
		phase2 += 2 * Math.PI * freq * 2.005 / sr;
		addMono(l, r, i0 + i, s, -.02);
	}
}
function writeChord(l, r, sr, t0, dur, freqs, vel) {
	const n = Math.floor(dur * sr);
	const i0 = Math.floor(t0 * sr);
	const phases = freqs.map(() => 0);
	for (let i = 0; i < n && i0 + i < l.length; i++) {
		const t = i / sr;
		const env = Math.min(1, t / .08) * (t > dur - .12 ? Math.max(0, (dur - t) / .12) : 1) * vel;
		let s = 0;
		for (let k = 0; k < freqs.length; k++) {
			const f = freqs[k];
			s += Math.sin(phases[k]) / freqs.length;
			s += Math.sin(phases[k] * 2) * .12 / freqs.length;
			phases[k] = (phases[k] ?? 0) + 2 * Math.PI * f * (1 + k * .0015) / sr;
		}
		addMono(l, r, i0 + i, s * env * .32, -.18);
	}
}
function writeLead(l, r, sr, t0, dur, freq, vel) {
	const n = Math.floor(dur * sr);
	const i0 = Math.floor(t0 * sr);
	let phase = 0;
	for (let i = 0; i < n && i0 + i < l.length; i++) {
		const t = i / sr;
		const attack = Math.min(1, t / .012);
		const release = t > dur - .05 ? Math.max(0, (dur - t) / .05) : 1;
		const vib = 1 + .006 * Math.sin(2 * Math.PI * 5.2 * t);
		const env = attack * release * vel;
		const tri = 1 - 4 * Math.abs(Math.round(phase / (2 * Math.PI)) - phase / (2 * Math.PI) - .25);
		const s = (Math.sin(phase) * .55 + tri * .45) * env * .22;
		phase += 2 * Math.PI * freq * vib / sr;
		addMono(l, r, i0 + i, s, .16);
	}
}
function toBuffer(ctx, l, r) {
	const b = ctx.createBuffer(2, l.length, DEMO_SR);
	b.copyToChannel(l, 0);
	b.copyToChannel(r, 1);
	return b;
}
function mixInto(dstL, dstR, srcL, srcR) {
	for (let i = 0; i < dstL.length; i++) {
		dstL[i] = (dstL[i] ?? 0) + (srcL[i] ?? 0);
		dstR[i] = (dstR[i] ?? 0) + (srcR[i] ?? 0);
	}
}
function softClip(l, r) {
	for (let i = 0; i < l.length; i++) {
		l[i] = Math.tanh((l[i] ?? 0) * .95);
		r[i] = Math.tanh((r[i] ?? 0) * .95);
	}
}
function peaksFrom(l, r, bins = 2400) {
	const n = bins;
	const min = new Float32Array(n);
	const max = new Float32Array(n);
	const step = l.length / n;
	for (let i = 0; i < n; i++) {
		const a = Math.floor(i * step);
		const b = Math.min(l.length, Math.floor((i + 1) * step));
		let lo = 0;
		let hi = 0;
		for (let j = a; j < b; j++) {
			const v = ((l[j] ?? 0) + (r[j] ?? 0)) * .5;
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
		min[i] = lo;
		max[i] = hi;
	}
	return {
		min,
		max
	};
}
function envFrom(l, r, rate) {
	const n = Math.ceil(DURATION * rate);
	const out = new Float32Array(n);
	const win = Math.max(1, Math.floor(DEMO_SR / rate));
	let peak = 1e-9;
	for (let i = 0; i < n; i++) {
		const a = i * win;
		let s = 0;
		for (let j = 0; j < win && a + j < l.length; j++) {
			const v = ((l[a + j] ?? 0) + (r[a + j] ?? 0)) * .5;
			s += v * v;
		}
		const rms = Math.sqrt(s / win);
		out[i] = rms;
		if (rms > peak) peak = rms;
	}
	for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) / peak;
	return out;
}
async function renderDemoProject(ctx) {
	const n = Math.floor(DURATION * DEMO_SR);
	const mk = () => [new Float32Array(n), new Float32Array(n)];
	const [kickL, kickR] = mk();
	const [snareL, snareR] = mk();
	const [hatL, hatR] = mk();
	const [bassL, bassR] = mk();
	const [chordL, chordR] = mk();
	const [voxL, voxR] = mk();
	const kicks = [];
	const snares = [];
	const hats = [];
	const bassClips = [];
	const voxClips = [];
	for (let bar = 0; bar < 16; bar++) {
		const tBar = bar * BAR;
		const inIntro = bar < 4;
		const inGroove = bar >= 4 && bar < 12;
		const inBreak = bar >= 12;
		const sixteenths = inGroove && bar >= 8;
		if (!inBreak) {
			for (let b = 0; b < 4; b++) {
				const t = tBar + b * BEAT;
				const vel = inIntro ? .72 : b === 0 ? 1 : .9;
				writeKick(kickL, kickR, DEMO_SR, t, vel);
				kicks.push({
					start: t,
					duration: .14,
					velocity: vel
				});
			}
			if (inGroove && bar >= 8) {
				const pickup = tBar + 4 * BEAT - .125;
				writeKick(kickL, kickR, DEMO_SR, pickup, .55);
				kicks.push({
					start: pickup,
					duration: .1,
					velocity: .55
				});
			}
		}
		if (inGroove || inBreak) for (const beat of inBreak ? [3] : [1, 3]) {
			const t = tBar + beat * BEAT;
			const vel = inBreak ? .55 : .92;
			writeSnare(snareL, snareR, DEMO_SR, t, vel);
			snares.push({
				start: t,
				duration: .16,
				velocity: vel
			});
		}
		const hatStep = sixteenths ? BEAT / 4 : BEAT / 2;
		const hatCount = sixteenths ? 16 : 8;
		for (let h = 0; h < hatCount; h++) {
			const t = tBar + h * hatStep;
			const open = !sixteenths && h % 2 === 1 && (inGroove || inBreak);
			const vel = h % 2 === 0 ? .7 : .42;
			writeHat(hatL, hatR, DEMO_SR, t, inIntro ? vel * .7 : vel, open);
			hats.push({
				start: t,
				duration: open ? .18 : .05,
				velocity: vel,
				label: open ? "OH" : void 0
			});
		}
		const spec = CHORD_MAP[bar];
		writeChord(chordL, chordR, DEMO_SR, tBar, BAR * .98, spec.freqs, inIntro ? .45 : inBreak ? .95 : .75);
		if (!inIntro) {
			const root = BASS_ROOT[spec.name] ?? 55;
			const pattern = inBreak ? [{
				at: 0,
				mul: 1,
				dur: BEAT * 1.5
			}, {
				at: 2,
				mul: 1.5,
				dur: BEAT
			}] : [
				{
					at: 0,
					mul: 1,
					dur: BEAT * .7
				},
				{
					at: .75,
					mul: 1,
					dur: BEAT * .35
				},
				{
					at: 1.5,
					mul: 1.5,
					dur: BEAT * .4
				},
				{
					at: 2,
					mul: 1,
					dur: BEAT * .7
				},
				{
					at: 3,
					mul: 2,
					dur: BEAT * .4
				},
				{
					at: 3.5,
					mul: 1.5,
					dur: BEAT * .4
				}
			];
			for (const p of pattern) {
				const t = tBar + p.at * BEAT;
				writeBass(bassL, bassR, DEMO_SR, t, p.dur, root * p.mul, .9);
				bassClips.push({
					start: t,
					duration: p.dur,
					velocity: .9,
					label: spec.name[0]
				});
			}
		}
		if (inGroove || inBreak) {
			const melody = spec.name === "Am" ? [
				[0, 440],
				[1, 523.25],
				[2, 659.25],
				[3, 523.25]
			] : spec.name === "F" ? [
				[0, 349.23],
				[1, 440],
				[2.5, 523.25],
				[3, 440]
			] : spec.name === "C" ? [
				[.5, 523.25],
				[1.5, 659.25],
				[2.5, 783.99],
				[3.5, 659.25]
			] : [
				[0, 392],
				[1, 493.88],
				[2, 587.33],
				[3.5, 493.88]
			];
			for (const [beat, freq] of melody) {
				const t = tBar + beat * BEAT;
				const dur = BEAT * .7;
				writeLead(voxL, voxR, DEMO_SR, t, dur, freq, inBreak ? 1 : .85);
				voxClips.push({
					start: t,
					duration: dur,
					velocity: .85
				});
			}
		}
	}
	const [mixL, mixR] = mk();
	mixInto(mixL, mixR, kickL, kickR);
	mixInto(mixL, mixR, snareL, snareR);
	mixInto(mixL, mixR, hatL, hatR);
	mixInto(mixL, mixR, bassL, bassR);
	mixInto(mixL, mixR, chordL, chordR);
	mixInto(mixL, mixR, voxL, voxR);
	softClip(mixL, mixR);
	const mix = toBuffer(ctx, mixL, mixR);
	const stems = {
		kick: toBuffer(ctx, kickL, kickR),
		snare: toBuffer(ctx, snareL, snareR),
		hats: toBuffer(ctx, hatL, hatR),
		bass: toBuffer(ctx, bassL, bassR),
		vocals: toBuffer(ctx, voxL, voxR),
		chords: toBuffer(ctx, chordL, chordR)
	};
	const beats = [];
	const downbeats = [];
	for (let i = 0; i < 64; i++) {
		const t = i * BEAT;
		beats.push(t);
		if (i % 4 === 0) downbeats.push(t);
	}
	const chords = CHORD_MAP.map((c) => ({
		start: c.bar * BAR,
		duration: BAR,
		name: c.name,
		root: c.root,
		quality: c.quality
	}));
	const chordClips = chords.map((c) => ({
		start: c.start,
		duration: c.duration,
		velocity: .88,
		label: c.name,
		pitch: 60 + c.root
	}));
	const sections = [
		{
			start: 0,
			duration: 8,
			name: "Intro"
		},
		{
			start: 8,
			duration: 8,
			name: "Groove"
		},
		{
			start: 16,
			duration: 8,
			name: "Drop"
		},
		{
			start: 24,
			duration: 8,
			name: "Break"
		}
	];
	const envRate = 40;
	const lanes = {
		kick: kicks,
		snare: snares,
		hats,
		bass: bassClips,
		vocals: voxClips,
		chords: chordClips
	};
	return {
		mix,
		stems,
		analysis: {
			duration: DURATION,
			sampleRate: DEMO_SR,
			bpm: 120,
			beatOffset: 0,
			timeSignature: [4, 4],
			key: "A minor",
			keyMode: "minor",
			waveform: peaksFrom(mixL, mixR),
			beats,
			downbeats,
			lanes,
			envelopes: {
				master: envFrom(mixL, mixR, envRate),
				kick: envFrom(kickL, kickR, envRate),
				snare: envFrom(snareL, snareR, envRate),
				hats: envFrom(hatL, hatR, envRate),
				bass: envFrom(bassL, bassR, envRate),
				vocals: envFrom(voxL, voxR, envRate),
				chords: envFrom(chordL, chordR, envRate)
			},
			envelopeRate: envRate,
			chords,
			sections,
			energy: envFrom(mixL, mixR, envRate),
			source: "demo",
			fileName: DEMO_NAME
		}
	};
}
var FILTERS = {
	kick: {
		type: "lowpass",
		frequency: 120,
		Q: .7
	},
	snare: {
		type: "bandpass",
		frequency: 1400,
		Q: .55
	},
	hats: {
		type: "highpass",
		frequency: 6800,
		Q: .7
	},
	bass: {
		type: "lowpass",
		frequency: 280,
		Q: .85
	},
	vocals: {
		type: "bandpass",
		frequency: 1600,
		Q: .75
	},
	chords: {
		type: "bandpass",
		frequency: 520,
		Q: .5
	}
};
var PlaybackEngine = class {
	ctx = null;
	mix = null;
	stems = null;
	analysis = null;
	master = null;
	analyser = null;
	laneGains = {};
	laneAnalysers = {};
	dryGain = null;
	sources = [];
	playing = false;
	startCtxTime = 0;
	startOffset = 0;
	offset = 0;
	volume = .9;
	muted = /* @__PURE__ */ new Set();
	solo = /* @__PURE__ */ new Set();
	onEnded = null;
	async unlock() {
		if (!this.ctx) this.ctx = new AudioContext();
		if (this.ctx.state === "suspended") await this.ctx.resume();
		this.ensureGraph();
		return this.ctx;
	}
	ensureGraph() {
		const ctx = this.ctx;
		if (!ctx || this.master) return;
		this.master = ctx.createGain();
		this.master.gain.value = this.volume;
		this.analyser = ctx.createAnalyser();
		this.analyser.fftSize = 1024;
		this.analyser.smoothingTimeConstant = .72;
		this.master.connect(this.analyser);
		this.analyser.connect(ctx.destination);
		this.dryGain = ctx.createGain();
		this.dryGain.gain.value = 1;
		this.dryGain.connect(this.master);
		for (const id of LANE_ORDER) {
			const g = ctx.createGain();
			g.gain.value = 0;
			const a = ctx.createAnalyser();
			a.fftSize = 256;
			a.smoothingTimeConstant = .5;
			a.connect(g);
			g.connect(this.master);
			this.laneGains[id] = g;
			this.laneAnalysers[id] = a;
		}
	}
	load(mix, analysis, stems) {
		this.stop();
		this.mix = mix;
		this.stems = stems;
		this.analysis = analysis;
		this.offset = 0;
		this.startOffset = 0;
	}
	setVolume(v) {
		this.volume = v;
		if (this.master) this.master.gain.setTargetAtTime(v, this.ctx?.currentTime ?? 0, .02);
	}
	setMute(id, mute) {
		if (mute) this.muted.add(id);
		else this.muted.delete(id);
		this.applyLaneGains();
	}
	setSolo(id, on) {
		if (on) this.solo.add(id);
		else this.solo.delete(id);
		this.applyLaneGains();
	}
	clearMix() {
		this.muted.clear();
		this.solo.clear();
		this.applyLaneGains();
	}
	laneAudible(id) {
		if (this.solo.size > 0) return this.solo.has(id) && !this.muted.has(id);
		return !this.muted.has(id);
	}
	applyLaneGains() {
		if (!this.ctx) return;
		const t = this.ctx.currentTime;
		const isolated = this.muted.size > 0 || this.solo.size > 0;
		if (this.dryGain) this.dryGain.gain.setTargetAtTime(isolated ? 0 : 1, t, .02);
		for (const id of LANE_ORDER) {
			const g = this.laneGains[id];
			if (!g) continue;
			const on = isolated && this.laneAudible(id);
			g.gain.setTargetAtTime(on ? 1 : 0, t, .02);
		}
	}
	currentTime() {
		if (!this.playing || !this.ctx) return this.offset;
		const t = this.startOffset + (this.ctx.currentTime - this.startCtxTime);
		const dur = this.mix?.duration ?? 0;
		if (t >= dur) return dur;
		return t;
	}
	seek(seconds) {
		const dur = this.mix?.duration ?? 0;
		this.offset = Math.max(0, Math.min(dur, seconds));
		if (this.playing) this.play(this.offset);
	}
	stop() {
		this.stopSources();
		this.playing = false;
		this.offset = 0;
		this.startOffset = 0;
	}
	pause() {
		this.offset = this.currentTime();
		this.stopSources();
		this.playing = false;
	}
	async play(from) {
		const ctx = await this.unlock();
		if (!this.mix || !this.dryGain) return;
		this.stopSources();
		const offset = from ?? this.offset;
		this.offset = offset;
		this.startOffset = offset;
		const startAt = ctx.currentTime + .03;
		this.startCtxTime = startAt;
		this.playing = true;
		this.applyLaneGains();
		if (this.stems && Object.keys(this.stems).length > 0) {
			for (const id of LANE_ORDER) {
				const buf = this.stems[id];
				const analyser = this.laneAnalysers[id];
				if (!buf || !analyser) continue;
				const src = ctx.createBufferSource();
				src.buffer = buf;
				src.connect(analyser);
				src.start(startAt, offset);
				this.sources.push(src);
			}
			const mixSrc = ctx.createBufferSource();
			mixSrc.buffer = this.mix;
			mixSrc.connect(this.dryGain);
			mixSrc.start(startAt, offset);
			mixSrc.onended = () => this.handleEnded(mixSrc);
			this.sources.push(mixSrc);
		} else {
			const src = ctx.createBufferSource();
			src.buffer = this.mix;
			src.connect(this.dryGain);
			for (const id of LANE_ORDER) {
				const spec = FILTERS[id];
				const analyser = this.laneAnalysers[id];
				if (!analyser) continue;
				const filter = ctx.createBiquadFilter();
				filter.type = spec.type;
				filter.frequency.value = spec.frequency;
				filter.Q.value = spec.Q;
				src.connect(filter);
				filter.connect(analyser);
			}
			src.start(startAt, offset);
			src.onended = () => this.handleEnded(src);
			this.sources.push(src);
		}
	}
	handleEnded(src) {
		if (!this.sources.includes(src)) return;
		if (!this.playing) return;
		const dur = this.mix?.duration ?? 0;
		if (this.currentTime() >= dur - .05) {
			this.playing = false;
			this.offset = dur;
			this.onEnded?.();
		}
	}
	stopSources() {
		for (const s of this.sources) try {
			s.onended = null;
			s.stop();
			s.disconnect();
		} catch {}
		this.sources = [];
	}
	getMasterSpectrum(out) {
		if (!this.analyser) return;
		this.analyser.getByteFrequencyData(out);
	}
	getLaneLevel(id) {
		const a = this.laneAnalysers[id];
		if (!a) return 0;
		const buf = new Uint8Array(a.fftSize);
		a.getByteTimeDomainData(buf);
		let peak = 0;
		for (let i = 0; i < buf.length; i++) {
			const v = Math.abs(((buf[i] ?? 128) - 128) / 128);
			if (v > peak) peak = v;
		}
		return peak;
	}
	dispose() {
		this.stop();
		try {
			this.ctx?.close();
		} catch {}
		this.ctx = null;
		this.master = null;
	}
};
var engine = null;
function getEngine() {
	if (!engine) engine = new PlaybackEngine();
	return engine;
}
function AnalysisSide({ analysis, currentTime }) {
	const chord = analysis.chords.find((c) => currentTime >= c.start && currentTime < c.start + c.duration) ?? analysis.chords[0];
	const section = analysis.sections.find((s) => currentTime >= s.start && currentTime < s.start + s.duration) ?? analysis.sections[0];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "hidden w-56 shrink-0 flex-col overflow-auto border-l border-border bg-card md:flex",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground",
			children: "Reading"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-5 px-4 py-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs uppercase tracking-wider text-muted-foreground",
						children: "Now"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 font-display text-3xl font-semibold tracking-tight text-foreground",
						children: chord?.name ?? "—"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: section?.name ?? "Arrangement"
					})
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mb-2 text-xs uppercase tracking-wider text-muted-foreground",
					children: "Progression"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
					className: "flex flex-wrap gap-1",
					children: analysis.chords.slice(0, 16).map((c, i) => {
						const on = currentTime >= c.start && currentTime < c.start + c.duration;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: on ? "rounded-sm bg-primary px-1.5 py-0.5 font-mono text-xs text-primary-foreground" : "rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
							children: c.name
						}, `${c.start}-${i}`);
					})
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mb-2 text-xs uppercase tracking-wider text-muted-foreground",
					children: "Hits"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "flex flex-col gap-1.5 text-xs",
					children: LANE_ORDER.map((id) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "flex items-center gap-2 text-muted-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "size-1.5 rounded-full",
								style: { background: `var(${LANE_META[id].colorVar})` }
							}), LANE_META[id].label]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono tabular-nums text-foreground",
							children: analysis.lanes[id].length
						})]
					}, id))
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs leading-relaxed text-muted-foreground",
					children: analysis.source === "demo" ? "True separated layers from the studio demo. Mute and solo like a mixer." : "Layers are read from frequency, transients, and harmony in your file. Solo a lane to hear that band."
				})
			]
		})]
	});
}
var HEADER_W = 112;
var RULER_H = 28;
var MASTER_H = 58;
var LANE_H = 52;
var CHORD_H = 58;
function laneHeight(id) {
	return id === "chords" ? CHORD_H : LANE_H;
}
function arrangementHeight() {
	return 86 + LANE_ORDER.reduce((s, id) => s + laneHeight(id), 0);
}
function readColor(name, fallback) {
	if (typeof window === "undefined") return fallback;
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
function roundRect(ctx, x, y, w, h, r) {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.arcTo(x + w, y, x + w, y + h, rr);
	ctx.arcTo(x + w, y + h, x, y + h, rr);
	ctx.arcTo(x, y + h, x, y, rr);
	ctx.arcTo(x, y, x + w, y, rr);
	ctx.closePath();
}
function drawWaveform(ctx, min, max, originX, y, totalW, h, color, duration) {
	const n = min.length;
	const mid = y + h / 2;
	ctx.fillStyle = color;
	ctx.beginPath();
	for (let i = 0; i < n; i++) {
		const px = originX + (i + .5) / n * totalW;
		const hi = (max[i] ?? 0) * (h * .46);
		if (i === 0) ctx.moveTo(px, mid - hi);
		else ctx.lineTo(px, mid - hi);
	}
	for (let i = n - 1; i >= 0; i--) {
		const px = originX + (i + .5) / n * totalW;
		const lo = (min[i] ?? 0) * (h * .46);
		ctx.lineTo(px, mid - lo);
	}
	ctx.closePath();
	ctx.fill();
}
function Arrangement({ analysis, pxPerSec, currentTime, playing, muted, solo, onSeek, onToggleMute, onToggleSolo }) {
	const scrollerRef = (0, import_react.useRef)(null);
	const canvasRef = (0, import_react.useRef)(null);
	const playheadRef = (0, import_react.useRef)(null);
	const followRef = (0, import_react.useRef)(true);
	const timeRef = (0, import_react.useRef)(currentTime);
	timeRef.current = currentTime;
	const width = Math.max(640, analysis.duration * pxPerSec + 48);
	const height = arrangementHeight();
	const draw = (0, import_react.useCallback)(() => {
		const canvas = canvasRef.current;
		const scroller = scrollerRef.current;
		if (!canvas || !scroller) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const viewW = scroller.clientWidth;
		canvas.width = Math.floor(viewW * dpr);
		canvas.height = Math.floor(height * dpr);
		canvas.style.width = `${viewW}px`;
		canvas.style.height = `${height}px`;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const scroll = scroller.scrollLeft;
		const tStart = Math.max(0, (scroll - 16) / pxPerSec);
		const tEnd = (scroll + viewW + 16) / pxPerSec;
		const bg = readColor("--color-card", "#121216");
		const alt = readColor("--color-background", "#0a0a0c");
		const grid = readColor("--color-gridline", "#1e1e26");
		const fg = readColor("--color-foreground", "#ececef");
		const mutedFg = readColor("--color-muted-foreground", "#8b8b94");
		const border = readColor("--color-border", "#2a2a32");
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, viewW, height);
		const beat = 60 / analysis.bpm;
		const bar = beat * 4;
		const xOf = (t) => t * pxPerSec - scroll;
		const firstBeat = Math.floor(tStart / beat) * beat;
		for (let t = firstBeat; t <= tEnd + beat; t += beat) {
			const x = xOf(t);
			const isBar = Math.abs(t / bar - Math.round(t / bar)) < 1e-6;
			ctx.strokeStyle = isBar ? border : grid;
			ctx.globalAlpha = isBar ? .85 : .5;
			ctx.beginPath();
			ctx.moveTo(Math.round(x) + .5, 0);
			ctx.lineTo(Math.round(x) + .5, height);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
		ctx.fillStyle = alt;
		ctx.fillRect(0, 0, viewW, RULER_H);
		ctx.strokeStyle = border;
		ctx.beginPath();
		ctx.moveTo(0, 27.5);
		ctx.lineTo(viewW, 27.5);
		ctx.stroke();
		ctx.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
		ctx.textBaseline = "middle";
		ctx.textAlign = "left";
		const firstBar = Math.floor(tStart / bar);
		for (let b = firstBar; b * bar <= tEnd + bar; b++) {
			const x = xOf(b * bar);
			if (x < -40 || x > viewW) continue;
			ctx.fillStyle = mutedFg;
			ctx.fillText(String(b + 1), x + 6, 19);
		}
		ctx.font = "600 9px 'IBM Plex Sans', sans-serif";
		ctx.fillStyle = fg;
		for (const sec of analysis.sections) {
			const x = xOf(sec.start);
			if (x < -90 || x > viewW) continue;
			ctx.fillText(sec.name.toUpperCase(), x + 6, 9);
		}
		let y = RULER_H;
		ctx.fillStyle = alt;
		ctx.fillRect(0, y, viewW, MASTER_H);
		drawWaveform(ctx, analysis.waveform.min, analysis.waveform.max, xOf(0), y + 6, analysis.duration * pxPerSec, 46, `${fg}8f`, analysis.duration);
		ctx.strokeStyle = border;
		ctx.beginPath();
		ctx.moveTo(0, y + MASTER_H - .5);
		ctx.lineTo(viewW, y + MASTER_H - .5);
		ctx.stroke();
		y += MASTER_H;
		const laneColors = {
			kick: readColor("--lane-kick", "#c4a07a"),
			snare: readColor("--lane-snare", "#c48474"),
			hats: readColor("--lane-hats", "#8aaf96"),
			bass: readColor("--lane-bass", "#5d8a8a"),
			vocals: readColor("--lane-vocals", "#7a8eaa"),
			chords: readColor("--lane-chords", "#9a8e7a")
		};
		LANE_ORDER.forEach((id, index) => {
			const h = laneHeight(id);
			const dim = muted.has(id) || solo.size > 0 && !solo.has(id);
			ctx.globalAlpha = 1;
			ctx.fillStyle = index % 2 === 0 ? bg : alt;
			ctx.fillRect(0, y, viewW, h);
			const env = analysis.envelopes[id];
			const color = laneColors[id];
			const now = timeRef.current;
			if ((id === "bass" || id === "vocals" || id === "chords") && env && env.length) {
				ctx.globalAlpha = dim ? .16 : .2;
				ctx.fillStyle = color;
				ctx.beginPath();
				const mid = y + h / 2;
				ctx.moveTo(xOf(0), mid);
				for (let i = 0; i < env.length; i++) {
					const t = i / Math.max(1, env.length - 1) * analysis.duration;
					ctx.lineTo(xOf(t), mid - (env[i] ?? 0) * (h * .4));
				}
				for (let i = env.length - 1; i >= 0; i--) {
					const t = i / Math.max(1, env.length - 1) * analysis.duration;
					ctx.lineTo(xOf(t), mid + (env[i] ?? 0) * (h * .4));
				}
				ctx.closePath();
				ctx.fill();
			}
			ctx.font = id === "chords" ? "600 13px Syne, sans-serif" : "500 10px 'IBM Plex Sans', sans-serif";
			ctx.textBaseline = "middle";
			ctx.textAlign = "left";
			for (const clip of analysis.lanes[id]) {
				if (clip.start + clip.duration < tStart || clip.start > tEnd) continue;
				const x = xOf(clip.start);
				const w = Math.max(id === "hats" ? 2 : 5, clip.duration * pxPerSec - 1.5);
				const pad = id === "chords" ? 10 : id === "hats" ? 16 : 11;
				const active = now >= clip.start && now < clip.start + clip.duration;
				ctx.fillStyle = color;
				ctx.globalAlpha = dim ? .28 : active ? .98 : .52 + clip.velocity * .38;
				roundRect(ctx, x, y + pad, w, h - pad * 2, id === "hats" ? 1 : 3);
				ctx.fill();
				if (clip.label && w > 24) {
					ctx.globalAlpha = dim ? .45 : .95;
					ctx.fillStyle = alt;
					ctx.fillText(clip.label, x + 7, y + h / 2);
				}
			}
			ctx.globalAlpha = 1;
			ctx.strokeStyle = border;
			ctx.beginPath();
			ctx.moveTo(0, y + h - .5);
			ctx.lineTo(viewW, y + h - .5);
			ctx.stroke();
			y += h;
		});
	}, [
		analysis,
		pxPerSec,
		muted,
		solo,
		height
	]);
	(0, import_react.useEffect)(() => {
		draw();
	}, [draw, currentTime]);
	(0, import_react.useEffect)(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		const onScroll = () => draw();
		scroller.addEventListener("scroll", onScroll, { passive: true });
		const ro = new ResizeObserver(() => draw());
		ro.observe(scroller);
		return () => {
			scroller.removeEventListener("scroll", onScroll);
			ro.disconnect();
		};
	}, [draw]);
	(0, import_react.useEffect)(() => {
		const scroller = scrollerRef.current;
		const playhead = playheadRef.current;
		if (!scroller || !playhead) return;
		let raf = 0;
		const tick = () => {
			const x = timeRef.current * pxPerSec;
			playhead.style.transform = `translateX(${x}px)`;
			if (playing && followRef.current) {
				const left = scroller.scrollLeft;
				const view = scroller.clientWidth;
				const margin = view * .28;
				if (x > left + view - margin) scroller.scrollLeft = x - view * .42;
				else if (x < left) scroller.scrollLeft = Math.max(0, x);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [pxPerSec, playing]);
	const onPointer = (e) => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		const rect = scroller.getBoundingClientRect();
		const x = scroller.scrollLeft + (e.clientX - rect.left);
		onSeek(Math.max(0, Math.min(analysis.duration, x / pxPerSec)));
		followRef.current = true;
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "z-20 flex shrink-0 flex-col border-r border-border bg-background",
			style: { width: HEADER_W },
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex items-center px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground",
					style: { height: RULER_H },
					children: "Playlist"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2 border-t border-border px-3",
					style: { height: MASTER_H },
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2 rounded-full bg-foreground/70" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs font-medium text-foreground",
						children: "Master"
					})]
				}),
				LANE_ORDER.map((id) => {
					const meta = LANE_META[id];
					const isMuted = muted.has(id);
					const isSolo = solo.has(id);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-1 border-t border-border px-2",
						style: { height: laneHeight(id) },
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "size-2.5 shrink-0 rounded-sm",
								style: { background: `var(${meta.colorVar})` }
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "min-w-0 flex-1 truncate text-xs font-medium text-foreground",
								children: meta.label
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": `Mute ${meta.label}`,
								"aria-pressed": isMuted,
								onClick: () => onToggleMute(id),
								className: cn("flex size-7 items-center justify-center rounded-sm text-[10px] font-medium", isMuted ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"),
								children: "M"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": `Solo ${meta.label}`,
								"aria-pressed": isSolo,
								onClick: () => onToggleSolo(id),
								className: cn("flex size-7 items-center justify-center rounded-sm text-[10px] font-medium", isSolo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"),
								children: "S"
							})
						]
					}, id);
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			ref: scrollerRef,
			className: "min-h-0 min-w-0 flex-1 overflow-auto",
			onScroll: () => {
				const s = scrollerRef.current;
				if (!s) return;
				const x = timeRef.current * pxPerSec;
				followRef.current = x >= s.scrollLeft - 8 && x <= s.scrollLeft + s.clientWidth + 8;
			},
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative cursor-text",
				style: {
					width,
					height
				},
				onPointerDown: onPointer,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
					ref: canvasRef,
					className: "sticky left-0 top-0"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					ref: playheadRef,
					className: "pointer-events-none absolute top-0 z-10 w-px bg-playhead",
					style: {
						height,
						left: 0,
						willChange: "transform"
					},
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute -left-1.5 top-0 size-0 border-x-4 border-t-8 border-x-transparent border-t-playhead" })
				})]
			})
		})]
	});
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,opacity,transform,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:not-disabled:scale-[0.96]", {
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground hover:bg-primary/90",
			secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border",
			ghost: "text-foreground hover:bg-accent",
			outline: "border border-border bg-transparent hover:bg-accent",
			destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90"
		},
		size: {
			default: "h-11 px-4",
			sm: "h-9 px-3 text-xs",
			lg: "h-12 px-5",
			icon: "size-11",
			"icon-sm": "size-9"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
var Button = import_react.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size,
			className
		})),
		ref,
		...props
	});
});
Button.displayName = "Button";
function IdleScreen({ onFiles, onDemo, busy }) {
	const inputRef = (0, import_react.useRef)(null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-dvh flex-col bg-background",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "flex items-center justify-between px-5 py-5 md:px-10",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-display text-lg font-semibold tracking-tight",
				children: "LANES"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "hidden text-xs text-muted-foreground sm:block",
				children: "Producer playlist"
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 pb-16 md:px-10",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "stagger-in max-w-xl",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-medium uppercase tracking-wider text-muted-foreground",
						children: "Audio analyzer"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-3 font-display text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl",
						children: "Drop a track. Watch the arrangement write itself."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 max-w-md text-base leading-relaxed text-muted-foreground",
						children: "Kicks, snares, hats, bass, vocals, and chords laid out on a studio playlist — with BPM, key, and a moving playhead."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-8 flex flex-wrap gap-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								type: "button",
								disabled: busy,
								onClick: () => inputRef.current?.click(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Upload, { className: "size-4" }), "Upload audio"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "secondary",
								disabled: busy,
								onClick: onDemo,
								children: "Play studio demo"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								ref: inputRef,
								type: "file",
								accept: "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac",
								className: "sr-only",
								onChange: (e) => {
									if (e.target.files?.length) onFiles(e.target.files);
									e.target.value = "";
								}
							})
						]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniPlaylist, {})]
		})]
	});
}
function MiniPlaylist() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative mt-14 overflow-hidden rounded-xl border border-border bg-card p-4 md:p-5",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-3 flex items-center justify-between text-xs text-muted-foreground",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Playlist" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono tabular-nums",
				children: "120.0 BPM · A minor"
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative space-y-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lane, {
					color: "var(--lane-kick)",
					label: "Kick",
					blocks: [
						0,
						12.5,
						25,
						37.5,
						50,
						62.5,
						75,
						87.5
					],
					w: 7
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lane, {
					color: "var(--lane-snare)",
					label: "Snare",
					blocks: [
						12.5,
						37.5,
						62.5,
						87.5
					],
					w: 8
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lane, {
					color: "var(--lane-hats)",
					label: "Hats",
					blocks: [
						0,
						6,
						12.5,
						18,
						25,
						31,
						37.5,
						44,
						50,
						56,
						62.5,
						69,
						75,
						81,
						87.5,
						94
					],
					w: 3
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lane, {
					color: "var(--lane-bass)",
					label: "Bass",
					blocks: [
						0,
						25,
						50,
						75
					],
					w: 22
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lane, {
					color: "var(--lane-vocals)",
					label: "Vocals",
					blocks: [
						25,
						50,
						62
					],
					w: 18
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lane, {
					color: "var(--lane-chords)",
					label: "Chords",
					blocks: [
						0,
						25,
						50,
						75
					],
					w: 23,
					labels: [
						"Am",
						"F",
						"C",
						"G"
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "idle-playhead pointer-events-none absolute top-0 bottom-0 w-px bg-playhead" })
			]
		})]
	});
}
function Lane({ color, label, blocks, w, labels }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "w-14 shrink-0 text-xs text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "relative h-8 flex-1 rounded-sm bg-background",
			children: blocks.map((left, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "absolute top-1.5 bottom-1.5 rounded-sm",
				style: {
					left: `${left}%`,
					width: `${w}%`,
					background: color,
					opacity: .85
				},
				children: labels?.[i] ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "absolute inset-0 flex items-center justify-center font-display text-xs font-semibold text-background",
					children: labels[i]
				}) : null
			}, `${label}-${left}`))
		})]
	});
}
function Mixer({ levels, muted, solo, onToggleMute, onToggleSolo }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "hidden w-44 shrink-0 flex-col border-r border-border bg-card lg:flex",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground",
			children: "Mixer"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid flex-1 grid-cols-6 gap-1 px-2 py-3",
			children: LANE_ORDER.map((id) => {
				const meta = LANE_META[id];
				const level = levels[id] ?? 0;
				const isMuted = muted.has(id);
				const isSolo = solo.has(id);
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex min-h-0 flex-col items-center gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "relative flex min-h-24 w-3 flex-1 overflow-hidden rounded-full bg-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "absolute bottom-0 left-0 right-0 rounded-full",
								style: {
									height: `${Math.min(100, level * 140)}%`,
									background: `var(${meta.colorVar})`,
									opacity: isMuted ? .25 : 1
								}
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-col gap-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": `Mute ${meta.label}`,
								onClick: () => onToggleMute(id),
								className: cn("size-6 rounded-sm text-xs font-medium", isMuted ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"),
								children: "M"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": `Solo ${meta.label}`,
								onClick: () => onToggleSolo(id),
								className: cn("size-6 rounded-sm text-xs font-medium", isSolo ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"),
								children: "S"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-xs font-medium",
							style: { color: `var(${meta.colorVar})` },
							children: meta.short
						})
					]
				}, id);
			})
		})]
	});
}
function Spectrum({ active }) {
	const canvasRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const bins = /* @__PURE__ */ new Uint8Array(512);
		let raf = 0;
		const tick = () => {
			const dpr = Math.min(2, window.devicePixelRatio || 1);
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
				canvas.width = Math.floor(w * dpr);
				canvas.height = Math.floor(h * dpr);
			}
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, w, h);
			if (active) getEngine().getMasterSpectrum(bins);
			else bins.fill(0);
			const n = 96;
			const gap = 2;
			const barW = Math.max(2, (w - 190) / n);
			const step = Math.max(1, Math.floor(bins.length / n));
			for (let i = 0; i < n; i++) {
				let v = 0;
				for (let k = 0; k < step; k++) v += bins[i * step + k] ?? 0;
				v /= step * 255;
				const bh = Math.max(2, v * h * .92);
				const x = i * (barW + gap);
				ctx.fillStyle = "color-mix(in oklab, var(--color-primary) 70%, transparent)";
				ctx.fillRect(x, h - bh, barW, bh);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [active]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "h-16 border-t border-border bg-background px-4 py-2 md:h-20 md:px-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
			ref: canvasRef,
			className: "h-full w-full"
		})
	});
}
var Slider = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Slider$1, {
	ref,
	className: cn("relative flex w-full touch-none select-none items-center", props.orientation === "vertical" && "h-full w-auto flex-col", className),
	...props,
	children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderTrack, {
		className: cn("relative grow overflow-hidden rounded-full bg-muted", props.orientation === "vertical" ? "h-full w-1" : "h-1 w-full"),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRange, { className: cn("absolute bg-primary", props.orientation === "vertical" ? "w-full" : "h-full") })
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderThumb, { className: "block size-3.5 rounded-full border border-border bg-primary shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none" })]
}));
Slider.displayName = Slider$1.displayName;
function formatClock(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	const cs = Math.floor(seconds % 1 * 100);
	return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
function formatBars(seconds, bpm, offset = 0, beatsPerBar = 4) {
	const beats = Math.max(0, (seconds - offset) * (bpm / 60));
	return `${Math.floor(beats / beatsPerBar) + 1}.${Math.floor(beats % beatsPerBar) + 1}.${Math.floor(beats * 4 % 4) + 1}`;
}
function Transport({ analysis, playing, currentTime, volume, pxPerSec, onPlayPause, onStop, onSeek, onVolume, onZoom, onClose }) {
	const progress = analysis.duration > 0 ? currentTime / analysis.duration : 0;
	const chord = analysis.chords.find((c) => currentTime >= c.start && currentTime < c.start + c.duration)?.name ?? "—";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-3 border-b border-border bg-background px-4 py-3 md:px-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						size: "icon",
						"aria-label": playing ? "Pause" : "Play",
						onClick: onPlayPause,
						children: playing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, { className: "size-4 fill-current" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "size-4 fill-current" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						size: "icon",
						variant: "secondary",
						"aria-label": "Stop",
						onClick: onStop,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { className: "size-3 fill-current" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-baseline justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "truncate font-display text-sm font-semibold tracking-tight text-foreground",
							children: analysis.fileName
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: onClose,
							className: "shrink-0 text-xs text-muted-foreground hover:text-foreground",
							children: "New track"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-muted",
						"aria-label": "Seek",
						onClick: (e) => {
							const rect = e.currentTarget.getBoundingClientRect();
							onSeek((e.clientX - rect.left) / rect.width * analysis.duration);
						},
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "block h-full rounded-full bg-primary",
							style: { width: `${Math.min(100, progress * 100)}%` }
						})
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-4 font-mono text-xs tabular-nums text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-foreground",
						children: formatBars(currentTime, analysis.bpm, analysis.beatOffset)
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
						formatClock(currentTime),
						" / ",
						formatClock(analysis.duration)
					] })]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center gap-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
				className: "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "BPM",
						value: analysis.bpm.toFixed(analysis.bpm % 1 ? 1 : 0)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Key",
						value: analysis.key
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Chord",
						value: chord
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Grid",
						value: `${analysis.timeSignature[0]}/${analysis.timeSignature[1]}`
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "ml-auto flex items-center gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-3.5 text-muted-foreground" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
						className: "w-24",
						min: 0,
						max: 1,
						step: .01,
						value: [volume],
						onValueChange: (v) => onVolume(v[0] ?? 0),
						"aria-label": "Volume"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						size: "icon-sm",
						variant: "ghost",
						"aria-label": "Zoom out",
						onClick: () => onZoom(Math.max(24, pxPerSec / 1.25)),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ZoomOut, { className: "size-4" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						size: "icon-sm",
						variant: "ghost",
						"aria-label": "Zoom in",
						onClick: () => onZoom(Math.min(280, pxPerSec * 1.25)),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ZoomIn, { className: "size-4" })
					})]
				})]
			})]
		})]
	});
}
function Stat({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-baseline gap-1.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
			className: "uppercase tracking-wider text-muted-foreground",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
			className: "font-mono text-foreground",
			children: value
		})]
	});
}
var MAX_BYTES = 50331648;
var MAX_DURATION = 480;
var zeroLevels = () => ({
	kick: 0,
	snare: 0,
	hats: 0,
	bass: 0,
	vocals: 0,
	chords: 0
});
function StudioApp() {
	const [status, setStatus] = (0, import_react.useState)("idle");
	const [progress, setProgress] = (0, import_react.useState)(0);
	const [progressLabel, setProgressLabel] = (0, import_react.useState)("Working");
	const [analysis, setAnalysis] = (0, import_react.useState)(null);
	const [playing, setPlaying] = (0, import_react.useState)(false);
	const [currentTime, setCurrentTime] = (0, import_react.useState)(0);
	const [volume, setVolume] = (0, import_react.useState)(.9);
	const [pxPerSec, setPxPerSec] = (0, import_react.useState)(72);
	const [muted, setMuted] = (0, import_react.useState)(/* @__PURE__ */ new Set());
	const [solo, setSolo] = (0, import_react.useState)(/* @__PURE__ */ new Set());
	const [levels, setLevels] = (0, import_react.useState)(zeroLevels);
	const [dragging, setDragging] = (0, import_react.useState)(false);
	const timeRef = (0, import_react.useRef)(0);
	const loadProject = (0, import_react.useCallback)((mix, next, stems) => {
		const engine = getEngine();
		engine.load(mix, next, stems);
		engine.setVolume(volume);
		engine.onEnded = () => {
			setPlaying(false);
			setCurrentTime(next.duration);
			timeRef.current = next.duration;
		};
		setAnalysis(next);
		setCurrentTime(0);
		timeRef.current = 0;
		setPlaying(false);
		setMuted(/* @__PURE__ */ new Set());
		setSolo(/* @__PURE__ */ new Set());
		setStatus("ready");
		const fit = typeof window !== "undefined" ? Math.max(36, (window.innerWidth - 320) / Math.max(8, next.duration)) : 72;
		setPxPerSec(Math.min(110, Math.max(40, fit)));
	}, [volume]);
	const runDemo = (0, import_react.useCallback)(async () => {
		setStatus("working");
		setProgress(8);
		setProgressLabel("Rendering studio demo");
		try {
			const engine = getEngine();
			await engine.unlock();
			setProgress(40);
			const project = await renderDemoProject(engine.ctx);
			setProgress(90);
			setProgressLabel("Writing playlist");
			loadProject(project.mix, project.analysis, project.stems);
		} catch (err) {
			console.error(err);
			toast.error("Could not render the demo.");
			setStatus("idle");
		}
	}, [loadProject]);
	const runFile = (0, import_react.useCallback)(async (file) => {
		if (file.size > MAX_BYTES) {
			toast.error("That file is too large. Try one under 48 MB.");
			return;
		}
		setStatus("working");
		setProgress(2);
		setProgressLabel("Decoding audio");
		try {
			const ctx = await getEngine().unlock();
			const raw = await file.arrayBuffer();
			const mix = await ctx.decodeAudioData(raw.slice(0));
			if (mix.duration > MAX_DURATION) {
				toast.error("Keep it under 8 minutes for a clean read.");
				setStatus("idle");
				return;
			}
			if (mix.duration < 1.2) {
				toast.error("Need a little more audio than that.");
				setStatus("idle");
				return;
			}
			const next = await analyzeAudioBuffer(mix, file.name.replace(/\.[^.]+$/, ""), (pct, label) => {
				setProgress(pct);
				setProgressLabel(label);
			});
			loadProject(mix, next, null);
		} catch (err) {
			console.error(err);
			toast.error("Could not decode that audio. Try WAV, MP3, or M4A.");
			setStatus("idle");
		}
	}, [loadProject]);
	const onFiles = (0, import_react.useCallback)((files) => {
		const file = files[0];
		if (!file) return;
		runFile(file);
	}, [runFile]);
	const togglePlay = (0, import_react.useCallback)(async () => {
		const engine = getEngine();
		if (!analysis) return;
		if (engine.playing) {
			engine.pause();
			setPlaying(false);
			const t = engine.currentTime();
			timeRef.current = t;
			setCurrentTime(t);
			return;
		}
		if (engine.currentTime() >= analysis.duration - .05) engine.seek(0);
		await engine.play();
		setPlaying(true);
	}, [analysis]);
	const stop = (0, import_react.useCallback)(() => {
		getEngine().stop();
		setPlaying(false);
		timeRef.current = 0;
		setCurrentTime(0);
	}, []);
	const seek = (0, import_react.useCallback)((t) => {
		getEngine().seek(t);
		timeRef.current = t;
		setCurrentTime(t);
	}, []);
	const onVolume = (0, import_react.useCallback)((v) => {
		setVolume(v);
		getEngine().setVolume(v);
	}, []);
	const toggleMute = (0, import_react.useCallback)((id) => {
		setMuted((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			getEngine().setMute(id, next.has(id));
			return next;
		});
	}, []);
	const toggleSolo = (0, import_react.useCallback)((id) => {
		setSolo((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			getEngine().setSolo(id, next.has(id));
			return next;
		});
	}, []);
	const closeSession = (0, import_react.useCallback)(() => {
		getEngine().stop();
		setAnalysis(null);
		setPlaying(false);
		setStatus("idle");
		setCurrentTime(0);
	}, []);
	(0, import_react.useEffect)(() => {
		let raf = 0;
		let lastUi = 0;
		const tick = (now) => {
			const engine = getEngine();
			if (engine.playing) {
				const t = engine.currentTime();
				timeRef.current = t;
				if (now - lastUi > 50) {
					lastUi = now;
					setCurrentTime(t);
					const next = zeroLevels();
					for (const id of LANE_ORDER) next[id] = engine.getLaneLevel(id);
					setLevels(next);
				}
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, []);
	(0, import_react.useEffect)(() => {
		const onKey = (e) => {
			const tag = e.target?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA") return;
			if (e.code === "Space") {
				e.preventDefault();
				if (status === "ready") togglePlay();
			} else if (e.code === "Home" || e.key === "0") {
				if (status === "ready") stop();
			} else if (e.code === "ArrowRight" && analysis) seek(Math.min(analysis.duration, timeRef.current + 60 / analysis.bpm));
			else if (e.code === "ArrowLeft" && analysis) seek(Math.max(0, timeRef.current - 60 / analysis.bpm));
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		status,
		togglePlay,
		stop,
		analysis,
		seek
	]);
	(0, import_react.useEffect)(() => {
		const onDragOver = (e) => {
			if (![...e.dataTransfer?.types ?? []].includes("Files")) return;
			e.preventDefault();
			setDragging(true);
		};
		const onDragLeave = (e) => {
			if (e.target === document.documentElement) setDragging(false);
		};
		const onDrop = (e) => {
			e.preventDefault();
			setDragging(false);
			if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
		};
		window.addEventListener("dragover", onDragOver);
		window.addEventListener("dragleave", onDragLeave);
		window.addEventListener("drop", onDrop);
		return () => {
			window.removeEventListener("dragover", onDragOver);
			window.removeEventListener("dragleave", onDragLeave);
			window.removeEventListener("drop", onDrop);
		};
	}, [onFiles]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TooltipProvider, {
		delayDuration: 250,
		children: [status === "idle" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IdleScreen, {
			onFiles,
			onDemo: runDemo,
			busy: false
		}) : status === "working" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkingScreen, {
			progress,
			label: progressLabel
		}) : analysis ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex h-dvh min-h-0 flex-col overflow-hidden bg-background",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Transport, {
					analysis,
					playing,
					currentTime,
					volume,
					pxPerSec,
					onPlayPause: () => void togglePlay(),
					onStop: stop,
					onSeek: seek,
					onVolume,
					onZoom: setPxPerSec,
					onClose: closeSession
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex min-h-0 flex-1",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mixer, {
							levels,
							muted,
							solo,
							onToggleMute: toggleMute,
							onToggleSolo: toggleSolo
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Arrangement, {
							analysis,
							pxPerSec,
							currentTime,
							playing,
							muted,
							solo,
							onSeek: seek,
							onToggleMute: toggleMute,
							onToggleSolo: toggleSolo
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AnalysisSide, {
							analysis,
							currentTime
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Spectrum, { active: playing })
			]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IdleScreen, {
			onFiles,
			onDemo: runDemo,
			busy: false
		}), dragging ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "fixed inset-0 z-50 flex items-center justify-center bg-background/80",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "rounded-lg border border-border bg-card px-6 py-4 font-display text-lg text-foreground",
				children: "Drop to analyze"
			})
		}) : null]
	});
}
function WorkingScreen({ progress, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex min-h-dvh flex-col items-center justify-center bg-background px-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-display text-sm font-semibold tracking-tight text-muted-foreground",
				children: "LANES"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "mt-6 font-display text-2xl font-semibold tracking-tight text-foreground",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-8 w-full max-w-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Progress, { value: progress }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-3 font-mono text-xs tabular-nums text-muted-foreground",
					children: [Math.round(progress), "%"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative mt-12 h-24 w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-y-0 w-px bg-playhead scan-line" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex h-full flex-col justify-center gap-2 px-4",
					children: [
						"Kick",
						"Hats",
						"Bass",
						"Chords"
					].map((name, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "w-12 text-xs text-muted-foreground",
							children: name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "h-2 flex-1 rounded-sm bg-muted",
							style: { opacity: .4 + i * .12 }
						})]
					}, name))
				})]
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StudioApp, {});
}
//#endregion
export { Home as component };
