// Microphone permission is handled via getUserMedia for browser and hybrid apps

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AppState as AppStateEnum } from './types';
import { AppState } from './types';
import type { TrackedObject, Message, DetectedObjectNet, Detection } from './types';
import { Camera } from '@capacitor/camera';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

// --- Audio Feedback Services ---
// AudioFeedback class to prevent overlapping speech
class AudioFeedbackClass {
    private audioQueue: string[] = [];
    private isSpeaking: boolean = false;

    speak(text: string) {
        console.log('[AudioFeedback] speak called:', text);
        this.audioQueue.push(text);
        this.playNextAudio();
    }

    private playNextAudio() {
        if (this.isSpeaking || this.audioQueue.length === 0) return;
        this.isSpeaking = true;
        const text = this.audioQueue.shift();
        console.log('[AudioFeedback] playNextAudio:', text);
        // Use Capacitor TTS on native platforms, browser TTS otherwise
        if (this.isNativePlatform()) {
            TextToSpeech.speak({ text })
                .then(() => {
                    console.log('[AudioFeedback] Native TTS succeeded.');
                    this.isSpeaking = false;
                    this.playNextAudio();
                })
                .catch((err: any) => {
                    console.warn('[AudioFeedback] Native TTS failed, falling back to browser TTS:', err);
                    this.isSpeaking = false;
                    this.playBrowserTTS(text);
                });
        } else {
            console.log('[AudioFeedback] Using browser TTS fallback.');
            this.playBrowserTTS(text);
        }
    }

    private isNativePlatform(): boolean {
        // Capacitor provides a global object for platform detection
        return !!(window.Capacitor && window.Capacitor.isNativePlatform);
    }

    private playBrowserTTS(text: string) {
        if ('speechSynthesis' in window && window.speechSynthesis) {
            const synth = window.speechSynthesis;
            const utter = new SpeechSynthesisUtterance(text);
            utter.onend = () => {
                this.isSpeaking = false;
                this.playNextAudio();
            };
            utter.onerror = (err) => {
                console.warn('[AudioFeedback] Browser TTS error:', err);
                this.isSpeaking = false;
                this.playNextAudio();
            };
            // Cancel any ongoing speech before speaking
            synth.cancel();
            setTimeout(() => synth.speak(utter), 50);
        } else {
            console.warn('[AudioFeedback] No TTS available.');
            this.isSpeaking = false;
            this.playNextAudio();
        }
    }
}

const AudioFeedback = new AudioFeedbackClass();
    // (Removed misplaced JSX outside of functions)

const MessageComponent: React.FC<{ msg: Message }> = ({ msg }) => {
    const baseClasses = "p-2 rounded-lg max-w-[calc(100%-40px)] mb-2 text-sm shadow-md bg-black";
    const typeClasses = {
        bot: "text-white self-start",
        user: "text-white self-end",
        alert: "text-white self-center font-bold w-full text-center"
    };
    return (
        <div className={`flex ${msg.type === 'user' ? 'justify-end' : (msg.type === 'alert' ? 'justify-center' : 'justify-start')} w-full`}>
            <div className={`${baseClasses} ${typeClasses[msg.type]}`}>{msg.text}</div>
        </div>
    );
};


