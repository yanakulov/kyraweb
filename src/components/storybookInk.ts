import type { MeshStandardMaterial, Texture } from 'three';

/** Ink is part of the parchment's lit surface, not a picture floating above it. */
export function inscribePage(material: MeshStandardMaterial, landscape: Texture, ink: { value: number }, colour: { value: number }) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { storyImage: { value: landscape }, ink, colour });
    shader.vertexShader = 'varying vec2 storyUV;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 pageWorld = modelMatrix * vec4(transformed, 1.0);
      storyUV = vec2(pageWorld.x / 2.6 + .5, .5 - (pageWorld.z + .15) / 1.625);`);
    shader.fragmentShader = `
      uniform sampler2D storyImage; uniform float ink; uniform float colour; varying vec2 storyUV;
      float inkNoise(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float valueAt(vec2 p) { return dot(texture2D(storyImage, p).rgb, vec3(.2126, .7152, .0722)); }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 uv = clamp(storyUV, 0.0, 1.0), texel = vec2(1.0/320.0, 1.0/200.0);
      vec3 pigment = texture2D(storyImage, uv).rgb;
      float grey = valueAt(uv);
      float gx = valueAt(uv+vec2(texel.x,-texel.y)) + 2.0*valueAt(uv+vec2(texel.x,0.0)) + valueAt(uv+texel)
               - valueAt(uv-texel) - 2.0*valueAt(uv-vec2(texel.x,0.0)) - valueAt(uv+vec2(-texel.x,texel.y));
      float gy = valueAt(uv+vec2(-texel.x,texel.y)) + 2.0*valueAt(uv+vec2(0.0,texel.y)) + valueAt(uv+texel)
               - valueAt(uv-texel) - 2.0*valueAt(uv-vec2(0.0,texel.y)) - valueAt(uv+vec2(texel.x,-texel.y));
      float contour = smoothstep(.075, .32, length(vec2(gx,gy)));
      float hatch = (1.0-smoothstep(.035,.13,abs(fract((uv.x+uv.y*.7)*180.0)-.5))) * clamp((.25-grey)*3.0,0.0,.28);
      // Irregular margins let the paper show through; the original letterbox isn't ink.
      float edge = min(min(storyUV.x, 1.0-storyUV.x), min(storyUV.y-.12, .96-storyUV.y));
      float feather = smoothstep(.015, .07, edge + (inkNoise(floor(uv*160.0))-.5)*.02);
      float arrival = uv.x*.48 + (1.0-uv.y)*.34 + inkNoise(floor(uv*vec2(90.0,60.0)))*.12;
      float drawn = smoothstep(arrival, arrival+.06, ink);
      float stroke = clamp(contour*.78+hatch,0.0,.9)*drawn*feather;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.033,.016,.007), stroke);
      diffuseColor.rgb = mix(diffuseColor.rgb, pigment * mix(vec3(1.0), diffuseColor.rgb*1.8, .12), colour*feather);
      float drawingTip = exp(-pow((ink-arrival-.03)*60.0,2.0))*contour*feather*(1.0-colour)*step(.01,ink);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.7,.72,.17) * drawingTip;`);
  };
  material.customProgramCacheKey = () => 'storybook-ink-v1';
}

export const storybookFilm = {
  uniforms: { tDiffuse: { value: null }, effect: { value: 1 }, toneMappingExposure: { value: .95 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float effect; varying vec2 vUv;
    #include <tonemapping_pars_fragment>
    void main() {
      vec4 scene = texture2D(tDiffuse,vUv);
      vec3 film = ACESFilmicToneMapping(scene.rgb * vec3(1.025,1.0,.975));
      float vignette = 1.0 - .3*smoothstep(.10,.48,dot((vUv-.5)*vec2(1.0,.85),(vUv-.5)*vec2(1.0,.85)));
      gl_FragColor=vec4(mix(scene.rgb,film*vignette,effect),scene.a);
    }`,
};
