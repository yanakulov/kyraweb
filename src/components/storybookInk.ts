import { Vector2, type MeshStandardMaterial, type Texture } from 'three';

/** Robust black/white points keep a dim room as legible as a sunlit forest. */
export function illustrationLevels(pixels: Uint8ClampedArray): [number, number] {
  const histogram = new Uint32Array(256);
  let total = 0;
  for (let i=0;i<pixels.length;i+=4) if (pixels[i+3]) {
    histogram[Math.round(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)]++; total++;
  }
  if (!total) return [0,1];
  let count=0, black=0, white=255;
  for (let i=0;i<256;i++) { count+=histogram[i]; if(count<total*.06) black=i; if(count>=total*.94){white=i;break;} }
  return [Math.max(0,Math.min(black/255,white/255-.2)),Math.max(.2,white/255)];
}

function pageLevels(texture: Texture, fullFrame: boolean) {
  const source = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!source || typeof document === 'undefined') return new Vector2(0,1);
  const sample=document.createElement('canvas'); sample.width=160; sample.height=68;
  const context=sample.getContext('2d')!;
  context.drawImage(source,0,0,source.width,source.height*(fullFrame ? .68 : 1),0,0,160,68);
  return new Vector2(...illustrationLevels(context.getImageData(0,0,160,68).data));
}

/** Ink is part of the parchment's lit surface, not a picture floating above it. */
export function inscribePage(material: MeshStandardMaterial, landscape: Texture, ink: { value: number }, colour: { value: number }, fullFrame = false) {
  const storyImage = { value: landscape, wholeFrame: { value: fullFrame }, levels: { value: pageLevels(landscape,fullFrame) },
    update(texture: Texture, fullFrame: boolean) { this.value=texture; this.wholeFrame.value=fullFrame; this.levels.value=pageLevels(texture,fullFrame); }
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { storyImage, ink, colour, wholeFrame: storyImage.wholeFrame, inkLevels: storyImage.levels });
    shader.vertexShader = 'varying vec2 storyUV;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 pageWorld = modelMatrix * vec4(transformed, 1.0);
      storyUV = vec2(pageWorld.x / 2.6 + .5, .5 - (pageWorld.z + .15) / 1.625);`);
    shader.fragmentShader = `
      uniform sampler2D storyImage; uniform float ink; uniform float colour; uniform bool wholeFrame; uniform vec2 inkLevels; varying vec2 storyUV;
      float inkNoise(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float valueAt(vec2 p) { return dot(pow(max(texture2D(storyImage, p).rgb,vec3(0.0)),vec3(.4545)), vec3(.2126, .7152, .0722)); }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      // The manuscript shows the 320×136 location; its HUD returns only as we enter the full-colour game.
      float crop = wholeFrame ? 1.0-colour : 0.0;
      float pictureHeight = 1.0-.32*crop;
      vec2 artUV = vec2(storyUV.x, (storyUV.y-.5)/pictureHeight+.5);
      vec2 uv = clamp(artUV, 0.0, 1.0), texel = vec2(1.0/320.0, 1.0/200.0);
      uv.y = uv.y*pictureHeight + .32*crop;
      vec3 pigment = texture2D(storyImage, uv).rgb;
      float a=valueAt(uv-texel), b=valueAt(uv-vec2(0.0,texel.y)), c=valueAt(uv+vec2(texel.x,-texel.y));
      float d=valueAt(uv-vec2(texel.x,0.0)), e=valueAt(uv), f=valueAt(uv+vec2(texel.x,0.0));
      float g=valueAt(uv+vec2(-texel.x,texel.y)), h=valueAt(uv+vec2(0.0,texel.y)), i=valueAt(uv+texel);
      float grey=(a+c+g+i+2.0*(b+d+f+h)+4.0*e)/16.0;
      float contour = smoothstep(.045, .24, length(vec2(c+2.0*f+i-a-2.0*d-g,g+2.0*h+i-a-2.0*b-c))*.25);
      // Broad ink washes retain faces, clothes and architecture; hatching only textures the shadows.
      float tone = clamp((grey-inkLevels.x)/(inkLevels.y-inkLevels.x),0.0,1.0);
      float wash = (1.0-tone)*.84;
      float hatch = (1.0-smoothstep(.04,.15,abs(fract((artUV.x+artUV.y*.7)*80.0)-.5))) * (1.0-smoothstep(.2,.5,grey))*.045;
      // Irregular margins let the paper show through; the original letterbox isn't ink.
      float edge = min(min(artUV.x, 1.0-artUV.x), min(artUV.y-(wholeFrame ? .01 : .12), (wholeFrame ? .99 : .96)-artUV.y));
      float feather = smoothstep(.005, .045, edge + (inkNoise(floor(artUV*160.0))-.5)*.012);
      float arrival = artUV.x*.48 + (1.0-artUV.y)*.34 + inkNoise(floor(artUV*vec2(90.0,60.0)))*.12;
      float drawn = smoothstep(arrival, arrival+.06, ink);
      float stroke = clamp(wash+contour*.16+hatch,0.0,.94)*drawn*feather;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.033,.016,.007), stroke);
      diffuseColor.rgb = mix(diffuseColor.rgb, pigment * mix(vec3(1.0), diffuseColor.rgb*1.8, .12), colour*feather);
      float drawingTip = exp(-pow((ink-arrival-.03)*60.0,2.0))*contour*feather*(1.0-colour)*step(.01,ink);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.7,.72,.17) * drawingTip;`);
  };
  material.customProgramCacheKey = () => 'storybook-ink-v2';
  return storyImage;
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
