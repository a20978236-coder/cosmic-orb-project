import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, MeshDistortMaterial, Float } from "@react-three/drei";
import { useRef, useState } from "react";
import * as THREE from "three";

function WebShooterModel({ troubleshooting }: { troubleshooting: boolean }) {
  const bottleRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (bottleRef.current) {
      bottleRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  return (
    <group ref={bottleRef}>
      {/* Main Bottle Body */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 1.5, 32]} />
        <meshStandardMaterial 
          color={troubleshooting ? "#ff0000" : "#00f2ff"} 
          wireframe 
          transparent 
          opacity={0.6} 
        />
      </mesh>

      {/* Nozzle Assembly */}
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.5, 32]} />
        <meshStandardMaterial color="#00f2ff" wireframe />
      </mesh>

      {/* Trigger Lever (Simulated Binder Clip) */}
      <mesh position={[0.4, 0.8, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.1, 0.8, 0.3]} />
        <meshStandardMaterial 
          color={troubleshooting ? "#ff0000" : "#00f2ff"}
          wireframe
        />
      </mesh>

      {/* Error Markers for Troubleshooting */}
      {troubleshooting && (
        <group>
          {/* Lever Instability Marker */}
          <mesh position={[0.6, 1, 0]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
          {/* Clog Risk Marker */}
          <mesh position={[0, 1.3, 0]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function EngineeringLab() {
  const [troubleshooting, setTroubleshooting] = useState(false);

  return (
    <div className="w-full h-full relative bg-black/40 rounded-3xl overflow-hidden border border-[#00f2ff]/20 backdrop-blur-md">
      <div className="absolute top-4 left-4 z-10 font-mono text-[10px] tracking-widest text-[#00f2ff] opacity-80">
        NEXUS // ENGINEERING LAB v1.0
      </div>
      
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        <button 
          onClick={() => setTroubleshooting(!troubleshooting)}
          className={`px-3 py-1 font-mono text-[10px] border transition-all ${
            troubleshooting 
              ? "border-red-500 text-red-500 bg-red-500/10" 
              : "border-[#00f2ff]/40 text-[#00f2ff] hover:bg-[#00f2ff]/10"
          }`}
        >
          {troubleshooting ? "STOP DIAGNOSIS" : "SCAN FOR ERRORS"}
        </button>
      </div>

      {troubleshooting && (
        <div className="absolute top-12 left-4 z-10 font-mono text-[10px] text-red-400 space-y-1 animate-pulse">
          <div>! WARNING: MECHANICAL INSTABILITY DETECTED IN LEVER</div>
          <div>! WARNING: CLOG RISK IN NOZZLE ASSEMBLY</div>
          <div>! ADVICE: USE GLASS BOTTLE TO PREVENT PLASTIC DEGRADATION</div>
        </div>
      )}

      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 1, 4]} />
        <OrbitControls enableZoom={false} enablePan={false} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#00f2ff" />
        
        <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
          <WebShooterModel troubleshooting={troubleshooting} />
        </Float>

        {/* Holographic Grid Floor */}
        <gridHelper args={[10, 20, "#00f2ff", "#00f2ff"]} position={[0, -1, 0]} rotation={[0, 0, 0]} />
      </Canvas>
    </div>
  );
}