// --- Main App Component ---
const App: React.FC = () => {
    // State and callbacks for camera and app
    const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
    const [cameraPermission, setCameraPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
    const checkAndRequestCameraPermission = useCallback(async () => {
        const { Camera } = await import('@capacitor/camera');
        let permissionStatus = await Camera.checkPermissions();
        if (permissionStatus.camera !== 'granted') {
            permissionStatus = await Camera.requestPermissions();
        }
        if (permissionStatus.camera === 'granted') {
            setCameraPermission('granted');
            return true;
        } else {
            setCameraPermission('denied');
            return false;
        }
    }, []);
    const [appState, setAppState] = useState<AppStateEnum>(AppState.LOADING_MODEL);
    // ...existing code...
    // ...existing code...
    // Helper to switch camera and restart stream (after appState is defined)
    const switchCamera = useCallback(() => {
        setCameraFacingMode(f => {
            const next = f === 'environment' ? 'user' : 'environment';
            // Always stop previous stream before switching
            if (videoRef.current && videoRef.current.srcObject) {
                (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
                videoRef.current.srcObject = null;
            }
            // If scanning, restart stream with new facingMode
            if (appState === AppState.SCANNING) {
                navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: next,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                }).then(stream => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.onloadedmetadata = () => {
                            videoRef.current?.play().catch(e => console.warn("Video play error:", e));
                        };
                    }
                });
            }
            return next;
        });
    }, [appState]);
    // Camera switch icon SVG (circular arrows)
    const CameraSwitchIcon = () => (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="15" stroke="#fff" strokeWidth="2" fill="#222" />
            <path d="M10 18c1.5 2 4 3 6 3 2.5 0 4.5-1.5 5.5-3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 14c-1.5-2-4-3-6-3-2.5 0-4.5 1.5-5.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="8,14 8,18 12,18" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="24,18 24,14 20,14" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
    // Camera facing mode state
    // ...existing code...
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [model, setModel] = useState<DetectedObjectNet | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [messageHistory, setMessageHistory] = useState<Message[]>([]);
    const [renderableDetections, setRenderableDetections] = useState<TrackedObject[]>([]);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneMemory = useRef(new Map<number, TrackedObject>());
    const chatLogRef = useRef<HTMLDivElement>(null);
    const nextObjectId = useRef(0);
    const lastSpokenProgress = useRef(0);
    // FIX: Corrected the useRef type. `useRef<number>()` expects an initial value, but none was provided, causing the error.
    // `useRef<number | undefined>()` correctly types the ref for holding a requestAnimationFrame ID or being undefined, which is compatible with being called with no arguments.
    const animationLoopRef = useRef<number | undefined>();
    
    // Use a ref to track the current app state for the animation loop
    // This prevents race conditions when starting/stopping the scanner
    const appStateRef = useRef(appState);
    useEffect(() => {
        appStateRef.current = appState;
    }, [appState]);

    const CRITICAL_DISTANCE_THRESHOLD = 1.5;
    const PATH_DISTANCE_THRESHOLD = 7;
    const GROUP_PROXIMITY_THRESHOLD_PX = 100;
    const OBJECT_MATCH_THRESHOLD_PX = 150;
    const OBJECT_LIFESPAN_MS = 2000;

    // --- Effects ---

    useEffect(() => {
        AudioFeedback.speak("Loading Vision Model.");
        window.cocoSsd.load({
            base: 'mobilenet_v1',
            onProgress: (fraction) => {
                setLoadingProgress(Math.round(fraction * 100));
            }
        }).then(loadedModel => {
            setModel(loadedModel);
            setAppState(AppState.READY);
            AudioFeedback.speak("Echo Vision is ready.");
            console.log("Model loaded successfully.");
        }).catch(err => {
            setAppState(AppState.ERROR);
            AudioFeedback.speak("Sorry, the vision model failed to load.");
            console.error("Model loading error:", err);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (chatLogRef.current) {
            chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
        }
    }, [messageHistory]);


    // --- Core Logic Callbacks ---

    const addMessage = useCallback((text: string, type: Message['type']) => {
        setMessageHistory(prev => [...prev, { text, type, id: Date.now() }].slice(-20));
    }, []);

    const getCenter = (bbox: number[]) => ({ x: bbox[0] + bbox[2] / 2, y: bbox[1] + bbox[3] / 2 });
    const getDistanceBetweenPoints = (p1: {x:number, y:number}, p2: {x:number, y:number}) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    const getDistanceEstimate = (bboxHeight: number, videoHeight: number) => {
        if (videoHeight === 0 || bboxHeight === 0) return 20;
        const normalizedHeight = bboxHeight / videoHeight;
        return Math.min(Math.max((0.4 / normalizedHeight), 0.5), 20);
    };
    const isObjectInPath = (bbox: number[], videoWidth: number) => {
        const [x, , width] = bbox;
        const centerX = x + width / 2;
        return centerX > videoWidth * 0.2 && centerX < videoWidth * 0.8;
    };

    const processDetections = useCallback((detections: Detection[]) => {
        if (!videoRef.current) return;
        const intrinsicVideoWidth = videoRef.current.videoWidth;
        const intrinsicVideoHeight = videoRef.current.videoHeight;
        const now = Date.now();
        const currentFrameObjectIds = new Set<number>();
        const unmatchedNewDetections = [...detections];

        // Match existing objects
        sceneMemory.current.forEach((oldObj, id) => {
            const trackedOldObj = oldObj as TrackedObject;
            const oldCenter = getCenter(trackedOldObj.bbox);
            let bestNewDetIndex = -1;
            let bestMatchDistance = Infinity;

            unmatchedNewDetections.forEach((newDet, index) => {
                const detectionNewDet = newDet as Detection;
                if (detectionNewDet.class === trackedOldObj.class && detectionNewDet.score > 0.35) {
                    const newCenter = getCenter(detectionNewDet.bbox);
                    const distance = getDistanceBetweenPoints(oldCenter, newCenter);
                    if (distance < bestMatchDistance && distance < OBJECT_MATCH_THRESHOLD_PX) {
                        bestMatchDistance = distance;
                        bestNewDetIndex = index;
                    }
                }
            });

            if (bestNewDetIndex !== -1) {
                const matchedNewDet = unmatchedNewDetections.splice(bestNewDetIndex, 1)[0] as Detection;
                trackedOldObj.bbox = matchedNewDet.bbox;
                trackedOldObj.lastSeen = now;
                trackedOldObj.currentDistance = getDistanceEstimate(trackedOldObj.bbox[3], intrinsicVideoHeight);
                currentFrameObjectIds.add(id);
                // Reset notification status if object moves out of range
                if (trackedOldObj.criticallyNotified && trackedOldObj.currentDistance > CRITICAL_DISTANCE_THRESHOLD + 0.5) trackedOldObj.criticallyNotified = false;
                if (trackedOldObj.notified && trackedOldObj.currentDistance > PATH_DISTANCE_THRESHOLD + 0.5) trackedOldObj.notified = false;
                if (trackedOldObj.inPath && !isObjectInPath(trackedOldObj.bbox, intrinsicVideoWidth)) {
                    trackedOldObj.inPath = false;
                    trackedOldObj.notified = false;
                    trackedOldObj.criticallyNotified = false;
                }
            }
        });

        // Add new objects
        unmatchedNewDetections.forEach(newDet => {
            const detectionNewDet = newDet as Detection;
            if (detectionNewDet.score > 0.15) {
                const newId = nextObjectId.current++;
                const newTrackedObject: TrackedObject = {
                    id: newId,
                    class: detectionNewDet.class,
                    bbox: detectionNewDet.bbox,
                    firstSeen: now, lastSeen: now,
                    currentDistance: getDistanceEstimate(detectionNewDet.bbox[3], intrinsicVideoHeight),
                    notified: false, criticallyNotified: false,
                    inPath: isObjectInPath(detectionNewDet.bbox, intrinsicVideoWidth)
                };
                sceneMemory.current.set(newId, newTrackedObject);
                currentFrameObjectIds.add(newId);
            }
        });

        // Remove stale objects
        const objectsToRemove: number[] = [];
        sceneMemory.current.forEach((obj, id) => {
            const trackedObj = obj as TrackedObject;
            if (!currentFrameObjectIds.has(id) && (now - trackedObj.lastSeen > OBJECT_LIFESPAN_MS)) {
                objectsToRemove.push(id);
            }
        });
        objectsToRemove.forEach(id => sceneMemory.current.delete(id));

        // Prioritize important objects (person, moving objects) in path or near path
        const importantClasses = ['person', 'car', 'bicycle', 'motorcycle', 'bus', 'truck', 'dog', 'cat'];
        const allTracked = Array.from(sceneMemory.current.values());
        const activeInPathObjects = allTracked.filter(obj => {
            const trackedObj = obj as TrackedObject;
            trackedObj.inPath = isObjectInPath(trackedObj.bbox, intrinsicVideoWidth);
            return trackedObj.inPath;
        });

        // Split into important and non-important
    const importantObjects = activeInPathObjects.filter(obj => importantClasses.includes((obj as TrackedObject).class));
    const nonImportantObjects = activeInPathObjects.filter(obj => !importantClasses.includes((obj as TrackedObject).class));

        const processedObjectIds = new Set<number>();
        // Only alert for important objects if present, otherwise fallback to non-important
        const alertObjects = importantObjects.length > 0 ? importantObjects : nonImportantObjects;
        alertObjects.forEach(obj => {
            const trackedObj = obj as TrackedObject;
            if (processedObjectIds.has(trackedObj.id)) return;
            // Find objects of the same class that are close to each other
            const group = alertObjects.filter(other => {
                const trackedOther = other as TrackedObject;
                return !processedObjectIds.has(trackedOther.id) &&
                    trackedOther.class === trackedObj.class &&
                    getDistanceBetweenPoints(getCenter(trackedObj.bbox), getCenter(trackedOther.bbox)) < GROUP_PROXIMITY_THRESHOLD_PX;
            });
            group.forEach(g => processedObjectIds.add((g as TrackedObject).id));

            if (group.length > 0) {
                const representative = group.reduce((closest, current) => (current as TrackedObject).currentDistance < (closest as TrackedObject).currentDistance ? current : closest) as TrackedObject;
                const { class: className, currentDistance: distance } = representative;
                // Only notify if not already notified for this state
                const anyCriticallyNotified = group.some(o => (o as TrackedObject).criticallyNotified);
                const anyPathNotified = group.some(o => (o as TrackedObject).notified);

                const distanceText = `[${distance.toFixed(1)}m away]`;

                if (distance < CRITICAL_DISTANCE_THRESHOLD && !anyCriticallyNotified) {
                    const countText = group.length > 1 ? `Multiple ${className}s` : `A ${className}`;
                    const verb = className === 'person' && group.length > 1 ? 'are' : 'is';
                    const alertText = `Proximity Alert: ${countText} ${verb} very close. ${distanceText}`;
                    if (navigator.vibrate) navigator.vibrate([150, 50, 150]);
                    if (navigator.vibrate) navigator.vibrate([150, 50, 150]);
                    addMessage(alertText, 'alert');
                    AudioFeedback.speak(alertText);
                    group.forEach(o => { (o as TrackedObject).criticallyNotified = true; (o as TrackedObject).notified = true; });
                } else if (distance < PATH_DISTANCE_THRESHOLD && !anyPathNotified && !anyCriticallyNotified) {
                    const countText = group.length > 1 ? `Multiple ${className}s` : `A ${className}`;
                    const alertText = `Alert: ${countText} detected in your path ${distanceText}`;
                    addMessage(alertText, 'alert');
                    AudioFeedback.speak(alertText);
                    group.forEach(o => (o as TrackedObject).notified = true);
                }
                // Suppress further alerts until state changes (object leaves path or gets farther away)
            }
        });

        setRenderableDetections(Array.from(sceneMemory.current.values()));
    }, [addMessage]);

    const runDetectionLoop = useCallback(async () => {
        // Use the ref to check the current state. This prevents race conditions
        // where the state changes while an async detection is in progress.
        if (appStateRef.current !== AppState.SCANNING) {
            return;
        }

        // Efficiency: skip if previous detection is still running
        if (runDetectionLoop.busy) {
            animationLoopRef.current = requestAnimationFrame(runDetectionLoop);
            return;
        }
        runDetectionLoop.busy = true;
        if (model && videoRef.current && videoRef.current.readyState >= 2) {
            if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
                try {
                    // Raise minScore for higher accuracy
                    const predictions = await model.detect(videoRef.current, 50, 0.6);
                    // Filter: only boxes >40px, score >0.6
                    let filtered = predictions.filter(p => p.bbox[2] > 40 && p.bbox[3] > 40 && p.score > 0.6);
                    // Sort by score descending, take top 5
                    filtered = filtered.sort((a, b) => b.score - a.score).slice(0, 5);
                    processDetections(filtered);
                } catch (err) {
                    console.error("Error in detection loop:", err);
                }
            }
        }
        runDetectionLoop.busy = false;
        animationLoopRef.current = requestAnimationFrame(runDetectionLoop);
    }, [model, processDetections]);
    // Flag for skipping busy frames
    runDetectionLoop.busy = false;
    // --- Canvas Drawing Effect ---
    useEffect(() => {
        if (!canvasRef.current || !videoRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const { videoWidth, videoHeight } = videoRef.current;
        if (videoWidth === 0 || videoHeight === 0) return;
        canvasRef.current.width = videoWidth;
        canvasRef.current.height = videoHeight;
        ctx.clearRect(0, 0, videoWidth, videoHeight);
        renderableDetections.forEach(obj => {
            const bbox = obj.bbox;
            const flippedX = cameraFacingMode === 'user' ? (videoWidth - bbox[0] - bbox[2]) : bbox[0];
            ctx.save();
            ctx.strokeStyle = obj.currentDistance <= 10 ? '#ff0000' : '#00ff00';
            ctx.lineWidth = 5;
            ctx.globalAlpha = 1.0;
            ctx.strokeRect(flippedX, bbox[1], bbox[2], bbox[3]);
            // Draw label background
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(flippedX, bbox[1] - 28, bbox[2], 28);
            // Draw label text
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillText(`${obj.class} (${obj.currentDistance.toFixed(1)}m)`, flippedX + 6, bbox[1] - 26);
            ctx.restore();
        });
    }, [renderableDetections, cameraFacingMode]);

    const stopEverything = useCallback(() => {
        if (animationLoopRef.current) {
            cancelAnimationFrame(animationLoopRef.current);
            animationLoopRef.current = undefined; // Explicitly clear the ref
        }
        if (videoRef.current && videoRef.current.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        sceneMemory.current.clear();
        setRenderableDetections([]);
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    // AudioFeedback.stop(); // Removed, not implemented
        console.log("Scanner stopped. Everything reset.");
    }, []);

    const toggleScanning = useCallback(() => {
        if (appState === AppState.SCANNING) {
            setAppState(AppState.READY);
            AudioFeedback.speak('Scanner stopped.');
            addMessage('Scanner stopped.', 'bot');
            stopEverything();
        } else if (appState === AppState.READY) {
            // Request camera permission before accessing camera
            checkAndRequestCameraPermission().then(granted => {
                if (!granted) {
                    addMessage('Error: Camera permission denied. Please grant permission in settings.', 'alert');
                    AudioFeedback.speak('I could not access the camera. Please ensure permissions are granted.');
                    setAppState(AppState.READY);
                    return;
                }
                setAppState(AppState.SCANNING);
                AudioFeedback.speak('Scanner starting. Activating camera.');
                addMessage('Scanner starting...', 'bot');

                navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: cameraFacingMode,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                })
                .then(stream => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.onloadedmetadata = () => {
                            videoRef.current?.play().catch(e => console.warn("Video play error:", e));
                            const track = stream.getVideoTracks()[0];
                            const settings = track.getSettings();
                            let cameraMessage = `Using ${settings.facingMode === 'user' ? 'front' : 'rear'} camera.`;
                            addMessage(cameraMessage, 'bot');
                            AudioFeedback.speak(cameraMessage);
                            animationLoopRef.current = requestAnimationFrame(runDetectionLoop);
                        };
                    }
                })
                .catch(err => {
                    addMessage('Error: Camera access denied. Please grant permission.', 'alert');
                    AudioFeedback.speak('I could not access the camera. Please ensure permissions are granted.');
                    setAppState(AppState.READY);
                    console.error("Camera access error:", err);
                });
            });
        }
    }, [appState, addMessage, stopEverything, runDetectionLoop]);

    // --- Voice Command Logic ---
    const recognition = useMemo(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if(!SpeechRecognition) return null;
        const instance = new SpeechRecognition();
        instance.continuous = false;
        instance.lang = 'en-US';
        instance.interimResults = false;
        return instance;
    }, []);

    const processVoiceCommand = useCallback((command: string) => {
        command = command.toLowerCase();
        let response = "I'm not sure how to answer that.";
        const videoWidth = videoRef.current ? videoRef.current.videoWidth : 1;
        const allObjects = Array.from(sceneMemory.current.values()).map(o => o as TrackedObject);

        function formatObjectList(objs: TrackedObject[]) {
            if (objs.length === 0) return null;
            return objs.map(o => `${o.class} [${o.currentDistance.toFixed(1)}m away]`).join(', ');
        }

        if (allObjects.length === 0) {
            response = "I don't see anything right now.";
        } else if (command.includes('what') && (command.includes('see') || command.includes('front') || command.includes('around'))) {
            // In front: center third of the frame
            const frontObjects = allObjects.filter(o => {
                const x = getCenter(o.bbox).x;
                return x > videoWidth / 3 && x < videoWidth * (2/3);
            });
            const formatted = formatObjectList(frontObjects);
            response = formatted ? `In front of you: ${formatted}.` : "I don't see anything in front of you.";
        } else if (command.includes('right')) {
            // User's "right" is the left side of the raw video frame due to mirroring
            const rightObjects = allObjects.filter(o => getCenter(o.bbox).x < videoWidth / 3);
            const formatted = formatObjectList(rightObjects);
            response = formatted ? `On your right: ${formatted}.` : "I don't see anything on your right.";
        } else if (command.includes('left')) {
            // User's "left" is the right side of the raw video frame
            const leftObjects = allObjects.filter(o => getCenter(o.bbox).x > videoWidth * (2/3));
            const formatted = formatObjectList(leftObjects);
            response = formatted ? `On your left: ${formatted}.` : "I don't see anything on your left.";
        }
        addMessage(`You: "${command}"`, 'user');
        addMessage(`EchoVision: ${response}`, 'bot');
        AudioFeedback.speak(response);
    }, [addMessage]);

    const handleListen = useCallback(() => {
        if (!recognition) {
            addMessage("Speech recognition is not supported in this browser.", 'alert');
            AudioFeedback.speak("Speech recognition not supported.");
            return;
        }
        if (isListening) {
            recognition.stop();
            return; // onend will set isListening to false
        }
        // Request microphone permission using getUserMedia before starting recognition
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => {
                setIsListening(true);
                addMessage("Listening...", 'bot');
                AudioFeedback.speak("Listening.");
                recognition.start();

                recognition.onresult = (event: any) => {
                    const transcript = event.results[0][0].transcript;
                    processVoiceCommand(transcript);
                };
                recognition.onend = () => {
                    setIsListening(false);
                };
                recognition.onerror = (event: any) => {
                    console.error("Speech recognition error:", event.error);
                    addMessage("Sorry, I couldn't hear you.", 'bot');
                    AudioFeedback.speak("Sorry, I couldn't hear you.");
                    setIsListening(false);
                };
            })
            .catch(() => {
                addMessage("Microphone access denied. Please enable microphone permission.", 'alert');
                AudioFeedback.speak("Microphone access denied. Please enable microphone permission.");
            });
    }, [recognition, isListening, addMessage, processVoiceCommand]);

    // --- Render Logic ---
    const renderButtonText = () => {
        switch(appState) {
            case AppState.LOADING_MODEL: return `LOADING ${loadingProgress}%`;
            case AppState.READY: return 'START';
            case AppState.SCANNING: return 'STOP';
            case AppState.ERROR: return 'ERROR';
            default: return '...';
        }
    };
    const isButtonDisabled = appState === AppState.LOADING_MODEL || appState === AppState.ERROR;
    
    return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-black"> 
            {/* <Header /> */} // Removed, not defined
            {cameraPermission === 'denied' ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-red-500 bg-black">
                    <h2 className="text-xl font-bold mb-4">Camera Permission Denied</h2>
                    <p className="mb-2">Please enable camera permission in your device settings to use this app.</p>
                    <p className="text-sm text-gray-400">Go to Settings &gt; Apps &gt; echovision---interactive-scene-navigator &gt; Permissions</p>
                </div>
            ) : (
                <>
                <div className="relative flex-grow w-full h-full">
                    <div className="absolute inset-0 flex items-center justify-center bg-black">
                        <video
                            ref={videoRef}
                            playsInline
                            muted
                            className={`w-full h-full object-cover ${cameraFacingMode === 'user' ? 'transform -scale-x-100' : ''}`}
                        ></video>
                        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none"></canvas>
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 pt-0 flex flex-col w-full h-2/5 justify-end z-30 bg-gradient-to-t from-black via-black/80 to-transparent">
                    <div ref={chatLogRef} className="flex-grow w-full bg-black rounded-lg p-3 overflow-y-auto flex flex-col chat-log mb-4">
                        {messageHistory.length === 0 ? (
                            <div className="text-center text-gray-400 m-auto">Messages and alerts will appear here.</div>
                        ) : (
                            messageHistory.map(msg => <MessageComponent key={msg.id} msg={msg} />)
                        )}
                    </div>

                    <div className="flex items-center justify-center space-x-6">
                        {recognition && (
                            <button onClick={handleListen} disabled={appState !== AppState.SCANNING} className={`w-16 h-16 rounded-full flex justify-center items-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${isListening ? 'bg-red-600 border-red-400 mic-active' : 'bg-gray-700 border-gray-500'}`}>
                                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4z"></path><path d="M5.5 10.5a.5.5 0 01.5.5v1a4 4 0 004 4h.5a.5.5 0 010 1h-.5a5 5 0 01-5-5v-1a.5.5 0 01.5-.5z"></path><path d="M10 18a5 5 0 004.545-2.862a.5.5 0 01.91.4A6 6 0 0110 19a6 6 0 01-5.455-3.262a.5.5 0 11.91-.4A5 5 0 0010 18z"></path>
                                </svg>
                            </button>
                        )}
                        <button onClick={toggleScanning} disabled={isButtonDisabled} className={`w-24 h-24 rounded-full text-white font-bold text-lg flex justify-center items-center transform transition-all duration-300 ${appState === AppState.READY ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 scan-button-shadow' : appState === AppState.SCANNING ? 'bg-red-600 hover:bg-red-700 active:scale-95 scan-button-shadow' : 'bg-gray-500 cursor-not-allowed'}`}>
                            {renderButtonText()}
                        </button>
                        <button
                            onClick={switchCamera}
                            className="bg-gray-900 rounded-full p-2 shadow-lg flex items-center justify-center hover:bg-gray-700 transition-all"
                            style={{ width: 56, height: 56 }}
                            aria-label="Switch Camera"
                        >
                            <CameraSwitchIcon />
                        </button>
                    </div>
                </div>
                </>
            )}
        </div>
    );
};

export default App;

