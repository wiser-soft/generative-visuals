const defined = require('defined');
const BaseObject = require('./BaseObject');
const Polygon2D = require('../geometry/Polygon2D');
const { resampleLineByCount } = require('../util/polyline');
const RND = require('../util/random');

const getPolygon = require('../geometry/getPolygon');
const getRectangle = require('../geometry/getRectangle');
const getBlob = require('../geometry/getBlob');
const getSVGShape = require('../geometry/getSVGShape');

const getShapeMaterial = require('../material/getShapeMaterial');

const getCentroid = path => {
  return path
    .reduce((sum, point) => {
      return sum.add(point);
    }, new THREE.Vector2())
    .divideScalar(path.length);
};

module.exports = class Shape extends BaseObject {
  constructor(app) {
    super(app);

    // Debugging with wireframe material to see mesh structure
    const debugMaterial = false;

    const geometry = new Polygon2D();
    const material = debugMaterial
      ? new THREE.MeshBasicMaterial({ color: 'black', wireframe: true, side: THREE.DoubleSide })
      : getShapeMaterial();

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.add(this.mesh);

    this.rotationSpeed = 0;

    // avoid z-fighting a bit if possible?
    this.position.z = RND.randomFloat(0, 1);
  }

  randomize(opt = {}) {
    const shapeType = opt.shapeType || 'blob';
    const materialType = opt.materialType || 'fill';

    // get a new list of points
    let points;
    let svg;
    if (shapeType === 'polygon') points = getPolygon();
    else if (shapeType === 'square') points = getPolygon({ sides: 4 });
    else if (shapeType === 'rectangle-blob') points = getRectangle();
    else if (shapeType === 'triangle') points = getPolygon({ sides: 3 });
    else if (shapeType === 'circle') points = getPolygon({ sides: 32, jitter: false });
    else if (shapeType === 'circle-blob') points = getBlob();
    else if (shapeType === 'svg-heart') svg = getSVGShape('heart');
    else if (shapeType === 'svg-feather') svg = getSVGShape('feather');
    else if (shapeType === 'svg-lightning') svg = getSVGShape('lightning');
    else points = getBlob();

    // SVG is already triangulated
    if (!points && svg) {
      points = svg.positions;
    }

    // get centroid of polygon
    const centroid = getCentroid(points);

    // generate the new (triangulated) geometry data
    if (svg) {
      this.mesh.geometry.setComplex(svg.positions, svg.cells);
    } else {
      // If we should 'round' the points with splines
      const round = shapeType !== 'circle';
      if (round) {
        const minTension = shapeType === 'rectangle-blob' ? 0 : 0.1;
        const maxTension = shapeType === 'rectangle-blob' ? 1 : 0.25;
        const roundTension = RND.randomBoolean() ? minTension : RND.randomFloat(minTension, maxTension);
        const roundType = shapeType === 'circle-blob' ? 'chordal' : 'catmullrom';
        const roundSegments = shapeType === 'circle-blob' ? 30 : 40;
        const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, p.y, 0)));
        curve.closed = true;
        curve.tension = roundTension;
        curve.curveType = roundType;
        points = curve
          .getSpacedPoints(roundSegments)
          .slice(0, roundSegments)
          .map(p => new THREE.Vector2(p.x, p.y));
      }

      // resample along the path so we can add high frequency noise to give it rough edges in vert shader
      const finalCount = RND.randomInt(100, 400);
      const resampled = resampleLineByCount(points, finalCount, true);
      this.mesh.geometry.setPoints(resampled);
    }

    // get a new material with color etc
    if (this.mesh.material.randomize) {
      this.mesh.material.randomize({
        ...opt,
        centroid,
        materialType,
        tiles: this.app.assets.tiles
      });
    }

    this.rotationSpeed = opt.rotationSpeed || 0;
  }

  setAnimation(value) {
    // animate in / out state
    if (this.mesh.material.uniforms) {
      this.mesh.material.uniforms.animate.value = value;
    }
  }

  update(time, dt) {
    // animation values
    this.rotation.z += this.rotationSpeed;
    if (this.mesh.material.uniforms) {
      this.mesh.material.uniforms.time.value = time;
      this.mesh.material.uniforms.resolution.value.set(this.app.width, this.app.height);
    }
  }

  frame(frame, time) {
    // called on every 'tick', i.e. a fixed fps lower than 60, to give a jittery feeling
    if (this.mesh.material.uniforms) this.mesh.material.uniforms.frame.value = time;
  }
};
