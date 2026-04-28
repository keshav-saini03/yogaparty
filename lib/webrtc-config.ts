// lib/webrtc-config.ts
//
// Single source of truth for tunables. Anything we might want to tweak post-
// demo (volume duck depth, video resolution, ramp durations) lives here.

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export const PC_CONFIG: RTCConfiguration = {
  iceServers: STUN_SERVERS,
  iceCandidatePoolSize: 0,
};

/**
 * "Music mode" mic constraints. Locks all browser-side audio processing OFF
 * so the OS audio profile stays in the high-quality playback class — the
 * specific fix for the YouTube-audio artifact that triggered this design.
 *
 * goog* keys are Chrome-specific and must be present alongside the standard
 * keys to fully suppress the profile flip on macOS / Windows.
 */
export const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    autoGainControl: false,
    noiseSuppression: false,
    // @ts-expect-error — non-standard Chrome flags, intentional
    googEchoCancellation: false,
    googAutoGainControl: false,
    googNoiseSuppression: false,
    googHighpassFilter: false,
  },
  video: {
    width: { ideal: 320 },
    height: { ideal: 240 },
    frameRate: { ideal: 24 },
  },
};

// Auto-duck thresholds. RMS is computed from a 256-bin AnalyserNode at 30 Hz.
export const SPEAKING_RMS_THRESHOLD = 0.06;
export const DUCK_FACTOR = 0.3;          // YT.volume during ducking = userVolume * 0.3
export const DUCK_RAMP_IN_MS = 200;
export const DUCK_RAMP_OUT_MS = 400;
export const DUCK_QUIET_HOLD_MS = 600;   // sustained quiet before ramp out

// Mesh reconciliation tick: catches any peer that fell off without a clean
// state-change event. See spec §5.4.
export const MESH_RECONCILE_INTERVAL_MS = 10_000;

// ICE failure recovery (spec §8.2).
export const ICE_DISCONNECTED_GRACE_MS = 5_000;

// Headphones tip — first-mic-on toast.
export const HEADPHONES_TIP_KEY = 'yp_hp_tip_seen';
export const HEADPHONES_TIP_DURATION_MS = 8_000;
