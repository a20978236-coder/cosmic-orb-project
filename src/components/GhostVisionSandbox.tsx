import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Body = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  radius: number;
  mass: number;
};

export function GhostVisionSandbox({ onClose }: { onClose: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodiesRef = useRef<Body[]>([]);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orbitRef = useRef<{ az: number; el: number; dist: number }>({ az: 0.6, el: 0.4, dist: 14 });
  const [count, setCount] = useState(0);
  const [gravity, setGravity] = useState(true);

  // ── Setup three.js scene ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.Fog(0x05070d, 25, 70);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 200);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffbf80, 0.35));
    const key = new THREE.DirectionalLight(0xffaa55, 1.2);
    key.position.set(8, 12, 6);
    scene.add(key);
    const rim = new THREE.PointLight(0xff7a2a, 1.5, 50);
    rim.position.set(-6, 6, -6);
    scene.add(rim);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(40, 40, 40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x161a26,
      wireframe: true,
      emissive: 0xff7a2a,
      emissiveIntensity: 0.15,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Center marker
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.45, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb060, side: THREE.DoubleSide }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.01;
    scene.add(marker);

    // ── Camera orbit (mouse drag) ──
    let dragging = false;
    let lx = 0, ly = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true; lx = e.clientX; ly = e.clientY;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      orbitRef.current.az -= (e.clientX - lx) * 0.005;
      orbitRef.current.el = Math.max(0.05, Math.min(1.5, orbitRef.current.el + (e.clientY - ly) * 0.005));
      lx = e.clientX; ly = e.clientY;
    };
    const onUp = () => { dragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.dist = Math.max(4, Math.min(40, orbitRef.current.dist + e.deltaY * 0.01));
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // ── Animation + physics loop ──
    let raf = 0;
    let last = performance.now();
    const animate = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // physics
      if (gravityRef.current) {
        for (const b of bodiesRef.current) {
          b.vel.y -= 9.8 * dt;
          b.mesh.position.addScaledVector(b.vel, dt);
          if (b.mesh.position.y - b.radius < 0) {
            b.mesh.position.y = b.radius;
            b.vel.y *= -0.55;
            b.vel.x *= 0.9;
            b.vel.z *= 0.9;
          }
          b.mesh.rotation.x += b.vel.z * dt * 0.5;
          b.mesh.rotation.z -= b.vel.x * dt * 0.5;
        }
      }

      // orbit camera
      const { az, el, dist } = orbitRef.current;
      camera.position.set(
        Math.sin(az) * Math.cos(el) * dist,
        Math.sin(el) * dist + 1.5,
        Math.cos(az) * Math.cos(el) * dist,
      );
      camera.lookAt(0, 1, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    // resize
    const onResize = () => {
      const ww = mount.clientWidth, hh = mount.clientHeight;
      camera.aspect = ww / hh;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      bodiesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gravityRef = useRef(true);
  useEffect(() => { gravityRef.current = gravity; }, [gravity]);

  // ── Build spawning helpers ──
  const spawn = (mesh: THREE.Mesh, radius: number) => {
    const scene = sceneRef.current;
    if (!scene) return;
    mesh.position.set((Math.random() - 0.5) * 4, 8 + Math.random() * 3, (Math.random() - 0.5) * 4);
    scene.add(mesh);
    bodiesRef.current.push({
      mesh,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2),
      radius,
      mass: 1,
    });
    setCount((c) => c + 1);
  };

  const addCube = () => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.7, 0.55),
      metalness: 0.4,
      roughness: 0.3,
      emissive: 0xff7a2a,
      emissiveIntensity: 0.1,
    });
    spawn(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat), 0.75);
  };

  const addSphere = () => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.7, 0.55),
      metalness: 0.5,
      roughness: 0.25,
    });
    spawn(new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), mat), 0.6);
  };

  const addPyramid = () => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.7, 0.55),
      metalness: 0.3,
      roughness: 0.4,
    });
    spawn(new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 4), mat), 0.7);
  };

  const addImageBuild = (file: File) => {
    const url = URL.createObjectURL(file);
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const aspect = (tex.image as HTMLImageElement).width / (tex.image as HTMLImageElement).height || 1;
      const w = 2.2, h = 2.2 / aspect;
      const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, metalness: 0.1, roughness: 0.7 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), mat);
      spawn(mesh, Math.max(w, h) / 2);
      URL.revokeObjectURL(url);
    });
  };

  const clearAll = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    for (const b of bodiesRef.current) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
    }
    bodiesRef.current = [];
    setCount(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-lg">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--orb-amber)]/30 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--orb-amber)] shadow-[0_0_10px_var(--orb-amber)]" />
          <h2 className="font-mono text-sm tracking-[0.4em] text-[var(--orb-amber)]">
            G H O S T &nbsp;·&nbsp; V I S I O N
          </h2>
          <span className="hud-chip">ENTITIES {count}</span>
          <span className="hud-chip">PHYSICS {gravity ? "ON" : "OFF"}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-border bg-card/60 px-4 py-1.5 font-mono text-xs tracking-widest text-foreground/80 hover:border-[var(--orb-amber)] hover:text-[var(--orb-amber)]"
        >
          EXIT ✕
        </button>
      </header>

      {/* 3D canvas */}
      <div ref={mountRef} className="relative flex-1 cursor-grab active:cursor-grabbing" />

      {/* Bottom controls */}
      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-[var(--orb-amber)]/30 px-6 py-4">
        <button onClick={addCube} className="sandbox-btn">+ CUBE</button>
        <button onClick={addSphere} className="sandbox-btn">+ SPHERE</button>
        <button onClick={addPyramid} className="sandbox-btn">+ PYRAMID</button>
        <button onClick={() => fileRef.current?.click()} className="sandbox-btn">
          + IMAGE BUILD
        </button>
        <button onClick={() => setGravity((g) => !g)} className="sandbox-btn">
          GRAVITY {gravity ? "OFF" : "ON"}
        </button>
        <button onClick={clearAll} className="sandbox-btn !border-destructive/40 !text-destructive">
          CLEAR
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addImageBuild(f);
            e.target.value = "";
          }}
        />
        <span className="ml-3 font-mono text-[10px] tracking-widest text-muted-foreground/60">
          DRAG to orbit · SCROLL to zoom
        </span>
      </footer>
    </div>
  );
}

export default GhostVisionSandbox;