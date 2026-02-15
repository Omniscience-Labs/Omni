'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import * as THREE from 'three';

interface GeodesicSphereProps {
  size?: number;
  className?: string;
  color?: string;
  glow?: boolean;
  speed?: number;
  /** When true, always use smooth hover-like spin (no physics). Use for navbar. */
  smoothSpin?: boolean;
  /** Icosahedron subdivision: 0 = 1V (20 faces, clearer at small size), 1 = 2V (80 faces). Default 1. */
  detail?: 0 | 1;
}

export function GeodesicSphere({
  size = 64,
  className = '',
  color,
  glow = true,
  speed = 1,
  smoothSpin = false,
  detail = 1,
}: GeodesicSphereProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);
  const isHoveredRef = useRef(false);
  const isDarkModeRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const dark = document.documentElement.classList.contains('dark');
    isDarkModeRef.current = dark;
    setMounted(true);
  }, []);

  useEffect(() => {
    isHoveredRef.current = isHovered;
  }, [isHovered]);

  useEffect(() => {
    if (resolvedTheme !== undefined) {
      isDarkModeRef.current = resolvedTheme === 'dark';
    }
  }, [resolvedTheme]);

  const [darkState, setDarkState] = useState(false);
  useEffect(() => {
    if (mounted) {
      setDarkState(
        resolvedTheme !== undefined ? resolvedTheme === 'dark' : document.documentElement.classList.contains('dark')
      );
    }
  }, [mounted, resolvedTheme]);

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;

    // --- Scene setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });

    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- Resolve line color from theme (read ref so it updates every frame without re-creating scene) ---
    const getLineColor = (): THREE.Color => {
      if (color) {
        try {
          return new THREE.Color(color);
        } catch {
          // fallback
        }
      }
      return isDarkModeRef.current
        ? new THREE.Color(0xffffff) // white on dark
        : new THREE.Color(0x000000); // black on light
    };

    // --- Create the geodesic sphere (detail 0 = 1V, detail 1 = 2V) ---
    const icoGeometry = new THREE.IcosahedronGeometry(1, detail);
    const wireframeGeometry = new THREE.WireframeGeometry(icoGeometry);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: getLineColor(),
      transparent: true,
      opacity: 0.9,
    });
    const wireframe = new THREE.LineSegments(wireframeGeometry, lineMaterial);
    scene.add(wireframe);

    // Glow layer (constant opacity; no extra boost on hover)
    let glowWireframe: THREE.LineSegments | null = null;
    let glowMaterial: THREE.LineBasicMaterial | null = null;
    if (glow) {
      const glowGeometry = new THREE.WireframeGeometry(
        new THREE.IcosahedronGeometry(1.06, detail)
      );
      glowMaterial = new THREE.LineBasicMaterial({
        color: getLineColor(),
        transparent: true,
        opacity: 0.45,
      });
      glowWireframe = new THREE.LineSegments(glowGeometry, glowMaterial);
      scene.add(glowWireframe);
    }

    // Position camera
    camera.position.z = 2.5;

    // --- Animation: smooth when hovered; less erratic + gravity flow when not, with very slow phase so logo is clear ---
    const speedScale = 0.7 * speed;
    const smoothSpeedY = 0.003 * speedScale;
    const smoothSpeedX = 0.001 * speedScale;

    const HIGH_MIN = 0.07 * speedScale;
    const HIGH_MAX = 0.11 * speedScale;
    const LOW_SPEED = 0.001 * speedScale;       // very slow so logo is clearly visible
    const HOLD_FRAMES = 70;                     // longer hold at high speed so slowdown is noticeable
    const SLOW_THRESHOLD = LOW_SPEED * 2;
    // Slow phase = same speed as hover, for 1–2 seconds (60–120 frames @ 60fps)
    const SLOW_PHASE_MIN = 60;
    const SLOW_PHASE_MAX = 120;

    const setRandomDirection = (dir: { x: number; y: number; z: number }) => {
      dir.x = 0.5 + Math.random() * 1.0;   // 0.5–1.5
      dir.y = 0.5 + Math.random() * 1.0;
      dir.z = -0.3 + Math.random() * 0.8;    // -0.3–0.5
    };
    const nudgeDirection = (dir: { x: number; y: number; z: number }, amount: number) => {
      dir.x += (Math.random() - 0.5) * amount;
      dir.y += (Math.random() - 0.5) * amount;
      dir.z += (Math.random() - 0.5) * amount;
      dir.x = Math.max(0.2, Math.min(1.6, dir.x));
      dir.y = Math.max(0.2, Math.min(1.6, dir.y));
      dir.z = Math.max(-0.4, Math.min(0.6, dir.z));
    };

    let currentSpeed = HIGH_MIN * 0.5;
    let targetSpeed = HIGH_MIN + Math.random() * (HIGH_MAX - HIGH_MIN);
    let isAccelerating = true;
    const acceleration = 0.0018 * speedScale;   // flow from slow → high
    const brakeStrength = 0.0032 * speedScale; // strong brake but over ~20–25 frames so transition is visible
    const spinDir = { x: 1, y: 1, z: 0.25 };
    setRandomDirection(spinDir);
    let holdFramesLeft = 0;
    let slowFrames = 0;
    let slowPhaseFramesNeeded = SLOW_PHASE_MIN + Math.random() * (SLOW_PHASE_MAX - SLOW_PHASE_MIN);

    const animate = () => {
      const currentColor = getLineColor();
      lineMaterial.color.copy(currentColor);
      if (glowMaterial) {
        glowMaterial.color.copy(currentColor);
        glowMaterial.opacity = 0.45;
      }

      // Smooth spin: when hovered or when smoothSpin prop (e.g. navbar)
      if (isHoveredRef.current || smoothSpin) {
        wireframe.rotation.y += smoothSpeedY;
        wireframe.rotation.x += smoothSpeedX;
      } else {
        if (holdFramesLeft > 0) {
          holdFramesLeft--;
          // When hold ends: set target to LOW_SPEED so brake fires next frame
          if (holdFramesLeft === 0) {
            targetSpeed = LOW_SPEED;
          }
        } else if (isAccelerating) {
          // Flow from slow → high: ease-in so ramp starts gentle then builds
          const ramp = (currentSpeed - LOW_SPEED) / (targetSpeed - LOW_SPEED + 1e-6);
          const flowAccel = acceleration * (0.6 + 0.4 * Math.min(ramp, 1));
          currentSpeed = Math.min(currentSpeed + flowAccel, targetSpeed);
          if (currentSpeed >= targetSpeed) {
            isAccelerating = false;
            holdFramesLeft = HOLD_FRAMES;
          }
        } else {
          // Brake: drop to LOW_SPEED
          if (currentSpeed > targetSpeed) {
            currentSpeed = Math.max(currentSpeed - brakeStrength, targetSpeed);
          }
          // Slow phase: count frames at low speed
          if (currentSpeed <= SLOW_THRESHOLD) {
            slowFrames++;

            // Drift direction occasionally
            if (slowFrames > 0 && slowFrames % 22 === 0) {
              nudgeDirection(spinDir, 0.35);
            }

            if (slowFrames >= slowPhaseFramesNeeded) {
              // Exit slow phase → start new high-speed cycle
              slowFrames = 0;
              isAccelerating = true;
              targetSpeed = HIGH_MIN + Math.random() * (HIGH_MAX - HIGH_MIN);
              setRandomDirection(spinDir);
              slowPhaseFramesNeeded = SLOW_PHASE_MIN + Math.random() * (SLOW_PHASE_MAX - SLOW_PHASE_MIN);
            }
          } else {
            slowFrames = 0;
          }
        }

        // In slow phase: smooth hover-like spin
        const inSlowPhase = !isAccelerating && currentSpeed <= SLOW_THRESHOLD && slowFrames > 0;
        if (inSlowPhase) {
          wireframe.rotation.y += smoothSpeedY;
          wireframe.rotation.x += smoothSpeedX;
        } else {
          const rX = currentSpeed * spinDir.x;
          const rY = currentSpeed * spinDir.y;
          const rZ = currentSpeed * spinDir.z;
          wireframe.rotation.x += rX;
          wireframe.rotation.y += rY;
          wireframe.rotation.z += rZ;
        }
      }

      if (glowWireframe) {
        glowWireframe.rotation.x = wireframe.rotation.x;
        glowWireframe.rotation.y = wireframe.rotation.y;
        glowWireframe.rotation.z = wireframe.rotation.z;
      }

      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // --- Cleanup ---
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      renderer.dispose();
      icoGeometry.dispose();
      wireframeGeometry.dispose();
      lineMaterial.dispose();
      if (glowWireframe) glowWireframe.geometry.dispose();
      if (glowMaterial) glowMaterial.dispose();

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });

      if (currentMount && renderer.domElement.parentNode === currentMount) {
        currentMount.removeChild(renderer.domElement);
      }
    };
  }, [size, color, glow, speed, smoothSpin, detail]);

  const effectiveDark = mounted ? darkState : false;
  const shadowBlur = 16;
  const shadowOpacity = effectiveDark ? 0.55 : 0.4;
  const shadowColor = effectiveDark ? '255,255,255' : '0,0,0';
  const filter = glow
    ? `drop-shadow(0 0 ${shadowBlur}px rgba(${shadowColor},${shadowOpacity}))`
    : undefined;

  return (
    <div
      ref={mountRef}
      className={className}
      role="img"
      aria-label="Omni logo"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
        transition: 'transform 0.2s ease',
        filter,
      }}
    />
  );
}
