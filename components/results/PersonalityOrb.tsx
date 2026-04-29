"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { PersonalityParams } from "@/lib/types";

// Procedural 3D "personality sculpture" — a noise-displaced icosphere with
// an orbiting particle halo, entirely driven by the 6-param PersonalityParams
// schema emitted from /api/summary. No external textures, no GLTF, no drei —
// keeps the Results bundle small and the mapping between params and pixels
// fully transparent.

interface PersonalityOrbProps {
  params: PersonalityParams;
  className?: string;
}

// Warm / cool color pairs the fragment shader mixes between based on
// `warmth`. Picked for contrast on the dark canvas background.
const COOL_A = new THREE.Color("#3b82f6"); // blue-500
const COOL_B = new THREE.Color("#8b5cf6"); // violet-500
const WARM_A = new THREE.Color("#f59e0b"); // amber-500
const WARM_B = new THREE.Color("#ec4899"); // pink-500

// Vertex shader: displaces the icosphere surface along its normals using a
// cheap sin-lattice noise. Amplitude & frequency come from params so the
// shape ranges from "smooth crystal" to "molten blob".
const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform float uFreq;
  uniform float uSymmetry;
  varying vec3 vNormal;
  varying vec3 vPos;
  varying float vDisp;

  float lattice(vec3 p) {
    // Symmetry pulls the noise toward abs() patterns (mirror planes).
    vec3 q = mix(p, abs(p), uSymmetry);
    return
      sin(q.x * uFreq + uTime * 0.5) *
      sin(q.y * uFreq + uTime * 0.4) *
      sin(q.z * uFreq + uTime * 0.6);
  }

  void main() {
    vec3 n = normalize(normal);
    float d = lattice(position * 1.5 + uTime * 0.15);
    vDisp = d;
    vPos = position;
    vec3 displaced = position + n * d * uAmp;
    vNormal = normalize(normalMatrix * n);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

// Fragment shader: mixes cool/warm palettes by warmth, adds a fresnel rim
// and a subtle glow so the orb reads as lit even without a real light pass.
const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uCoolA;
  uniform vec3 uCoolB;
  uniform vec3 uWarmA;
  uniform vec3 uWarmB;
  uniform float uWarmth;
  varying vec3 vNormal;
  varying float vDisp;

  void main() {
    float t = clamp(vDisp * 0.5 + 0.5, 0.0, 1.0);
    vec3 cool = mix(uCoolA, uCoolB, t);
    vec3 warm = mix(uWarmA, uWarmB, t);
    vec3 base = mix(cool, warm, uWarmth);

    // Fresnel-ish rim using the normal's z component — cheap and readable.
    vec3 n = normalize(vNormal);
    float rim = pow(1.0 - clamp(abs(n.z), 0.0, 1.0), 2.4);
    vec3 col = base + rim * 0.55;

    // Subtle inner glow on displacement peaks.
    col += vec3(0.08, 0.06, 0.14) * max(vDisp, 0.0);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function Sculpture({ params }: { params: PersonalityParams }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  // Higher detail for crystalline / structured personalities (more triangles
  // = sharper facets read as deliberate). Organic stays lower poly so the
  // noise displacement reads as wobbly.
  const geometry = useMemo(() => {
    const detail = Math.round(2 + params.structure * 3); // 2..5
    return new THREE.IcosahedronGeometry(1.2, detail);
  }, [params.structure]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      // Organic → high displacement, crystalline → near-zero.
      uAmp: { value: 0.08 + (1 - params.structure) * 0.32 },
      // Density bumps the noise frequency so richer personalities get more
      // surface complexity per unit area.
      uFreq: { value: 0.9 + params.density * 2.4 },
      uSymmetry: { value: params.symmetry },
      uCoolA: { value: COOL_A },
      uCoolB: { value: COOL_B },
      uWarmA: { value: WARM_A },
      uWarmB: { value: WARM_B },
      uWarmth: { value: params.warmth },
    }),
    [params]
  );

  useFrame((state, delta) => {
    if (meshRef.current) {
      const spin = 0.08 + params.energy * 0.7;
      meshRef.current.rotation.y += delta * spin;
      meshRef.current.rotation.x += delta * spin * 0.35;
    }
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
      />
    </mesh>
  );
}

function Halo({ params }: { params: PersonalityParams }) {
  const pointsRef = useRef<THREE.Points>(null);

  // density → more particles; extroversion → larger orbit radius & faster
  // outward drift; introversion keeps them tight.
  const { positions, count, size } = useMemo(() => {
    const n = Math.round(120 + params.density * 520);
    const arr = new Float32Array(n * 3);
    const rBase = 1.9 + params.extroversion * 0.8;
    for (let i = 0; i < n; i++) {
      const r = rBase + Math.random() * 1.1;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    const s = 0.015 + params.density * 0.04;
    return { positions: arr, count: n, size: s };
  }, [params.density, params.extroversion]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    // Introverts: inward counter-rotation; extroverts: outward, faster.
    const dir = params.extroversion > 0.5 ? 1 : -1;
    const speed = 0.04 + params.energy * 0.35;
    pointsRef.current.rotation.y += delta * speed * dir;
    pointsRef.current.rotation.x += delta * speed * 0.3 * dir;
  });

  const haloColor = params.warmth > 0.5 ? "#fde68a" : "#bfdbfe";

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={haloColor}
        transparent
        opacity={0.65}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// Bipolar legend rows — each row names the two ends of a dimension so the
// user can read the orb without any other copy. The bar position sits between
// the two labels proportional to the dimension value; no value for the user
// to decode alone. Labels mirror the semantic descriptions in the /api/summary
// system prompt so the LLM's mental model and the UI legend stay in sync.
const LEGEND_ROWS: ReadonlyArray<{
  key: keyof PersonalityParams;
  low: string;
  high: string;
}> = [
  { key: "warmth", low: "Detached", high: "Relational" },
  { key: "energy", low: "Calm", high: "Restless" },
  { key: "structure", low: "Organic", high: "Structured" },
  { key: "density", low: "Minimal", high: "Complex" },
  { key: "extroversion", low: "Inward", high: "Outward" },
  { key: "symmetry", low: "Experimental", high: "Conventional" },
];

function Legend({ params }: { params: PersonalityParams }) {
  return (
    <div className="px-1 pt-5 space-y-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-gray-400 font-bold mb-3">
        What this shape means
      </p>
      {LEGEND_ROWS.map(({ key, low, high }) => {
        const value = params[key];
        // value drives the dot position along the bar (0 = far left, 1 = far right).
        const leftPct = Math.max(0, Math.min(1, value)) * 100;
        return (
          <div key={key} className="grid grid-cols-[88px_1fr_88px] items-center gap-3">
            <span className="text-[11px] text-gray-400 text-right font-medium tracking-wide">
              {low}
            </span>
            <div className="relative h-[6px] rounded-full bg-gray-100">
              {/* midline marker so you can see which side the dot leans toward */}
              <span className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-200" />
              <span
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[#171717] shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                style={{ left: `${leftPct}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-700 text-left font-medium tracking-wide">
              {high}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PersonalityOrb({ params, className }: PersonalityOrbProps) {
  return (
    <div className={className}>
      <div className="relative w-full aspect-[16/10] rounded-[28px] overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#1f2937_0%,#0b0f1a_75%)]">
        <Canvas
          camera={{ position: [0, 0, 4.2], fov: 48 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false }}
        >
          <color attach="background" args={["#0b0f1a"]} />
          <Sculpture params={params} />
          <Halo params={params} />
        </Canvas>
      </div>
      <Legend params={params} />
    </div>
  );
}
