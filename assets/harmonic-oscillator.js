/*

MIT License

Copyright (c) 2026 Alexander Brandt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

"use strict"


function MillisecondsToFrames(sampling_frequency, milliseconds) {
	return Math.ceil((milliseconds * sampling_frequency) / 1000.0);
}


class SweepHarmonicOscillator {
	constructor() {
		this.omega = 0.0;
		this.zeta = 0.0;
		this.x = 0.0;
		this.v = 0.0;
		this.sweep = 1.0;
		this.sweep_target = 1.0;
		this.sweep_step = 1.0;
	}

	Initialise(sampling_frequency, frequency, decay_ms, amplitude, sweep_factor) {
		frequency = Math.max(55.0, frequency);
		decay_ms = Math.max(1.0, decay_ms);
		amplitude = Math.max(0.0, amplitude);

		const decay_frames = MillisecondsToFrames(sampling_frequency, decay_ms);

		this.omega = (frequency / sampling_frequency) * Math.PI * 2.0;
		this.zeta = 1.0 - Math.exp(Math.log(0.001) / decay_frames);

		this.x = 0.0;
		this.v = this.omega * amplitude;

		// Moved from Step():
		this.zeta = this.zeta * 2.0;
		this.omega = this.omega * this.omega;

		//
		this.sweep = 1.0;
		this.sweep_target = Math.pow(2.0, sweep_factor);

		const too_much = sampling_frequency / 4.0; // Less than typical '/ 2', it's to avoid it explode
		if (frequency * this.sweep_target > too_much)
			this.sweep_target = (this.sweep_target * (too_much)) / (frequency * this.sweep_target);

		this.sweep_step = 1.0 - Math.exp(Math.log(0.01) / decay_frames);
	}

	Step() {
		this.v -= this.v * this.zeta + this.x * this.omega * this.sweep;
		this.x += this.v * this.sweep;

		this.sweep = this.sweep + (this.sweep_target - this.sweep) * this.sweep_step;

		return this.x;
	}
}


// ################


function DrawSignal(osc, canvas, context, average_steps = 4) {
	context.beginPath();
	{
		const steps = 1024;
		const draw_step = canvas.width / steps;
		const centre = canvas.height / 2.0 - 0.5;

		let signal = 0.0;

		context.moveTo(0.0, centre);
		for (let i = 0; i < steps; i += 1) {

			signal = 0.0;
			for (let a = 0; a < average_steps; a += 1) {
				signal += Math.max(Math.min(osc.Step(), 1.0), -1.0);
			}
			signal = signal / average_steps;

			context.lineTo(draw_step * (i + 1), centre - signal * centre);
		}
	}
	context.stroke();
}

function Resize(canvas, context) {
	const container = document.getElementById("canvas_container");
	canvas.width = container.clientWidth;
	canvas.height = container.clientWidth / 3.0;

	const colour = getComputedStyle(canvas).color;

	context.font = "1rem 'TeX Gyre Heros', 'Arial', sans-serif";
	context.lineWidth = 2;
	context.strokeStyle = colour;
	context.fillStyle = colour;
}


// ################


let g_audio_context = null;
let g_audio_node;

function Play(sampling_frequency, osc) {
	let should_stop = true;
	if (g_audio_context == null) {
		g_audio_context = new AudioContext();
		should_stop = false;
	}

	let buffer = g_audio_context.createBuffer(1, sampling_frequency * 5.0, sampling_frequency);

	for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
		const data = buffer.getChannelData(channel);
		for (let i = 0; i < buffer.length; i++) {
			data[i] = Math.max(Math.min(osc.Step(), 1.0), -1.0);
		}
	}

	if (should_stop == true)
		g_audio_node.stop();

	// Cannot reuse audio nodes, documentation recommends to play and forget
	g_audio_node = new AudioBufferSourceNode(g_audio_context, { buffer: buffer });
	g_audio_node.connect(g_audio_context.destination);
	g_audio_node.start();
}

function Stop() {
	if (g_audio_context == null)
		return;

	g_audio_node.stop();
}


// ################


function Start() {
	let canvas = document.getElementById("canvas");
	let context = canvas.getContext("2d");

	const SAMPLING_FREQUENCY = 48000.0;
	let frequency = document.getElementById("frequency").valueAsNumber;
	let decay = document.getElementById("decay").valueAsNumber;
	let amplitude = document.getElementById("amplitude").valueAsNumber;
	let sweep = document.getElementById("sweep").valueAsNumber;

	let osc = new SweepHarmonicOscillator();

	function DrawCanvas() {
		osc.Initialise(SAMPLING_FREQUENCY / 2.0, frequency, decay, amplitude, sweep)

		context.clearRect(0.0, 0.0, canvas.width, canvas.height);
		DrawSignal(osc, canvas, context);
		context.fillText(frequency + "Hz, " + decay + " ms, " + amplitude + "x, sweep: " + sweep + "x", 4.0, canvas.height - 4.0);
	};

	document.getElementById("frequency").addEventListener("input", (event) => { frequency = event.target.value; DrawCanvas(); });
	document.getElementById("decay").addEventListener("input", (event) => { decay = event.target.value; DrawCanvas(); });
	document.getElementById("amplitude").addEventListener("input", (event) => { amplitude = event.target.value; DrawCanvas(); });
	document.getElementById("sweep").addEventListener("input", (event) => { sweep = event.target.value; DrawCanvas(); });

	document.getElementById("play").addEventListener("click", (event) => {
		osc.Initialise(SAMPLING_FREQUENCY, frequency, decay, amplitude, sweep)
		Play(SAMPLING_FREQUENCY, osc);
	});

	document.getElementById("stop").addEventListener("click", (event) => { Stop(); });

	window.addEventListener("resize", (event) => {
		Resize(canvas, context);
		DrawCanvas();
	});

	window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
		Resize(canvas, context);
		DrawCanvas();
	});

	// First draw
	Resize(canvas, context);
	DrawCanvas();
}

window.onload = Start;
