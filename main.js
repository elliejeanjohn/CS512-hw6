const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec3 aTangent;
in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec2 vTexCoord;

void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;

  // Inverse transpose for potential non-uniform scalings
  mat3 mv = mat3(uModelView);
  vNormal = transpose(inverse(mv)) * aNormal;


  vTangent = mv * aTangent;
  vTexCoord = aTexCoord;
  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec2 vTexCoord;

uniform vec3 uLightPos;
uniform sampler2D uTexture;
uniform int uMapping;  // 0 = bump mapping, 1 = normal mapping

out vec4 fragColor;

const float bumpScale = 3.0;

// convert RGB to luminance (Rec._601 standard, https://en.wikipedia.org/wiki/Rec._601)
// or you can use a height map texture
float height(vec2 uv) {
  vec3 c = texture(uTexture, uv).rgb;

  // Brighter colors represent higher parts of the surface.
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  // Tangent frame (T, B, N)
  vec3 N = normalize(vNormal);
  vec3 T = normalize(vTangent - dot(vTangent, N) * N);
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);

  vec3 baseColor;
  vec3 n;

  if (uMapping == 0) {
    // Bump mapping: tilt the normal against the gradient of the height field
    vec2 du = vec2(1.0 / float(textureSize(uTexture, 0).x), 0.0);
    vec2 dv = vec2(0.0, 1.0 / float(textureSize(uTexture, 0).y));
    float dhdu = (height(vTexCoord + du) - height(vTexCoord - du)) * 0.5;
    float dhdv = (height(vTexCoord + dv) - height(vTexCoord - dv)) * 0.5;
    n = normalize(vec3(-bumpScale * dhdu, -bumpScale * dhdv, 1.0));
    baseColor = texture(uTexture, vTexCoord).rgb;
    } else if (uMapping == 1) {
      // Normal mapping: RGB values encode a surface direction.
      n = normalize(texture(uTexture, vTexCoord).rgb * 2.0 - 1.0);
      baseColor = vec3(0.95, 0.22, 0.08);
    } else {
      // Regular texture mapping: RGB values are surface colors.
      baseColor = texture(uTexture, vTexCoord).rgb;

      // Keep the sphere's smooth surface normal.
      n = vec3(0.0, 0.0, 1.0);
    }

  vec3 Ka = 0.2 * baseColor;
  vec3 Kd = 0.8 * baseColor;
  vec3 Ks = vec3(0.5);
  float shininess = 32.0;

  N = normalize(TBN * n);
  vec3 L = normalize(uLightPos - vPosition);
  vec3 V = normalize(-vPosition);
  vec3 R = reflect(-L, N);

  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(V, R), 0.0), shininess);

  fragColor = vec4(Ka + Kd * diff + Ks * spec, 1.0);
}
`;

// WebGL setup
const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

const ATTRIBUTES = { aPosition: 0, aNormal: 1, aTexCoord: 2, aTangent: 3 };

function createProgram(vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  for (const name in ATTRIBUTES) gl.bindAttribLocation(prog, ATTRIBUTES[name], name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

// Shader editors
const vertEditor = document.getElementById("vertEditor");
const fragEditor = document.getElementById("fragEditor");
const shaderError = document.getElementById("shaderError");
vertEditor.value = VERTEX_SHADER;
fragEditor.value = FRAGMENT_SHADER;

let program, uModelView, uProjection, uLightPos, uMapping;

function updateProgram() {
  try {
    const prog = createProgram(vertEditor.value, fragEditor.value);
    gl.deleteProgram(program);
    program = prog;
    gl.useProgram(program);
    uModelView = gl.getUniformLocation(program, "uModelView");
    uProjection = gl.getUniformLocation(program, "uProjection");
    uLightPos = gl.getUniformLocation(program, "uLightPos");
    uMapping = gl.getUniformLocation(program, "uMapping");
    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);
    shaderError.textContent = "";
  } catch (e) {
    shaderError.textContent = e.message.replace(/\0/g, "");
  }
}
updateProgram();
vertEditor.addEventListener("input", updateProgram);
fragEditor.addEventListener("input", updateProgram);

function bindAttribute(name, data, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], size, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
}

function createMesh({ positions, normals, tangents, texCoords, indices }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttribute("aPosition", positions, 3);
  bindAttribute("aNormal", normals, 3);
  bindAttribute("aTangent", tangents, 3);
  bindAttribute("aTexCoord", texCoords, 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vao, count: indices.length };
}

const cubeMesh = createMesh(createCube());
const cylinderMesh = createMesh(createCylinder());
const sphereMesh = createMesh(createSphere());
const coneMesh = createMesh(createCone());
const torusMesh = createMesh(createTorus());

function loadTexture(url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 255, 255]));

  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);  // images start at the top row, texture coordinates at the bottom
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  };
  image.src = url;
  return texture;
}

const brickTexture = loadTexture("brick.png");
const normalTexture = loadTexture("texture2.jpg");

function createSandTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 256;
  textureCanvas.height = 256;

  const ctx = textureCanvas.getContext("2d");

  // Sandy base color.
  ctx.fillStyle = "#d8c49a";
  ctx.fillRect(0, 0, 256, 256);

  // Small flecks suggest individual grains.
  for (let i = 0; i < 16000; i++) {
    const x = Math.floor(Math.random() * 256);
    const y = Math.floor(Math.random() * 256);
    const opacity = Math.random() * 0.25;

    ctx.fillStyle = `rgba(105, 80, 45, ${opacity})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    textureCanvas
  );

  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  );

  return texture;
}

function createCoralNormalTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 256;

  const ctx = textureCanvas.getContext("2d");
  const image = ctx.createImageData(
    textureCanvas.width,
    textureCanvas.height
  );

  const columns = 18;
  const rows = 6;
  const depth = 0.025;

  for (let y = 0; y < textureCanvas.height; y++) {
    const v = 1 - y / (textureCanvas.height - 1);
    const angleV = 2 * Math.PI * rows * v;
    const b = 0.5 + 0.5 * Math.cos(angleV);

    for (let x = 0; x < textureCanvas.width; x++) {
      const u = x / (textureCanvas.width - 1);
      const angleU = 2 * Math.PI * columns * u;
      const a = 0.5 + 0.5 * Math.cos(angleU);

      // Imagine a height surface with small rounded pits:
      // height = -depth * a^3 * b^3
      // These are its slopes in the u and v directions.
      const dhdu =
        depth * 3 * Math.PI * columns *
        Math.sin(angleU) * a * a * b * b * b;

      const dhdv =
        depth * 3 * Math.PI * rows *
        Math.sin(angleV) * a * a * a * b * b;

      // Tilt against the slopes, then normalize.
      const nx = -dhdu;
      const ny = -dhdv;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);

      const pixel = (y * textureCanvas.width + x) * 4;

      // Encode directions from [-1, 1] into RGB [0, 255].
      image.data[pixel] =
        (nx / length * 0.5 + 0.5) * 255;

      image.data[pixel + 1] =
        (ny / length * 0.5 + 0.5) * 255;

      image.data[pixel + 2] =
        (nz / length * 0.5 + 0.5) * 255;

      image.data[pixel + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    textureCanvas
  );

  gl.generateMipmap(gl.TEXTURE_2D);

  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  );

  return texture;
}

function createPearlTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 256;

  const ctx = textureCanvas.getContext("2d");

  // The pearl's underlying colors stay the same.
  const gradient = ctx.createLinearGradient(
    0, 0,
    0, textureCanvas.height
  );

  gradient.addColorStop(0.00, "#fff8ed");
  gradient.addColorStop(0.20, "#f3dce8");
  gradient.addColorStop(0.40, "#e1eef5");
  gradient.addColorStop(0.60, "#fffaf2");
  gradient.addColorStop(0.80, "#eedfec");
  gradient.addColorStop(1.00, "#f8f5ec");

  function paint(time) {
    // Repaint the base so old light patterns disappear.
    ctx.shadowBlur = 0;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

    // Soft, bright curves suggest underwater light.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    ctx.lineWidth = 8;
    ctx.shadowColor = "white";
    ctx.shadowBlur = 8;

    for (let band = 0; band < 4; band++) {
      ctx.beginPath();

      for (let x = 0; x <= textureCanvas.width; x += 4) {
        const u = x / textureCanvas.width;

        const center = (band + 0.5) * textureCanvas.height / 4;

        const y =
          center +
          12 * Math.sin(2 * Math.PI * 2 * u + time * 0.7 + band) +
          6 * Math.sin(2 * Math.PI * 3 * u - time * 0.4);

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    }
  }

  paint(0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  // Allocate the texture and upload its first image.
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    textureCanvas
  );

  // Linear filtering works without generating mipmaps each frame.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_T,
    gl.CLAMP_TO_EDGE
  );

  let lastUpdate = -Infinity;

  function update(time) {
    // Update the texture at most 30 times per second.
    if (time - lastUpdate < 1 / 30) return;
    lastUpdate = time;

    paint(time);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Replace the existing texture's pixels.
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      textureCanvas
    );
  }

  return { texture, update };
}

function createShellTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 256;

  const ctx = textureCanvas.getContext("2d");
  const image = ctx.createImageData(
    textureCanvas.width,
    textureCanvas.height
  );

  const brown = [145, 101, 67];
  const ivory = [255, 245, 220];
  const turns = 6;

  for (let y = 0; y < textureCanvas.height; y++) {
    // Match WebGL's bottom-to-top texture coordinates.
    const v = 1 - y / (textureCanvas.height - 1);

    for (let x = 0; x < textureCanvas.width; x++) {
      const u = x / (textureCanvas.width - 1);

      // Diagonal bands become a spiral around the cone.
      const phase = 2 * Math.PI * (u + turns * v);

      // A smooth wave, narrowed into ivory ridges.
      const wave = 0.5 + 0.5 * Math.cos(phase);
      const band = Math.pow(wave, 8);

      const pixel = (y * textureCanvas.width + x) * 4;

      // Blend each color channel between pink and ivory.
      for (let channel = 0; channel < 3; channel++) {
        image.data[pixel + channel] =
          brown[channel] * (1 - band) + ivory[channel] * band;
      }

      image.data[pixel + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    textureCanvas
  );

  gl.generateMipmap(gl.TEXTURE_2D);

  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  );

  return texture;
}

const {
  texture: pearlTexture,
  update: updatePearlTexture
} = createPearlTexture();
const shellTexture = createShellTexture();
const coralNormalTexture = createCoralNormalTexture();
const sandTexture = createSandTexture();
const BUMP_MAPPING = 0;
const NORMAL_MAPPING = 1;
const TEXTURE_MAPPING = 2;

const objects = [
  { mesh: sphereMesh, texture: pearlTexture, mapping: TEXTURE_MAPPING, offset: [-2.7, 0, 0] },
  { mesh: coneMesh, texture: shellTexture, mapping: BUMP_MAPPING, offset: [0, 0, 0] },
  { mesh: torusMesh, texture: coralNormalTexture, mapping: NORMAL_MAPPING, offset: [2.7, 0.1, 0] },
  { mesh: cubeMesh, texture: sandTexture, mapping: TEXTURE_MAPPING, offset: [0, -1.2, 0], size: [5, 0.2, 3] }
];

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.015, 0.16, 0.23, 1);


const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
const lightWorld = [3, 4, 5];

// Interactive controls
let dragRotX = 0.2, dragRotY = -0.2;      // mouse drag
let camX = 0, camY = 0, camZ = -9;      // arrow keys, w, s
let sliderAngle = 0;                    // degrees
let spinning = false, spinAngle = 0;    // Start/Stop button

let mouseDown = false, lastX, lastY;
canvas.addEventListener("mousedown", e => { mouseDown = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => mouseDown = false);
window.addEventListener("mousemove", e => {
  if (!mouseDown) return;
  dragRotY += (e.clientX - lastX) * 0.01;
  dragRotX += (e.clientY - lastY) * 0.01;
  lastX = e.clientX; lastY = e.clientY;
});

document.addEventListener("keydown", e => {
  if (e.target === vertEditor || e.target === fragEditor) return;
  const step = 0.2;
  switch (e.key) {
    case "ArrowUp": camY -= step; break;
    case "ArrowDown": camY += step; break;
    case "ArrowLeft": camX += step; break;
    case "ArrowRight": camX -= step; break;
    case "w": camZ += step; break;
    case "s": camZ -= step; break;
    default: return;
  }
  e.preventDefault();
});

const axisSelect = document.getElementById("axisSelect");
document.getElementById("slider").addEventListener("input", e => {
  sliderAngle = Number(e.target.value);
  document.getElementById("sliderValue").textContent = sliderAngle;
});
document.getElementById("spinButton").addEventListener("click", () => spinning = !spinning);

// Render loop
let lastTime = 0;
function render(time) {
  const t = time / 1000;

  updatePearlTexture(t);

  if (spinning) spinAngle += t - lastTime;
  lastTime = t;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const view = translate(camX, camY, camZ);
  gl.uniformMatrix4fv(uProjection, false, projection);
  gl.uniform3fv(uLightPos, transformPoint(view, lightWorld));

  const axisRotation = ROTATE[axisSelect.value](sliderAngle * Math.PI / 180 + spinAngle);
  const rotation = multiply(multiply(rotateY(dragRotY), rotateX(dragRotX)), axisRotation);

  gl.activeTexture(gl.TEXTURE0);
  for (const { mesh, texture, mapping, offset, size = [1,1,1] } of objects) {
    const localModel = multiply(translate(...offset), scale(...size));

    const sceneModel = multiply(rotation, localModel);
    const modelView = multiply(view, sceneModel);

    gl.uniformMatrix4fv(uModelView, false, modelView);
    gl.uniform1i(uMapping, mapping);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
