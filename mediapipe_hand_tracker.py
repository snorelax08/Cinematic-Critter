"""
MediaPipe Hand Tracker → TouchDesigner OSC Sender
===================================================
Captures webcam, runs MediaPipe hand tracking (Tasks API), and streams
21 hand landmarks (x, y, z) to TouchDesigner via OSC.

Requirements:
    pip install mediapipe opencv-python python-osc numpy

Model file:
    Download hand_landmarker.task from:
    https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task

Usage:
    python mediapipe_hand_tracker.py
"""

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    HandLandmarker,
    HandLandmarkerOptions,
    RunningMode,
)
from pythonosc import udp_client
from pythonosc.osc_bundle_builder import OscBundleBuilder, IMMEDIATELY
from pythonosc.osc_message_builder import OscMessageBuilder
import time
import argparse
import numpy as np
import os
import threading


# ── Landmark names for reference ──────────────────────────────────────
LANDMARK_NAMES = [
    "wrist",
    "thumb_cmc", "thumb_mcp", "thumb_ip", "thumb_tip",
    "index_mcp", "index_pip", "index_dip", "index_tip",
    "middle_mcp", "middle_pip", "middle_dip", "middle_tip",
    "ring_mcp", "ring_pip", "ring_dip", "ring_tip",
    "pinky_mcp", "pinky_pip", "pinky_dip", "pinky_tip",
]

# ── Finger connections for skeleton drawing ───────────────────────────
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),       # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),       # Index
    (0, 9), (9, 10), (10, 11), (11, 12),   # Middle
    (0, 13), (13, 14), (14, 15), (15, 16), # Ring
    (0, 17), (17, 18), (18, 19), (19, 20), # Pinky
    (5, 9), (9, 13), (13, 17),             # Palm
]


