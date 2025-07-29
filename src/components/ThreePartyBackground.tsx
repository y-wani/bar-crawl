// src/components/ThreePartyBackground.tsx

import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, SoftShadows } from "@react-three/drei";
import * as THREE from "three";

const colors = [
  "#FF69B4",
  "#FFD700",
  "#00E0FF",
  "#8B5CF6",
  "#FF6B6B",
  "#32CD32",
  "#1E90FF",
];

const FloatingSphere: React.FC<{
  color: string;
  position: [number, number, number];
  floatSpeed: number;
  floatHeight: number;
  phase: number;
}> = ({ color, position, floatSpeed, floatHeight, phase }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime;
      meshRef.current.position.y =
        position[1] + Math.sin(t * floatSpeed + phase) * floatHeight;
      meshRef.current.position.x =
        position[0] + Math.cos(t * floatSpeed * 0.5 + phase) * 0.2;
      meshRef.current.rotation.y = t * 0.2 + phase;
    }
  });

  return (
    <Sphere
      ref={meshRef}
      args={[0.7, 32, 32]}
      position={position}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.7}
        roughness={0.3}
        metalness={0.6}
      />
    </Sphere>
  );
};

const ThreePartyBackground: React.FC = () => {
  return (
    <Canvas
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        background:
          "radial-gradient(ellipse at 50% 60%, #18122B 60%, #393053 100%)",
      }}
      camera={{ position: [0, 0, 7], fov: 60 }}
      shadows
      gl={{ antialias: true }}
    >
      {/* Soft ambient and point lights for glow */}
      <ambientLight intensity={0.3} />
      <pointLight
        position={[0, 5, 10]}
        intensity={1.2}
        color="#FFD700"
        castShadow
      />
      <pointLight position={[-5, -5, 5]} intensity={0.7} color="#FF69B4" />
      <pointLight position={[5, -5, 5]} intensity={0.7} color="#00E0FF" />
      <SoftShadows size={20} samples={16} focus={0.95} />
      {/* Minimal floating spheres */}
      {colors.map((color, i) => (
        <FloatingSphere
          key={i}
          color={color}
          position={[
            (i - colors.length / 2) * 2,
            Math.random() * 2 - 1,
            Math.random() * 4 - 2,
          ]}
          floatSpeed={Math.random() * 0.5 + 0.5}
          floatHeight={Math.random() * 0.5 + 0.3}
          phase={i}
        />
      ))}
    </Canvas>
  );
};

export default ThreePartyBackground;
