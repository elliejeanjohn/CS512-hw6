function createCube() {
  const positions = new Float32Array([
    -1, -1,  1,   1, -1,  1,   1,  1,  1,  -1,  1,  1,   // front
     1, -1, -1,  -1, -1, -1,  -1,  1, -1,   1,  1, -1,   // back
    -1,  1,  1,   1,  1,  1,   1,  1, -1,  -1,  1, -1,   // top
    -1, -1, -1,   1, -1, -1,   1, -1,  1,  -1, -1,  1,   // bottom
     1, -1,  1,   1, -1, -1,   1,  1, -1,   1,  1,  1,   // right
    -1, -1, -1,  -1, -1,  1,  -1,  1,  1,  -1,  1, -1    // left
  ]);
  const faceNormals = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
  const normals = new Float32Array(faceNormals.flatMap(n => [...n, ...n, ...n, ...n]));

  // Tangent; bitangent = cross(N, T)
  const faceTangents = [[1, 0, 0], [-1, 0, 0], [1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]];
  const tangents = new Float32Array(faceTangents.flatMap(t => [...t, ...t, ...t, ...t]));

  const texCoords = new Float32Array(faceNormals.flatMap(() => [0, 0, 1, 0, 1, 1, 0, 1]));

  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,   // front
     4,  5,  6,   4,  6,  7,   // back
     8,  9, 10,   8, 10, 11,   // top
    12, 13, 14,  12, 14, 15,   // bottom
    16, 17, 18,  16, 18, 19,   // right
    20, 21, 22,  20, 22, 23    // left
  ]);
  return { positions, normals, tangents, texCoords, indices };
}