class HandTracker:
    """Captures webcam, detects hands via MediaPipe Tasks API, sends landmarks via OSC."""

    def __init__(self, osc_ip="127.0.0.1", osc_port=9000, camera_id=0,
                 cam_width=1280, cam_height=720, max_hands=1,
                 detection_confidence=0.7, tracking_confidence=0.7,
                 smoothing_factor=0.5, model_path="hand_landmarker.task"):

        # ── OSC client ────────────────────────────────────────────────
        self.osc_client = udp_client.SimpleUDPClient(osc_ip, osc_port)
        print(f"[OSC] Sending to {osc_ip}:{osc_port}")

        # ── Smoothing ─────────────────────────────────────────────────
        self.smoothing = smoothing_factor
        self.prev_landmarks = {}  # hand_id -> list of (x,y,z)

        # ── Camera ────────────────────────────────────────────────────
        self.cap = cv2.VideoCapture(camera_id)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, cam_width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cam_height)
        self.cap.set(cv2.CAP_PROP_FPS, 60)

        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open camera {camera_id}")

        actual_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        print(f"[CAM] Opened camera {camera_id} at {actual_w}x{actual_h}")

        # ── Model path ────────────────────────────────────────────────
        script_dir = os.path.dirname(os.path.abspath(__file__))
        full_model_path = os.path.join(script_dir, model_path) if not os.path.isabs(model_path) else model_path

        if not os.path.exists(full_model_path):
            raise FileNotFoundError(
                f"Model file not found: {full_model_path}\n"
                f"Download it with:\n"
                f"  Invoke-WebRequest -Uri \"https://storage.googleapis.com/mediapipe-models/"
                f"hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task\" "
                f"-OutFile \"hand_landmarker.task\""
            )

        # ── MediaPipe Hand Landmarker (Tasks API) ─────────────────────
        # We use LIVE_STREAM mode with a callback for async processing
        self._latest_result = None
        self._result_lock = threading.Lock()

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=full_model_path),
            running_mode=RunningMode.LIVE_STREAM,
            num_hands=max_hands,
            min_hand_detection_confidence=detection_confidence,
            min_hand_presence_confidence=tracking_confidence,
            min_tracking_confidence=tracking_confidence,
            result_callback=self._on_result,
        )
        self.landmarker = HandLandmarker.create_from_options(options)
        self._timestamp_ms = 0
        print(f"[MODEL] Loaded {full_model_path}")

    def _on_result(self, result, output_image, timestamp_ms):
        """Callback from MediaPipe async processing."""
        with self._result_lock:
            self._latest_result = result

    def _smooth(self, hand_id, landmarks):
        """Exponential moving average to reduce jitter."""
        if hand_id not in self.prev_landmarks:
            self.prev_landmarks[hand_id] = landmarks
            return landmarks

        smoothed = []
        for i, (x, y, z) in enumerate(landmarks):
            px, py, pz = self.prev_landmarks[hand_id][i]
            sx = self.smoothing * px + (1 - self.smoothing) * x
            sy = self.smoothing * py + (1 - self.smoothing) * y
            sz = self.smoothing * pz + (1 - self.smoothing) * z
            smoothed.append((sx, sy, sz))

        self.prev_landmarks[hand_id] = smoothed
        return smoothed

    def _detect_gestures(self, landmarks):
        """Detect basic gestures from landmark positions."""
        gestures = {}

        # ── Pinch detection (thumb tip ↔ index tip distance) ──────────
        thumb_tip = np.array(landmarks[4])
        index_tip = np.array(landmarks[8])
        pinch_dist = np.linalg.norm(thumb_tip - index_tip)
        gestures["pinch"] = 1.0 if pinch_dist < 0.05 else 0.0
        gestures["pinch_amount"] = max(0.0, 1.0 - pinch_dist / 0.15)

        # ── Open hand detection ───────────────────────────────────────
        wrist = np.array(landmarks[0])
        fingertips = [np.array(landmarks[i]) for i in [4, 8, 12, 16, 20]]
        avg_dist = np.mean([np.linalg.norm(ft - wrist) for ft in fingertips])
        gestures["open_hand"] = 1.0 if avg_dist > 0.25 else 0.0

        # ── Fist detection ────────────────────────────────────────────
        gestures["fist"] = 1.0 if avg_dist < 0.15 else 0.0

        # ── Point detection (only index extended) ─────────────────────
        index_extended = np.linalg.norm(np.array(landmarks[8]) - wrist) > 0.2
        others_curled = all(
            np.linalg.norm(np.array(landmarks[tip]) - wrist) < 0.18
            for tip in [12, 16, 20]
        )
        gestures["pointing"] = 1.0 if (index_extended and others_curled) else 0.0

        return gestures

    def _send_osc_bundle(self, hand_id, landmarks, gestures):
        """Send all landmark data + gestures as a single OSC bundle."""
        bundle = OscBundleBuilder(IMMEDIATELY)

        # ── Send each landmark as /hand/{id}/{name} x y z ─────────────
        for i, (x, y, z) in enumerate(landmarks):
            msg = OscMessageBuilder(address=f"/hand/{hand_id}/{LANDMARK_NAMES[i]}")
            msg.add_arg(float(x))
            msg.add_arg(float(y))
            msg.add_arg(float(z))
            bundle.add_content(msg.build())

        # ── Send a flat array of all coordinates ──────────────────────
        flat_msg = OscMessageBuilder(address=f"/hand/{hand_id}/all")
        for (x, y, z) in landmarks:
            flat_msg.add_arg(float(x))
            flat_msg.add_arg(float(y))
            flat_msg.add_arg(float(z))
        bundle.add_content(flat_msg.build())

        # ── Send gestures ─────────────────────────────────────────────
        for gesture_name, value in gestures.items():
            msg = OscMessageBuilder(address=f"/hand/{hand_id}/gesture/{gesture_name}")
            msg.add_arg(float(value))
            bundle.add_content(msg.build())

        self.osc_client.send(bundle.build())

    def _draw_landmarks_on_frame(self, frame, landmarks_list, frame_w, frame_h):
        """Draw hand landmarks and connections on the OpenCV preview frame."""
        for hand_landmarks in landmarks_list:
            # Convert normalized coords to pixel coords
            points = []
            for lm in hand_landmarks:
                # landmarks come as normalized [0,1], convert to pixel
                px = int(lm.x * frame_w)
                py = int(lm.y * frame_h)
                points.append((px, py))
                cv2.circle(frame, (px, py), 4, (0, 255, 128), -1)

            # Draw connections
            for start_idx, end_idx in HAND_CONNECTIONS:
                if start_idx < len(points) and end_idx < len(points):
                    cv2.line(frame, points[start_idx], points[end_idx],
                             (0, 200, 255), 2)

    def run(self, show_preview=True):
        """Main loop: capture → detect → smooth → send → display."""
        print("[START] Hand tracking active. Press 'q' to quit.")
        fps_time = time.time()
        frame_count = 0

        while True:
            ret, frame = self.cap.read()
            if not ret:
                print("[WARN] Frame capture failed, retrying...")
                continue

            # Flip for mirror effect
            frame = cv2.flip(frame, 1)
            frame_h, frame_w = frame.shape[:2]

            # Convert BGR→RGB and create MediaPipe Image
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            # ── Run MediaPipe detection (async) ───────────────────────
            self._timestamp_ms += 33  # ~30fps timestamp increment
            try:
                self.landmarker.detect_async(mp_image, self._timestamp_ms)
            except Exception as e:
                print(f"[WARN] Detection error: {e}")
                continue

            # ── Process latest result ─────────────────────────────────
            with self._result_lock:
                result = self._latest_result

            if result and result.hand_landmarks:
                for hand_id, hand_landmarks in enumerate(result.hand_landmarks):
                    # Extract normalized (0-1) coordinates
                    raw = [(lm.x, lm.y, lm.z) for lm in hand_landmarks]

                    # Center coordinates: remap x,y from [0,1] to [-0.5, 0.5]
                    centered = [
                        (x - 0.5, -(y - 0.5), z)  # flip Y so up is positive
                        for (x, y, z) in raw
                    ]

                    # Apply smoothing
                    smoothed = self._smooth(hand_id, centered)

                    # Detect gestures
                    gestures = self._detect_gestures(smoothed)

                    # Send via OSC
                    self._send_osc_bundle(hand_id, smoothed, gestures)

                # Draw on preview
                if show_preview:
                    self._draw_landmarks_on_frame(
                        frame, result.hand_landmarks, frame_w, frame_h
                    )

            # ── FPS counter ───────────────────────────────────────────
            frame_count += 1
            elapsed = time.time() - fps_time
            if elapsed >= 1.0:
                fps = frame_count / elapsed
                if show_preview:
                    # Show FPS on frame
                    cv2.putText(frame, f"FPS: {fps:.0f}", (10, 30),
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                print(f"\r[FPS] {fps:.1f}", end="", flush=True)
                frame_count = 0
                fps_time = time.time()

            if show_preview:
                cv2.imshow("MediaPipe Hand Tracker -> TouchDesigner", frame)
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break

        self.landmarker.close()
        self.cap.release()
        cv2.destroyAllWindows()
        print("\n[STOP] Tracker shut down.")


def main():
    parser = argparse.ArgumentParser(description="MediaPipe -> TouchDesigner Hand Tracker")
    parser.add_argument("--ip", default="127.0.0.1", help="OSC target IP")
    parser.add_argument("--port", type=int, default=9000, help="OSC target port")
    parser.add_argument("--camera", type=int, default=0, help="Camera device index")
    parser.add_argument("--width", type=int, default=1280, help="Capture width")
    parser.add_argument("--height", type=int, default=720, help="Capture height")
    parser.add_argument("--hands", type=int, default=1, help="Max hands to track")
    parser.add_argument("--smoothing", type=float, default=0.4,
                        help="Smoothing factor (0=no smoothing, 0.9=very smooth)")
    parser.add_argument("--model", default="hand_landmarker.task",
                        help="Path to hand_landmarker.task model file")
    parser.add_argument("--no-preview", action="store_true", help="Disable CV2 preview")
    args = parser.parse_args()

    tracker = HandTracker(
        osc_ip=args.ip,
        osc_port=args.port,
        camera_id=args.camera,
        cam_width=args.width,
        cam_height=args.height,
        max_hands=args.hands,
        smoothing_factor=args.smoothing,
        model_path=args.model,
    )
    tracker.run(show_preview=not args.no_preview)


if __name__ == "__main__":
    main()
