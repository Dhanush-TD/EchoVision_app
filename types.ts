// Add global type for window.Capacitor to fix TS error in App.tsx
declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: boolean;
    };
  }
}
// Type for COCO-SSD model predictions
export interface Detection {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  score: number;
}

// Type for the COCO-SSD model object loaded from the CDN
export interface CocoSsdModel {
  load: (config: { base?: 'lite_mobilenet_v2' | 'mobilenet_v1' | 'mobilenet_v2', onProgress?: (fraction: number) => void }) => Promise<DetectedObjectNet>;
}

export interface DetectedObjectNet {
    detect: (input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, maxNumBoxes?: number, minScore?: number) => Promise<Detection[]>;
    dispose: () => void;
}

// Type for an object being tracked in the scene
export interface TrackedObject {
  id: number;
  class: string;
  bbox: [number, number, number, number];
  firstSeen: number;
  lastSeen: number;
  currentDistance: number;
  notified: boolean;
  criticallyNotified: boolean;
  inPath: boolean;
}

// Type for chat messages
export interface Message {
  id: number;
  text: string;
  type: 'bot' | 'user' | 'alert';
}

// App state enum
export enum AppState {
    LOADING_MODEL = 'LOADING_MODEL',
    READY = 'READY',
    SCANNING = 'SCANNING',
    ERROR = 'ERROR',
}

// Extend the Window interface to include global objects from CDNs
declare global {
    interface Window {
        cocoSsd: CocoSsdModel;
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}