function createCylinder(segments = 64, uRepeat = 3) {
  const positions = [], normals = [], tangents = [], texCoords = [], indices = [];

  // Side: theta grows with u, so T points along the circle and B = cross(N, T) points up
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, theta = 2 * Math.PI * u;
    const s = Math.sin(theta), c = Math.cos(theta);
    for (const y of [-1, 1]) {
      positions.push(s, y, c);
      normals.push(s, 0, c);
      tangents.push(c, 0, -s);
      texCoords.push(u * uRepeat, (y + 1) / 2);
    }
  }
  for (let i = 0; i < segments; i++) {
    const k = 2 * i;
    indices.push(k, k + 2, k + 3, k, k + 3, k + 1);
  }

  // Caps: planar mapping of x, z into the texture, T = +x on both
  for (const y of [1, -1]) {
    const center = positions.length / 3;
    positions.push(0, y, 0);
    normals.push(0, y, 0);
    tangents.push(1, 0, 0);
    texCoords.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const theta = 2 * Math.PI * i / segments;
      const s = Math.sin(theta), c = Math.cos(theta);
      positions.push(s, y, c);
      normals.push(0, y, 0);
      tangents.push(1, 0, 0);
      texCoords.push(0.5 + 0.5 * s, 0.5 - 0.5 * y * c);  // keeps cross(N, T) along +v
    }
    for (let i = 0; i < segments; i++) {
      const a = center + 1 + i, b = a + 1;
      if (y > 0) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

function createSphere(latitudeBands = 24, longitudeBands = 48) {
  const positions = [];
  const normals = [];
  const tangents = [];
  const texCoords = [];
  const indices = [];

  // Create vertices from the south pole to the north pole.
  for (let row = 0; row <= latitudeBands; row++) {
    const v = row / latitudeBands;
    const latitude = -Math.PI / 2 + v * Math.PI;

    const ringRadius = Math.cos(latitude);
    const y = Math.sin(latitude);

    for (let col = 0; col <= longitudeBands; col++) {
      const u = col / longitudeBands;
      const longitude = u * 2 * Math.PI;

      const x = ringRadius * Math.sin(longitude);
      const z = ringRadius * Math.cos(longitude);

      positions.push(x, y, z);

      // For a sphere of radius 1 centered at the origin,
      // the position is also the outward unit normal.
      normals.push(x, y, z);

      // Direction along the surface as u increases.
      tangents.push(
        Math.cos(longitude),
        0,
        -Math.sin(longitude)
      );

      texCoords.push(u, v);
    }
  }

  // Each row includes a duplicated vertex at the texture seam.
  const verticesPerRow = longitudeBands + 1;

  // Connect neighboring rows with triangles.
  for (let row = 0; row < latitudeBands; row++) {
    for (let col = 0; col < longitudeBands; col++) {
      const a = row * verticesPerRow + col;
      const b = a + verticesPerRow;

      // Skip the collapsed triangle at the south pole.
      if (row > 0) {
        indices.push(a, a + 1, b);
      }

      // Skip the collapsed triangle at the north pole.
      if (row < latitudeBands - 1) {
        indices.push(a + 1, b + 1, b);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

function createCone(segments = 64) {
  const positions = [];
  const normals = [];
  const tangents = [];
  const texCoords = [];
  const indices = [];

  // Radius = 1 and height = 2, so the side's slope is 1/2.
  const normalLength = Math.sqrt(1 + 0.5 * 0.5);

  // Side surface: a base vertex and a tip vertex per angle.
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const angle = u * 2 * Math.PI;

    const s = Math.sin(angle);
    const c = Math.cos(angle);

    for (const v of [0, 1]) {
      const radius = 1 - v;
      const y = -1 + 2 * v;

      positions.push(radius * s, y, radius * c);

      // Side normals point outward and slightly upward.
      normals.push(
        s / normalLength,
        0.5 / normalLength,
        c / normalLength
      );

      tangents.push(c, 0, -s);
      texCoords.push(u, v);
    }
  }

  // One triangle connects each base edge to the tip.
  for (let i = 0; i < segments; i++) {
    const k = 2 * i;
    indices.push(k, k + 2, k + 1);
  }

  // Bottom cap: start with its center vertex.
  const center = positions.length / 3;

  positions.push(0, -1, 0);
  normals.push(0, -1, 0);
  tangents.push(1, 0, 0);
  texCoords.push(0.5, 0.5);

  // Add the cap's circular edge.
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * 2 * Math.PI;

    const s = Math.sin(angle);
    const c = Math.cos(angle);

    positions.push(s, -1, c);
    normals.push(0, -1, 0);
    tangents.push(1, 0, 0);

    // Map the circular cap into the texture image.
    texCoords.push(0.5 + 0.5 * s, 0.5 + 0.5 * c);
  }

  // Connect the center to neighboring edge vertices.
  for (let i = 0; i < segments; i++) {
    const a = center + 1 + i;
    const b = a + 1;
    indices.push(center, b, a);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

function createTorus(
  majorRadius = 0.8,
  minorRadius = 0.3,
  ringSegments = 64,
  tubeSegments = 24
) {
  const positions = [];
  const normals = [];
  const tangents = [];
  const texCoords = [];
  const indices = [];

  // Travel around the large ring.
  for (let i = 0; i <= ringSegments; i++) {
    const u = i / ringSegments;
    const ringAngle = u * 2 * Math.PI;

    const cosU = Math.cos(ringAngle);
    const sinU = Math.sin(ringAngle);

    // Travel around the small circular tube.
    for (let j = 0; j <= tubeSegments; j++) {
      const v = j / tubeSegments;
      const tubeAngle = v * 2 * Math.PI;

      const cosV = Math.cos(tubeAngle);
      const sinV = Math.sin(tubeAngle);

      const distance = majorRadius + minorRadius * cosV;

      positions.push(
        distance * cosU,
        distance * sinU,
        minorRadius * sinV
      );

      // Point outward from the tube's centerline.
      normals.push(
        cosV * cosU,
        cosV * sinU,
        sinV
      );

      // Direction along the large ring as u increases.
      tangents.push(-sinU, cosU, 0);

      texCoords.push(u, v);
    }
  }

  const verticesPerRing = tubeSegments + 1;

  // Connect adjacent circles with pairs of triangles.
  for (let i = 0; i < ringSegments; i++) {
    for (let j = 0; j < tubeSegments; j++) {
      const a = i * verticesPerRing + j;
      const b = a + verticesPerRing;

      indices.push(
        a, b, b + 1,
        a, b + 1, a + 1
      );
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}
