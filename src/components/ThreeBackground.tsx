import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Float } from '@react-three/drei';
import * as THREE from 'three';

// Floating beer mug component
const BeerMug: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef} position={[3, 2, -5]}>
        {/* Beer mug shape */}
        <cylinderGeometry args={[0.3, 0.4, 0.8, 8]} />
        <meshStandardMaterial color="#8B4513" />
        {/* Handle */}
        <mesh position={[0.4, 0, 0]}>
          <torusGeometry args={[0.15, 0.05, 8, 16]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>
        {/* Foam */}
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 0.1, 8]} />
          <meshStandardMaterial color="#F5F5DC" />
        </mesh>
      </mesh>
    </Float>
  );
};

// Floating cocktail glass component
const CocktailGlass: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y -= 0.015;
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.7 + 1) * 0.15;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.3}>
      <mesh ref={meshRef} position={[-4, 1, -3]}>
        {/* Glass shape */}
        <cylinderGeometry args={[0.2, 0.1, 0.6, 8]} />
        <meshStandardMaterial color="#87CEEB" transparent opacity={0.3} />
        {/* Stem */}
        <mesh position={[0, -0.4, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
        {/* Base */}
        <mesh position={[0, -0.65, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.05, 8]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
      </mesh>
    </Float>
  );
};

// Floating bar stool component
const BarStool: React.FC = () => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.005;
    }
  });

  return (
    <Float speed={1} rotationIntensity={0.2} floatIntensity={0.2}>
      <group ref={meshRef} position={[0, -1, -8]}>
        {/* Seat */}
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.1, 8]} />
          <meshStandardMaterial color="#4A4A4A" />
        </mesh>
        {/* Legs */}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[Math.cos(i * Math.PI / 2) * 0.3, 0, Math.sin(i * Math.PI / 2) * 0.3]}>
            <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
            <meshStandardMaterial color="#2A2A2A" />
          </mesh>
        ))}
        {/* Backrest */}
        <mesh position={[0, 0.8, -0.3]}>
          <boxGeometry args={[0.8, 0.6, 0.05]} />
          <meshStandardMaterial color="#4A4A4A" />
        </mesh>
      </group>
    </Float>
  );
};

// Floating wine bottle component
const WineBottle: React.FC = () => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y -= 0.008;
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.4 + 2) * 0.3;
    }
  });

  return (
    <Float speed={1.8} rotationIntensity={0.4} floatIntensity={0.4}>
      <group ref={meshRef} position={[5, 1, -4]}>
        {/* Bottle body */}
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.6, 8]} />
          <meshStandardMaterial color="#8B0000" />
        </mesh>
        {/* Bottle neck */}
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.2, 8]} />
          <meshStandardMaterial color="#8B0000" />
        </mesh>
        {/* Cork */}
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.1, 8]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>
      </group>
    </Float>
  );
};

// Floating neon sign component
const NeonSign: React.FC = () => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.003;
    }
  });

  return (
    <Float speed={0.8} rotationIntensity={0.1} floatIntensity={0.1}>
      <group ref={meshRef} position={[-6, 2, -6]}>
        {/* Sign frame */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[2, 0.8, 0.1]} />
          <meshStandardMaterial color="#2A2A2A" />
        </mesh>
        {/* Neon glow effect */}
        <mesh position={[0, 0, 0.06]}>
          <boxGeometry args={[1.8, 0.6, 0.02]} />
          <meshStandardMaterial color="#FF1493" emissive="#FF1493" emissiveIntensity={0.5} />
        </mesh>
      </group>
    </Float>
  );
};

// Floating text component
const FloatingText: React.FC = () => {
  const textRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (textRef.current) {
      textRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.5;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.1}>
      <group ref={textRef} position={[0, 3, -2]}>
        <Text
          fontSize={0.5}
          color="#FFD700"
          anchorX="center"
          anchorY="middle"
        >
          BAR CRAWL
        </Text>
      </group>
    </Float>
  );
};

// Main background component
const ThreeBackground: React.FC = () => {
  return (
    <Canvas
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        background: 'linear-gradient(to bottom, #0a0a0a, #1a1a2e, #16213e)'
      }}
      camera={{ position: [0, 0, 5], fov: 75 }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.8} color="#FFD700" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#87CEEB" />
      
      {/* Stars background */}
      <Stars
        radius={100}
        depth={50}
        count={5000}
        factor={4}
        saturation={0}
        fade
        speed={1}
      />
      
      {/* 3D Elements */}
      <BeerMug />
      <CocktailGlass />
      <BarStool />
      <WineBottle />
      <NeonSign />
      <FloatingText />
      
      {/* Controls */}
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 2}
      />
    </Canvas>
  );
};

export default ThreeBackground;
