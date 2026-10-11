---
title: "Harmonic oscillator, I turned jiggle physics code into a synthesizer"
short-title: "Harmonic oscillator"
permalink: "/harmonic-oscillator"
tags: [Audio, Synthesizer, Physics]
date: 2026-2-5
layout: post
---

Look at this thing, isn't it pretty?:

``` c++
float HarmonicOscillator::Step()
{
   m_v -= m_v * m_zeta + m_x * m_omega;
   m_x += m_v;
   return m_x;
}
```

I have been fascinated by it because of how much is capable of do. It oscillates sinusoidally (and sounds good), it decays exponentially in a user defined length (one might expect frequency and decay to be tied together, not the case), amplitude can also be defined (which saves a multiplication in later stages), and... ok. There are cons like exploding at low sampling frequencies, tone frequency drifting on long durations, it always decays, but, look at it. It's so short.

Here you can see it in action, with a little extra on top:

<div class="flex">
	<script src="/assets/harmonic-oscillator.js"></script>
	<span>
		<label>Frequency:<input type="range" id="frequency" min="55" max="880" value="220" list="f_markers"/></label>
		<label>Decay:<input type="range" id="decay" min="1" max="5000" value="1000" list="d_markers"/></label>
		<label>Amplitude:<input type="range" id="amplitude" min="0" max="1" value="0.5" list="a_markers" step="0.01"/></label>
		<label>Sweep:<input type="range" id="sweep" min="-8" max="4" value="0" list="s_markers" step="0.01"/></label>
		<button id="play">Play</button>
		<button id="stop">Stop</button>

		<datalist id="f_markers"><option value="220"></option></datalist>
		<datalist id="d_markers"><option value="1000"></option></datalist>
		<datalist id="a_markers"><option value="0.5"></option></datalist>
		<datalist id="s_markers"><option value="0"></option></datalist>
	</span>
	<div id="canvas_container" class="block_container_w100">
		<canvas id="canvas" width="300" height="100">Html5 canvas not supported.</canvas>
	</div>
</div>

Proper introduction is that it's an [Harmonic Oscillator](https://en.wikipedia.org/wiki/Harmonic_oscillator), also a [Mass-spring-damper Model](https://en.wikipedia.org/wiki/Mass-spring-damper_model), more commonly known as "jiggle physics", especially in video-games and related fields. Code above is a Semi-Implicit Euler implementation, I stitched it together from [Precise Control over Numeric Springing](https://allenchou.net/2015/04/game-math-precise-control-over-numeric-springing/) by Allen Chou (2015), and [The physics behind spring animations](https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/) by Maxime Heckel (2020). Here is a comparison with Implicit Euler without me simplifying zeta and omega:

``` c++
void SpringSemiImplicit(float &x, float &v, float x_target, float zeta, float omega, float h)
{
   v += -2.0f * h * zeta * omega * v + h * omega * omega * (x_target - x);
   x += h * v;
}

void SpringImplicit(float &x, float &v, float x_target, float zeta, float omega, float h)
{
   const float f = 1.0f + 2.0f * h * zeta * omega;
   const float oo = omega * omega;
   const float hoo = h * oo;
   const float hhoo = h * hoo;
   const float detInv = 1.0f / (f + hhoo);
   const float detX = f * x + h * v + hhoo * x_target;
   const float detV = v + hoo * (x_target - x);
   x = detX * detInv;
   v = detV * detInv;
}
```

