export type IndexedSurface = { width: number; height: number; palette: readonly number[]; transparentIndex: number };

export function expandIndexedPixels(pixels: Uint8Array, palette: readonly number[], transparentIndex: number, out: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i++) {
    const index = pixels[i], p = index * 3, d = i * 4;
    out[d] = palette[p]; out[d + 1] = palette[p + 1]; out[d + 2] = palette[p + 2];
    out[d + 3] = index === transparentIndex ? 0 : 255;
  }
}

export function buildIndexedCanvas(surface: IndexedSurface, pixels: Uint8Array, transparentBlack = false) {
  const canvas = document.createElement("canvas");
  canvas.width = surface.width; canvas.height = surface.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  const data = ctx.createImageData(surface.width, surface.height);
  expandIndexedPixels(pixels, surface.palette, surface.transparentIndex, data.data);
  // The original HUD uses black as a compositing key at more than one index.
  if (transparentBlack) for (let i = 0; i < data.data.length; i += 4) {
    if (data.data[i] === 0 && data.data[i + 1] === 0 && data.data[i + 2] === 0) data.data[i + 3] = 0;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** Palette lookup on the GPU. A 2D fallback uses the same indices and palette.
 * The resulting layer composes with existing RGBA actors, UI and subtitles.
 */
export class IndexedRenderer {
  private gpuCanvas = document.createElement("canvas");
  private cpuCanvas: HTMLCanvasElement | null = null;
  private cpuContext: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private indices: WebGLTexture | null = null;
  private paletteTexture: WebGLTexture | null = null;
  private lost = false;
  private disposed = false;
  private palette: readonly number[];
  private contextLost = (event: Event) => { event.preventDefault(); this.lost = true; };

  constructor(readonly surface: IndexedSurface, preferGpu = true) {
    this.palette = surface.palette;
    this.gpuCanvas.width = surface.width; this.gpuCanvas.height = surface.height;
    this.gpuCanvas.addEventListener("webglcontextlost", this.contextLost);
    if (preferGpu) {
      try { this.initGpu(); } catch (error) {
        console.warn("Indexed renderer is using Canvas 2D", error);
        this.releaseGpu(); this.lost = true;
      }
    }
  }

  get backend() { return this.gl && !this.lost ? "webgl2" : "canvas2d"; }

  private initGpu() {
    const gl = this.gpuCanvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) return;
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(log ?? "Shader failed");
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
      void main() {
        vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
      }`);
    const fragment = compile(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      precision highp usampler2D;
      uniform usampler2D uIndices;
      uniform sampler2D uPalette;
      uniform int uHeight;
      uniform int uTransparent;
      out vec4 color;
      void main() {
        ivec2 p = ivec2(int(gl_FragCoord.x), uHeight - 1 - int(gl_FragCoord.y));
        int index = int(texelFetch(uIndices, p, 0).r);
        color = texelFetch(uPalette, ivec2(index, 0), 0);
        if (index == uTransparent) color.a = 0.0;
      }`);
    const program = gl.createProgram()!; this.program = program;
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Link failed");
    gl.useProgram(program); gl.disable(gl.DITHER); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const texture = (unit: number) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.indices = texture(0);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8UI, this.surface.width, this.surface.height);
    this.paletteTexture = texture(1);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 256, 1);
    gl.uniform1i(gl.getUniformLocation(program, "uIndices"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uPalette"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "uHeight"), this.surface.height);
    gl.uniform1i(gl.getUniformLocation(program, "uTransparent"), this.surface.transparentIndex);
    this.setPalette(this.palette);
  }

  setPalette(palette: readonly number[]) {
    if (palette.length !== 768) throw new Error("Expected 256 RGB palette entries");
    this.palette = palette;
    if (this.gl && !this.lost) {
      const rgba = new Uint8Array(1024);
      for (let i = 0; i < 256; i++) {
        rgba.set(palette.slice(i * 3, i * 3 + 3), i * 4); rgba[i * 4 + 3] = 255;
      }
      const gl = this.gl; gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    }
  }

  render(pixels: Uint8Array): HTMLCanvasElement {
    if (this.disposed) throw new Error("Indexed renderer is disposed");
    if (pixels.length !== this.surface.width * this.surface.height) throw new Error("Invalid indexed frame size");
    if (this.gl && !this.lost && !this.gl.isContextLost()) {
      const gl = this.gl;
      gl.useProgram(this.program); gl.viewport(0, 0, this.surface.width, this.surface.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.indices);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.surface.width, this.surface.height, gl.RED_INTEGER, gl.UNSIGNED_BYTE, pixels);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return this.gpuCanvas;
    }
    if (!this.cpuCanvas) {
      this.cpuCanvas = document.createElement("canvas");
      this.cpuCanvas.width = this.surface.width; this.cpuCanvas.height = this.surface.height;
      this.cpuContext = this.cpuCanvas.getContext("2d");
      if (!this.cpuContext) throw new Error("Canvas 2D fallback unavailable");
      this.imageData = this.cpuContext.createImageData(this.surface.width, this.surface.height);
    }
    expandIndexedPixels(pixels, this.palette, this.surface.transparentIndex, this.imageData!.data);
    this.cpuContext!.putImageData(this.imageData!, 0, 0);
    return this.cpuCanvas;
  }

  private releaseGpu() {
    this.gl?.deleteTexture(this.indices); this.gl?.deleteTexture(this.paletteTexture); this.gl?.deleteProgram(this.program);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.gpuCanvas.removeEventListener("webglcontextlost", this.contextLost);
    this.releaseGpu(); this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gpuCanvas.width = 1;
    if (this.cpuCanvas) this.cpuCanvas.width = 1;
    this.imageData = null; this.cpuContext = null; this.cpuCanvas = null; this.gl = null;
  }
}
