/**
 * Hand Tracker — MediaPipe Hands via @mediapipe/tasks-vision
 * Provides real-time 21-landmark hand tracking from the webcam.
 */
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export class HandTracker {
  constructor() {
    this.landmarker = null;
    this.results = null;
    this.video = document.getElementById('webcam');
    this.running = false;
    this.onResults = null; // callback
  }

  async init(statusCallback) {
    statusCallback?.('Loading vision runtime...');
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    statusCallback?.('Loading hand landmark model...');
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    statusCallback?.('Requesting camera access...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: 'user' },
    });
    this.video.srcObject = stream;
    await new Promise((resolve) => {
      this.video.onloadedmetadata = () => {
        this.video.play();
        resolve();
      };
    });

    statusCallback?.('Hand tracking ready!');
    this.running = true;
  }

  detect() {
    if (!this.running || !this.landmarker || this.video.readyState < 2) return null;

    const now = performance.now();
    this.results = this.landmarker.detectForVideo(this.video, now);
    return this.results;
  }

  /**
   * Get landmarks for a specific hand, centered and Y-flipped.
   * Returns array of {x, y, z} in range [-0.5, 0.5] with Y-up.
   */
  getLandmarks(handIndex = 0) {
    if (!this.results?.landmarks?.[handIndex]) return null;
    return this.results.landmarks[handIndex].map((lm) => ({
      x: -(lm.x - 0.5),   // flip X for mirror
      y: -(lm.y - 0.5),    // flip Y so up is positive
      z: -lm.z,
    }));
  }

  getHandedness(handIndex = 0) {
    if (!this.results?.handedness?.[handIndex]) return null;
    return this.results.handedness[handIndex][0]?.categoryName; // 'Left' or 'Right'
  }

  get numHands() {
    return this.results?.landmarks?.length || 0;
  }

  destroy() {
    this.running = false;
    if (this.video.srcObject) {
      this.video.srcObject.getTracks().forEach((t) => t.stop());
    }
    this.landmarker?.close();
  }
}