Differences are stability and that I didn't manage to tame the implicit form. If we are pursuing stability, here is an implementation that seems to tackle every single corner [Spring-It-On: The Game Developer's Spring-Roll-Call](https://theorangeduck.com/page/spring-roll-call) by Daniel Holden (2021). Price to pay tho, is that uses conditionals, trigonometric functions, and it's long. However, we are doing audio here; code there is for procedural animations, and they truly need to survive wild frame-rate roller coasters.

## Step() function

Here is my `Step()` function in context:

``` c++
void HarmonicOscillator::Initialise(float sampling_frequency, float frequency, float decay_frames, float amplitude)
{
   // This Initialise() is incomplete,
   // m_omega, m_zeta, m_x, and m_v, are explained later
   m_zeta = 2.0f * m_zeta * m_omega;
   m_omega = m_omega * m_omega;
}

float HarmonicOscillator::StepWithSweep(float sweep)
{
   m_v -= m_v * m_zeta + m_x * m_omega * sweep;
   m_x += m_v * sweep;
   return m_x;

   // Chou's form:
   // m_v += -2.0f * h * m_zeta * m_omega * m_v + h * m_omega * m_omega * (x_target - m_x);
   // m_x += h * m_v;
   // return m_x;
}

float HarmonicOscillator::Step()
{
   m_v -= m_v * m_zeta + m_x * m_omega;
   m_x += m_v;
   return m_x;
}
```

Changes from Chou's `SpringSemiImplicit()` aren't that many. In `StepWithSweep()` the most noticeable one is that `x_target` is zero, thus deleted, this turns a spring model into an oscillator (audio signals should oscillate around zero). Done that, expressions `omega * omega` and `2.0f * zeta * omega` are resolved at initialisation rather than every frame. Of the three `h`, time-steps, two are repurposed as sweep, and one deleted. This is what in game development is known as `dt`, delta time, generally used to counter frame-rate changes by scaling motion/animations. Here it's scaling oscillation frequency, and only frequency (more on this later). By keeping the three original `h` we will also scale decay, and we don't want that.

Finally, `Step()` only differs on assuming a sweep or time-step of 1, thus deleted.

## Initialisation() function

Grab a cup of something; it looks like this:

``` c++
void HarmonicOscillator::Initialise(float sampling_frequency, float frequency, float decay_frames, float amplitude)
{
   m_omega = (frequency / sampling_frequency) * M_PI * 2.0f;
   m_zeta = 1.0f - expf(logf(0.001f) / decay_frames);

   m_x = 0.0f;
   m_v = m_omega * amplitude;

   m_zeta = m_zeta * 2.0f;
   m_omega = m_omega * m_omega;
}
```

`m_omega` is usual frequency business, now `m_zeta` is far more interesting, it's a non-standard half-life function to control decay. How does it work?, this talk is gold: [Lerp smoothing is broken](https://www.youtube.com/watch?v=LSNQuFEDOyQ) by Freya Holmér (2024), she covers it under "The Exact Damper" section.

What happens is that in the `Step()` function, the term `m_v -= m_v * m_zeta` is exponential. By using a `m_zeta` less than 1, `m_v` will approach zero without ever reaching it, with every step being smaller than previous one. We can see it by setting `m_v = 1; m_zeta = 0.5` and iterating on it:

0. `m_v = 1.0 - 1.0 * 0.5`
1. `m_v = 0.5 - 0.5 * 0.5`
2. `m_v = 0.25 - 0.25 * 0.5`
3. `m_v = 0.125 - 0.125 * 0.5`
4. `m_v = 0.0625 - 0.0625 * 0.5`

It looks nice on a plot, our real problem then is to find a `m_zeta` from a desired number of steps, or audio frames. Enter this monstrosity: `m_zeta = 1 - exp(log(0.125) / 3)`, it will give us a `m_zeta` value so in 3 frames we will be near or at 0.125, and it's: 0.5, makes sense. What about 7 frames to be near or at 0.333?, it says that a `m_zeta` of 0.14537076 is required, let's see:

0. `m_v = 1.0 - 1.0 * 0.14537076`
1. `m_v = 0.854 - 0.854 * 0.14537076`
2. `m_v = 0.730 - 0.730 * 0.14537076`
3. `m_v = 0.624 - 0.624 * 0.14537076`
4. `m_v = 0.533 - 0.533 * 0.14537076`
5. `m_v = 0.455 - 0.455 * 0.14537076`
6. `m_v = 0.389 - 0.389 * 0.14537076`
7. `m_v = 0.333 - 0.333 * 0.14537076`

Spooky. No more questions asked, it works. One wee tiny bitty problem tho, as said before, it approaches zero without ever reaching it, so to stop this the best solution is to simply do it at a tiny value. However that 0.001 in `m_zeta = 1.0f - expf(logf(0.001f) / decay_frames)` is not your typical `EPSILON`, it's -60dB (decibels).

Finally, the rest. `m_v = m_omega * amplitude` is only a value to compensate for this part `m_v -= (...) + this.x * this.omega` in `Step()`, it can be zero, nothing oscillates in that case, and you can set it later.

One room in the elephant tho, suddenly the expression `m_zeta = m_zeta * 2.0f` lost a multiplication between the multiple `Initialise()` functions I presented here. What happened is me doing a last optimisation that Chou compensated it with a division, not a biggie. Finally, no way I'm questioning `m_omega = m_omega * m_omega` existence (nor the `* 2.0f`), my DSP brain is warning me that these are the coefficients of a filter, and filters are truly, truly spooky.

## ***

Should mankind use this?, is it just novelty code?. Good question. My main premise here is that two multiplications, two additions, and one subtraction, are doing a lot of stuff. Now, who in the XXI century is counting assembly instructions?. Also, I didn't mention use-cases, nor results on how it explodes and when, oh well... see you later!, thanks for reading!.
