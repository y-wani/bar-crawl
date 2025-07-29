// src/components/SwirlBackground.tsx

import React, { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// Vertex shader: passes UV coordinates
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader: swirl effect with fbm noise and mouse interaction
const fragmentShader = `
  varying vec2 vUv;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform vec2 u_resolution;

  float random(vec2 st) {
    return fract(sin(dot(st, vec2(12.9898,78.233))) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f*f*(3.0-2.0*f);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 st) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise(st);
      st *= 2.0;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * (u_resolution / min(u_resolution.x, u_resolution.y));
    float speed = 0.15;
    vec2 motion = vec2(
      fbm(uv + u_time * speed),
      fbm(uv + u_time * speed + 10.0)
    );

    float md = length(uv - u_mouse);
    float me = smoothstep(0.3, 0.0, md);
    float n = fbm(uv + motion + me * 0.4);

    vec3 c1 = vec3(0.09, 0.07, 0.17);
    vec3 c2 = vec3(0.54, 0.17, 0.88);
    vec3 c3 = vec3(1.0, 0.41, 0.70);

    vec3 col = mix(c1, c2, smoothstep(0.2, 0.6, n));
    col = mix(col, c3, smoothstep(0.7, 0.9, n));
    col += me * 0.25;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const SwirlPlane: React.FC = () => {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  // Uniforms memoized to preserve reference
  const uniforms = useMemo(() => ({
    u_time: { value: 0 },
    u_mouse: { value: new THREE.Vector2(0, 0) },
    u_resolution: { value: new THREE.Vector2(size.width, size.height) },
  }), [size.width, size.height]);

  // Animate time and mouse each frame
  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.u_time.value = state.clock.getElapsedTime();
      matRef.current.uniforms.u_mouse.value.lerp(state.pointer, 0.1);
    }
  });

  // Update resolution on resize
  useEffect(() => {
    uniforms.u_resolution.value.set(size.width, size.height);
  }, [size]);

  return (
    <mesh scale={[size.width / size.height, 1, 1]}>  {/* maintain aspect ratio */}
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
};

/**
 * Full-screen swirl background.
 * Placed behind all content with zIndex: -1.
 */
const SwirlBackground: React.FC = () => (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: -1,
    pointerEvents: 'none'
  }}>
    <Canvas
      gl={{ antialias: true }}
      camera={{ position: [0, 0, 1], fov: 75 }}
    >
      <SwirlPlane />
    </Canvas>
  </div>
);

export default SwirlBackground;
