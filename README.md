# Hand-Tracked 3D Critter System 🦋👐

https://github.com/user-attachments/assets/623d8b2a-6fe5-48dc-b622-595835048e82


A real-time web application where your webcam tracks your hand, and a glowing 3D insect (butterfly or dragonfly) follows your fingers. Surrounded by particle swarms and floating code panels, this immersive experience runs entirely in the browser—no TouchDesigner required.

## 🌟 Features

### 1. Project Architecture & Core Technologies
- **Tech Stack:** Vite, Three.js, MediaPipe Tasks Vision.
- **Visual Aesthetic:** Dark, cinematic, high-contrast "void" environment with terminal-style floating panels.

### 2. Creature Manager & Aerodynamics
- **Dragonfly:** 12-segment tapered abdomen, 4 elongated veined wings, true multi-axis aerodynamic figure-8 flight mechanics.
- **Butterfly:** Ultra-detailed design with fuzz-like body, iridescent transmission-glass wings (purple/pink palette), procedural veining, and organic asymmetrical flapping with easing.

### 3. Cinematic Morph (Gesture Triggered)
Trigger the magical transformation sequence by **pinching and holding** for 1.5 seconds.
- **Stage 1 (Build-up):** Increased particle emission, glowing bloom charge-up, and slight inward pull.
- **Stage 2 (Dissolve):** Creature shatters into dense particle bursts.
- **Stage 3 (Swirl):** Particles enter a high-speed vortex orbit around the hand.
- **Stage 4 (Reformation):** Particles converge and fade into the new creature.

### 4. Living VFX Engine
- **Velocity Flow Fields:** Physical velocity mapping and Fractal Brownian Motion (FBM).
- **Particle Layers:** Micro (dust), Mid (sparkles), Accent (large cores) — over 600 swarm, trail, and burst particles.
- **Asynchronous Twinkles:** Procedural shader-driven twinkling and dynamic depth-of-field blurring.
- **Color Grading:** Real-time color shifting based on active creature (Teal/Cyan vs. Purple/Pink).

### 5. MediaPipe Hand Tracking
- 21 glowing white landmark dots mapped to your hand.
- Skeleton connection lines for structure.
- Exponential smoothing for smooth, jitter-free following.

### 6. Post-Processing & UI
- **Glow & Bloom:** UnrealBloomPass for an ethereal glow, ACES filmic tone mapping.
- **Floating UI:** 3 translucent code block panels with terminal-style text that animate dynamically.

## 🛠️ Architecture

* **🎥 Webcam Input** -> Routes to MediaPipe JS (in browser).
* **MediaPipe JS** -> Extracts 21 Hand Landmarks.
* **Three.js Scene:**
  * Maps landmarks to Hand Skeleton Dots.
  * Updates 3D Insect + Particle positions.
  * Renders Floating UI Panels.
* **Post-Processing** -> Applies Bloom and Tonemapping.
* **🖥️ Canvas Output** -> Final rendered frame to the user.

## 📁 File Structure

| File | Purpose |
|------|---------|
| `index.html` | HTML with canvas, loading overlay, and entry structure. |
| `style.css` | Dark premium aesthetic UI and layout styles. |
| `main.js` | Entry point — orchestrates the scene, lights, and animation loop. |
| `handTracker.js` | Implementation of the MediaPipe hand tracking integration. |
| `handVisualizer.js` | Renders the glowing dots + hand skeleton. |
| `insect.js` | Contains the detailed 3D butterfly/dragonfly mesh, materials, and flight logic. |
| `particles.js` | Manages the 600+ swarm, trail, and burst particles and their logic. |
| `uiPanels.js` | Logic for the floating translucent code block panels. |
| `postProcessing.js` | Applies the bloom/glow pipeline and visual effects to the final render. |

## 🚀 How to Run locally

1. Ensure you have Node.js installed.
2. Clone or navigate to the project directory:
   ```bash
   cd hand-critter
