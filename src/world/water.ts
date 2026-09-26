import * as THREE from 'three';

/** Stylized animated water with fresnel tint, sparkles and shore foam. */
export function makeWaterMaterial(opts: { deep: string; shallow: string; waves: number; foam?: boolean }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(opts.deep) },
        uShallow: { value: new THREE.Color(opts.shallow) },
        uSky: { value: new THREE.Color('#bfe3ff') },
        uWaves: { value: opts.waves },
        uFoam: { value: opts.foam ? 1 : 0 },
        uNight: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform float uTime, uWaves;
      varying vec3 vWorld;
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec3 p = position;
        vec4 w = modelMatrix * vec4(p, 1.0);
        float h = sin(w.x * 0.35 + uTime * 1.3) * 0.5 + sin(w.z * 0.27 - uTime * 1.1) * 0.5 + sin((w.x + w.z) * 0.8 + uTime * 2.0) * 0.2;
        w.y += h * uWaves;
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFoam, uNight;
      uniform vec3 uDeep, uShallow, uSky;
      varying vec3 vWorld;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec3 view = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(view.y, 0.0), 3.0);
        float n = noise(vWorld.xz * 0.6 + uTime * 0.25) * 0.6 + noise(vWorld.xz * 1.7 - uTime * 0.4) * 0.4;
        vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 0.8, n));
        col = mix(col, uSky, fres * 0.45);
        float caustic = smoothstep(0.62, 0.72, noise(vWorld.xz * 2.2 + vec2(uTime * 0.3, -uTime * 0.2)));
        col += caustic * 0.12 * (1.0 - uNight * 0.6);
        float sparkle = step(0.985, hash(floor(vWorld.xz * 6.0) + floor(uTime * 3.0))) * (1.0 - uNight * 0.7);
        col += sparkle * 0.6;
        float foam = uFoam * smoothstep(0.984, 0.999, vUv.x + sin(vWorld.z * 0.4 + uTime * 1.5) * 0.004 + noise(vWorld.xz * 2.0 + uTime) * 0.006);
        col = mix(col, vec3(1.0), foam);
        col *= mix(1.0, 0.45, uNight);
        gl_FragColor = vec4(col, 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
